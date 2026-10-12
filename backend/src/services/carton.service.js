'use strict';
/**
 * Reglas de negocio del carton: venta (eleccion de numeros), habilitacion
 * tras la rendicion del vendedor y anulacion.
 */
const { withTransaction } = require('../config/db');
const sorteoModel = require('../models/sorteo.model');
const cartonModel = require('../models/carton.model');
const jugadorModel = require('../models/jugador.model');
const vendedorModel = require('../models/vendedor.model');
const catalogo = require('../models/catalogo.model');
const sorteoService = require('./sorteo.service');
const notificacion = require('./notificacion.service');
const ApiError = require('../utils/ApiError');
const {
  codigoCarton, validarNumeros,
  CARTON_FILAS, CARTON_COLUMNAS, CARTON_CELDAS,
} = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Vende un carton: reserva el cupo, guarda los numeros elegidos y dispara el
 * envio por WhatsApp. Si con este carton se completa el objetivo, inicia el
 * sorteo y avisa a todos los jugadores.
 *
 * El conteo de cupo se hace con SELECT ... FOR UPDATE dentro de la
 * transaccion, de modo que dos ventas simultaneas no superen el objetivo.
 */
async function venderCarton({ jugadorId, numeros, vendedorId = null }) {
  const jugador = await jugadorModel.buscarPorId(jugadorId);
  if (!jugador) throw ApiError.notFound('Jugador inexistente');

  const vendedor = await vendedorModel.buscarPorId(vendedorId || jugador.vendedor_id);
  if (!vendedor) throw ApiError.notFound('Vendedor inexistente');
  if (!vendedor.habilitado) throw ApiError.forbidden('El vendedor esta inhabilitado');

  const sorteo = await sorteoModel.abiertoParaVenta();
  if (!sorteo) throw ApiError.conflict('No hay ningun sorteo con la venta abierta');

  const error = validarNumeros(numeros, {
    min: sorteo.rango_min,
    max: sorteo.rango_max,
    cantidad: sorteo.numeros_por_carton,
  });
  if (error) throw ApiError.badRequest(error);

  const [estadoActivo, estadoImpago] = await Promise.all([
    catalogo.estadoCartonId('ACTIVO'),
    catalogo.estadoPagoId('IMPAGO'),
  ]);

  const { cartonId, completoElObjetivo } = await withTransaction(async (conn) => {
    const vendidos = await cartonModel.contarVendidos(sorteo.id, conn, true);
    if (vendidos >= sorteo.cartones_objetivo) {
      throw ApiError.conflict('Ya se vendieron todos los cartones de este sorteo');
    }

    const id = await cartonModel.crear(
      {
        codigo: `TMP-${Date.now()}`,           // provisorio: necesita el id autoincremental
        sorteo_id: sorteo.id,
        jugador_id: jugador.id,
        vendedor_id: vendedor.id,
        estado_id: estadoActivo,
        estado_pago_id: estadoImpago,
        habilitado: 0,
      },
      numeros.map(Number),
      conn
    );
    await cartonModel.actualizarCodigo(id, codigoCarton(sorteo.numero, id), conn);
    return { cartonId: id, completoElObjetivo: vendidos + 1 >= sorteo.cartones_objetivo };
  });

  const carton = await cartonModel.buscarPorId(cartonId);

  // Paso 5 del flujo: se envia el carton por WhatsApp (estado impago).
  notificacion
    .notificarCartonNuevo({ sorteo, jugador, vendedor, carton, numeros: carton.numeros })
    .catch((err) => logger.error({ err }, 'Fallo el envio del carton por WhatsApp'));

  // Paso 6: al completarse la venta arranca el sorteo.
  let sorteoIniciado = null;
  if (completoElObjetivo) {
    sorteoIniciado = await sorteoService
      .iniciarSorteo(sorteo.id)
      .catch((err) => {
        logger.error({ err }, 'No se pudo iniciar el sorteo automaticamente');
        return null;
      });
  }

  return { carton, sorteo_iniciado: sorteoIniciado };
}

/** El administrador habilita el carton cuando el vendedor rinde cuentas. */
async function habilitarCarton(cartonId) {
  const carton = await cartonModel.buscarPorId(cartonId);
  if (!carton) throw ApiError.notFound('Carton inexistente');
  if (carton.habilitado) return carton;

  await cartonModel.cambiarEstadoPago(cartonId, await catalogo.estadoPagoId('PAGADO'), true);
  const actualizado = await cartonModel.buscarPorId(cartonId);
  const jugador = await jugadorModel.buscarPorId(carton.jugador_id);
  const sorteo = await sorteoModel.buscarPorId(carton.sorteo_id);

  notificacion
    .notificarCartonHabilitado({ sorteo, carton: actualizado, jugador })
    .catch((err) => logger.error({ err }, 'Fallo el aviso de carton habilitado'));

  return actualizado;
}

/**
 * Reenvía el aviso de cartón habilitado (URL + usuario + clave).
 * Exige que el cartón esté habilitado: si no, el mensaje sería falso.
 */
async function notificarHabilitado(cartonId) {
  const carton = await cartonModel.buscarPorId(cartonId);
  if (!carton) throw ApiError.notFound('Carton inexistente');
  if (!carton.habilitado) {
    throw ApiError.conflict('El carton todavia no esta habilitado: habilitelo antes de avisar');
  }

  const [jugador, sorteo] = await Promise.all([
    jugadorModel.buscarPorId(carton.jugador_id),
    sorteoModel.buscarPorId(carton.sorteo_id),
  ]);

  const r = await notificacion.notificarCartonHabilitado({ sorteo, carton, jugador });
  return {
    enviado: r.enviado,
    mensaje_id: r.mensajeId,
    destino: jugador.whatsapp,
    carton: carton.codigo,
    usuario: jugador.dni,
    mensaje: r.enviado
      ? `Aviso de habilitacion enviado a ${jugador.whatsapp}`
      : 'El aviso quedo registrado como pendiente: WhatsApp no esta conectado',
  };
}

/** El vendedor marca el carton como rendido (queda a la espera del admin). */
async function marcarRendido(cartonId) {
  const carton = await cartonModel.buscarPorId(cartonId);
  if (!carton) throw ApiError.notFound('Carton inexistente');
  await cartonModel.cambiarEstadoPago(cartonId, await catalogo.estadoPagoId('RENDIDO'), false);
  return cartonModel.buscarPorId(cartonId);
}

/**
 * Cambia el estado de un cartón en una sola operación (PATCH /api/cartones/:id).
 *
 * Reemplaza a los tres PATCH sueltos (habilitar / rendir / anular) para el
 * panel del administrador, que necesita togglear estados desde una tabla.
 *
 * @param {object} cambios
 *   - `estado_pago`: 'IMPAGO' | 'RENDIDO' | 'PAGADO'
 *   - `habilitado`: boolean
 *
 * Reglas:
 *   - PAGADO implica habilitado (no tiene sentido pagado y bloqueado).
 *   - Volver a IMPAGO quita la habilitación.
 *   - Al pasar a habilitado se dispara el aviso por WhatsApp con la URL y las
 *     credenciales, igual que `habilitarCarton`.
 */
const ESTADOS_PAGO = ['IMPAGO', 'RENDIDO', 'PAGADO'];

async function actualizarEstado(cartonId, cambios = {}) {
  const carton = await cartonModel.buscarPorId(cartonId);
  if (!carton) throw ApiError.notFound('Carton inexistente');

  const pedido = cambios.estado_pago ? String(cambios.estado_pago).toUpperCase() : null;
  if (pedido && !ESTADOS_PAGO.includes(pedido)) {
    throw ApiError.badRequest(`estado_pago invalido: use ${ESTADOS_PAGO.join(', ')}`);
  }
  if (pedido === null && cambios.habilitado === undefined) {
    throw ApiError.badRequest('Indique `estado_pago` y/o `habilitado`');
  }

  // Estado final, resolviendo la coherencia entre pago y habilitación.
  let estadoPago = pedido || carton.estado_pago;
  let habilitado =
    cambios.habilitado === undefined ? !!carton.habilitado : !!cambios.habilitado;

  // PAGADO implica habilitado, e IMPAGO implica no habilitado.
  if (pedido === 'PAGADO' && cambios.habilitado === undefined) habilitado = true;
  if (pedido === 'IMPAGO' && cambios.habilitado === undefined) habilitado = false;

  // Habilitar sin aclarar el pago significa "el vendedor rindió y está
  // cobrado": es lo mismo que hace `habilitarCarton`.
  if (cambios.habilitado === true && !pedido) estadoPago = 'PAGADO';

  // Quitar la habilitación deja el cartón rendido, nunca pagado.
  if (cambios.habilitado === false && !pedido && estadoPago === 'PAGADO') {
    estadoPago = 'RENDIDO';
  }

  // Un cartón habilitado no puede quedar como impago.
  if (habilitado && estadoPago === 'IMPAGO') estadoPago = 'PAGADO';

  const seHabilita = habilitado && !carton.habilitado;
  const sinCambios = estadoPago === carton.estado_pago && habilitado === !!carton.habilitado;
  if (sinCambios) return { carton, cambio: false, aviso: null };

  await cartonModel.cambiarEstadoPago(
    cartonId,
    await catalogo.estadoPagoId(estadoPago),
    habilitado
  );
  const actualizado = await cartonModel.buscarPorId(cartonId);

  // Sólo se avisa cuando el cartón PASA a habilitado, no en cada cambio.
  let aviso = null;
  if (seHabilita) {
    const [jugador, sorteo] = await Promise.all([
      jugadorModel.buscarPorId(carton.jugador_id),
      sorteoModel.buscarPorId(carton.sorteo_id),
    ]);
    aviso = { destino: jugador.whatsapp };
    notificacion
      .notificarCartonHabilitado({ sorteo, carton: actualizado, jugador })
      .catch((err) => logger.error({ err }, 'Fallo el aviso de carton habilitado'));
  }

  logger.info(
    { carton: actualizado.codigo, estadoPago, habilitado },
    'Estado de carton actualizado'
  );
  return { carton: actualizado, cambio: true, aviso };
}

/** Anula un carton (libera el cupo del sorteo). */
async function anularCarton(cartonId) {
  const carton = await cartonModel.buscarPorId(cartonId);
  if (!carton) throw ApiError.notFound('Carton inexistente');
  const sorteo = await sorteoModel.buscarPorId(carton.sorteo_id);
  if (sorteo.estado !== 'EN_VENTA') {
    throw ApiError.conflict('Solo se pueden anular cartones mientras el sorteo esta en venta');
  }
  await cartonModel.marcarEstado(cartonId, await catalogo.estadoCartonId('ANULADO'));
  return cartonModel.buscarPorId(cartonId);
}

/**
 * Vista del carton para el jugador: numeros pintados, aciertos y datos del
 * sorteo (modulo 3 del enunciado).
 */
async function vistaCarton(cartonId) {
  const carton = await cartonModel.buscarPorId(cartonId);
  if (!carton) throw ApiError.notFound('Carton inexistente');
  const { sorteo, jornadas, numeros_salidos: salidos } = await sorteoService.resumen(carton.sorteo_id);
  const setSalidos = new Set(salidos);

  const disposicion = await cartonModel.disposicionDe(cartonId);

  // Grilla de 30 casilleros (3 x 10). Los que no tienen número van vacíos.
  const porCelda = new Map();
  disposicion.forEach((d, i) => {
    // Si un cartón viejo no tiene celda asignada, se lo ubica correlativo
    // para que la pantalla no quede vacía.
    porCelda.set(d.celda || i + 1, d.numero);
  });

  const grilla = Array.from({ length: CARTON_CELDAS }, (_, i) => {
    const celda = i + 1;
    const numero = porCelda.get(celda) ?? null;
    return {
      celda,
      fila: Math.floor(i / CARTON_COLUMNAS) + 1,
      columna: (i % CARTON_COLUMNAS) + 1,
      numero,
      salio: numero !== null && setSalidos.has(numero),
    };
  });

  return {
    carton: {
      ...carton,
      numeros: carton.numeros.map((n) => ({ numero: n, salio: setSalidos.has(n) })),
      aciertos: carton.numeros.filter((n) => setSalidos.has(n)).length,
      grilla,
      filas: CARTON_FILAS,
      columnas: CARTON_COLUMNAS,
    },
    sorteo,
    jornadas,
    numeros_salidos: salidos,
  };
}

module.exports = {
  venderCarton, habilitarCarton, notificarHabilitado, actualizarEstado,
  marcarRendido, anularCarton, vistaCarton, ESTADOS_PAGO,
};
