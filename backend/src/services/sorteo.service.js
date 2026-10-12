'use strict';
/**
 * Reglas de negocio del sorteo:
 *  - alta y configuracion (cantidad de cartones y numeros por carton),
 *  - apertura/cierre de la venta,
 *  - carga de los numeros diarios,
 *  - validacion automatica de cartones completos.
 */
const { withTransaction } = require('../config/db');
const sorteoModel = require('../models/sorteo.model');
const cartonModel = require('../models/carton.model');
const jornadaModel = require('../models/jornada.model');
const catalogo = require('../models/catalogo.model');
const notificacion = require('./notificacion.service');
const ApiError = require('../utils/ApiError');
const {
  aFechaISO, dosUltimasCifras, separarNumeros,
  LOTERIA_POR_DEFECTO, CIFRAS_MAX_CARGA,
} = require('../utils/helpers');
const logger = require('../utils/logger');
const { colorDeSorteo } = require('../utils/colores');

const MAX_NUMEROS_CARTON = 10;

/** Cuantos cartones entran en el ranking de mas aciertos del sorteo. */
const TOP_CARTONES = 20;

/** Cuantos sorteos ve un participante en su historial. */
const ULTIMOS_SORTEOS = 10;

/** Crea un sorteo en estado CONFIGURACION. */
async function crearSorteo(datos, usuarioId) {
  const numerosPorCarton = Number(datos.numeros_por_carton || MAX_NUMEROS_CARTON);
  if (numerosPorCarton < 1 || numerosPorCarton > MAX_NUMEROS_CARTON) {
    throw ApiError.badRequest(`Cada carton admite entre 1 y ${MAX_NUMEROS_CARTON} numeros`);
  }
  const cartonesObjetivo = Number(datos.cartones_objetivo);
  if (!Number.isInteger(cartonesObjetivo) || cartonesObjetivo < 1) {
    throw ApiError.badRequest('La cantidad de cartones a vender debe ser un entero mayor a 0');
  }
  const rangoMin = Number(datos.rango_min ?? 1);
  const rangoMax = Number(datos.rango_max ?? 90);
  if (rangoMax - rangoMin + 1 < numerosPorCarton) {
    throw ApiError.badRequest('El rango de numeros es menor que los numeros por carton');
  }

  const numero = datos.numero ? Number(datos.numero) : await sorteoModel.proximoNumero();
  const estadoId = await catalogo.estadoSorteoId('CONFIGURACION');

  const id = await sorteoModel.crear({
    numero,
    nombre: datos.nombre || `Sorteo ${numero}`,
    estado_id: estadoId,
    cartones_objetivo: cartonesObjetivo,
    numeros_por_carton: numerosPorCarton,
    rango_min: rangoMin,
    rango_max: rangoMax,
    precio_carton: datos.precio_carton ?? 0,
    // Un color por sorteo: todos sus cartones se dibujan igual.
    color_carton: colorDeSorteo(numero),
    creado_por: usuarioId,
  });
  return sorteoModel.buscarPorId(id);
}

/** Modifica la configuracion. Solo se permite antes de vender cartones. */
async function actualizarSorteo(id, datos) {
  const sorteo = await sorteoModel.buscarPorId(id);
  if (!sorteo) throw ApiError.notFound('Sorteo inexistente');
  if (sorteo.cartones_vendidos > 0 && Number(datos.numeros_por_carton) !== sorteo.numeros_por_carton) {
    throw ApiError.conflict('No se pueden cambiar los numeros por carton con cartones ya vendidos');
  }
  if (Number(datos.cartones_objetivo) < sorteo.cartones_vendidos) {
    throw ApiError.conflict(
      `Ya hay ${sorteo.cartones_vendidos} cartones vendidos: el objetivo no puede ser menor`
    );
  }
  await sorteoModel.actualizarConfiguracion(id, {
    nombre: datos.nombre ?? sorteo.nombre,
    cartones_objetivo: datos.cartones_objetivo ?? sorteo.cartones_objetivo,
    numeros_por_carton: datos.numeros_por_carton ?? sorteo.numeros_por_carton,
    rango_min: datos.rango_min ?? sorteo.rango_min,
    rango_max: datos.rango_max ?? sorteo.rango_max,
    precio_carton: datos.precio_carton ?? sorteo.precio_carton,
  });
  return sorteoModel.buscarPorId(id);
}

/** Habilita la venta de cartones (CONFIGURACION -> EN_VENTA). */
async function abrirVenta(id) {
  const sorteo = await sorteoModel.buscarPorId(id);
  if (!sorteo) throw ApiError.notFound('Sorteo inexistente');
  if (sorteo.estado !== 'CONFIGURACION') {
    throw ApiError.conflict(`El sorteo ya esta en estado ${sorteo.estado}`);
  }
  const enVenta = await sorteoModel.abiertoParaVenta();
  if (enVenta) throw ApiError.conflict(`Ya hay un sorteo en venta (N° ${enVenta.numero})`);

  await sorteoModel.cambiarEstado(id, await catalogo.estadoSorteoId('EN_VENTA'));
  return sorteoModel.buscarPorId(id);
}

/**
 * Pasa el sorteo a EN_CURSO y avisa a todos los jugadores.
 * Lo invoca carton.service al completarse la venta; tambien puede forzarlo
 * el administrador desde el panel.
 */
async function iniciarSorteo(id, { forzado = false } = {}) {
  const sorteo = await sorteoModel.buscarPorId(id);
  if (!sorteo) throw ApiError.notFound('Sorteo inexistente');
  if (sorteo.estado === 'EN_CURSO') return sorteo;
  if (sorteo.estado !== 'EN_VENTA') throw ApiError.conflict('El sorteo no esta en venta');
  if (!forzado && sorteo.cartones_vendidos < sorteo.cartones_objetivo) {
    throw ApiError.conflict(
      `Faltan vender ${sorteo.cartones_objetivo - sorteo.cartones_vendidos} cartones`
    );
  }

  await sorteoModel.cambiarEstado(id, await catalogo.estadoSorteoId('EN_CURSO'), 'iniciado_en');
  const actualizado = await sorteoModel.buscarPorId(id);
  notificacion
    .notificarInicioSorteo(actualizado)
    .catch((err) => logger.error({ err }, 'Fallo el aviso de inicio de sorteo'));
  return actualizado;
}

/**
 * Carga los numeros de una jornada y valida los cartones.
 * Todo ocurre en una transaccion: si un numero es invalido no se guarda nada.
 *
 * @returns {{sorteo, fecha, numeros, ganadores, finalizado}}
 */
async function cargarNumeros(sorteoId, { fecha, numeros, numero_sorteo: numeroSorteo }, usuarioId) {
  const sorteo = await sorteoModel.buscarPorId(sorteoId);
  if (!sorteo) throw ApiError.notFound('Sorteo inexistente');
  if (sorteo.estado !== 'EN_CURSO') {
    throw ApiError.conflict('Solo se cargan numeros en un sorteo EN_CURSO');
  }

  const fechaISO = aFechaISO(fecha) || aFechaISO(new Date());
  const entradas = Array.isArray(numeros) ? numeros : separarNumeros(numeros);
  if (entradas.length === 0) throw ApiError.badRequest('Debe indicar al menos un numero');

  // --- 1. Se traduce cada valor de la quiniela a su número de bingo ---
  const invalidos = [];
  const traducidos = [];
  for (const entrada of entradas) {
    const r = dosUltimasCifras(entrada);
    if (!r) invalidos.push(String(entrada));
    else traducidos.push(r);
  }
  if (invalidos.length) {
    throw ApiError.badRequest(
      `Valores invalidos (se admite hasta ${CIFRAS_MAX_CARGA} cifras): ${invalidos.join(', ')}`
    );
  }

  const resultado = await withTransaction(async (conn) => {
    // --- 2. Jornada: fecha + loteria ('Nocturna') + numero de sorteo ---
    const jornadaId = await jornadaModel.obtenerOCrear(
      {
        sorteoId,
        fecha: fechaISO,
        creadoPor: usuarioId,
        nombre: LOTERIA_POR_DEFECTO,
        numeroSorteo: numeroSorteo != null && numeroSorteo !== '' ? Number(numeroSorteo) : null,
      },
      conn
    );

    // --- 3. Se asigna la posicion y se marca cual suma al bingo ---
    //
    // En la quiniela es normal que dos posiciones terminen en las mismas dos
    // cifras, o que un numero ya haya salido otro dia. Eso no es un error de
    // carga: se guardan TODAS las posiciones (asi la grilla 1..20 del jugador
    // es un registro fiel del sorteo) y solo las nuevas validan cartones.
    const yaSalieron = new Set(await jornadaModel.numerosDelSorteo(sorteoId, conn));
    const basePosicion = await jornadaModel.proximaPosicion(jornadaId, conn);

    const cargados = [];
    const ignorados = [];
    const aGuardar = [];
    const enEstaCarga = new Set();

    traducidos.forEach((t, i) => {
      const entrada = { ...t, posicion: basePosicion + i };

      let motivo = null;
      if (t.numero < sorteo.rango_min || t.numero > sorteo.rango_max) {
        motivo = `fuera del rango del sorteo (${sorteo.rango_min} a ${sorteo.rango_max})`;
      } else if (enEstaCarga.has(t.numero)) {
        motivo = 'repetido en esta misma carga';
      } else if (yaSalieron.has(t.numero)) {
        motivo = 'ya habia salido en este sorteo';
      }

      if (motivo) {
        ignorados.push({ ...entrada, motivo });
        aGuardar.push({ ...entrada, cuenta: false });
      } else {
        enEstaCarga.add(t.numero);
        cargados.push(entrada);
        aGuardar.push({ ...entrada, cuenta: true });
      }
    });

    // Se guardan todas las posiciones, cuenten o no.
    await jornadaModel.agregarNumeros(jornadaId, aGuardar, conn);

    if (cargados.length === 0) {
      // Nada nuevo que validar: el sorteo quedo registrado igual.
      return { jornadaId, completos: [], cargados, ignorados };
    }

    // --- Validacion automatica de cartones ---
    const progreso = await cartonModel.progresoDelSorteo(sorteoId, conn);
    const estadoGanador = await catalogo.estadoCartonId('GANADOR');
    const completos = [];

    for (const fila of progreso) {
      await cartonModel.actualizarAciertos(fila.carton_id, Number(fila.aciertos), conn);
      if (Number(fila.completo) === 1) {
        await cartonModel.marcarEstado(fila.carton_id, estadoGanador, conn);
        await conn.execute(
          `INSERT IGNORE INTO ganadores (sorteo_id, carton_id, jornada_id, posicion)
           VALUES (?, ?, ?, 1)`,
          [sorteoId, fila.carton_id, jornadaId]
        );
        completos.push(fila.carton_id);
      }
    }

    if (completos.length) {
      await sorteoModel.cambiarEstado(
        sorteoId,
        await catalogo.estadoSorteoId('FINALIZADO'),
        'finalizado_en',
        conn
      );
      await conn.execute('UPDATE jornadas SET cerrada = 1 WHERE id = ?', [jornadaId]);
    }

    return { jornadaId, completos, cargados, ignorados };
  });

  // --- Notificaciones (fuera de la transaccion) ---
  const sorteoActualizado = await sorteoModel.buscarPorId(sorteoId);
  const jornada = await jornadaModel.buscarPorId(resultado.jornadaId);

  if (resultado.cargados.length) {
    notificacion
      .notificarNumerosDelDia({
        sorteo: sorteoActualizado,
        fecha: fechaISO,
        numeros: resultado.cargados.map((c) => c.numero),
        loteria: jornada?.nombre || LOTERIA_POR_DEFECTO,
        numeroSorteo: jornada?.numero_sorteo ?? null,
      })
      .catch((err) => logger.error({ err }, 'Fallo el aviso de numeros del dia'));
  }

  // Los ganadores se avisan todos juntos, cuando ya se sabe cuántos son: el
  // mensaje le dice a cada uno con cuántos comparte el premio.
  const ganadores = await cartonModel.ganadoresDe(sorteoId);
  if (resultado.completos.length > 0) {
    notificacion
      .notificarGanadoresDeSorteo(sorteoActualizado, fechaISO)
      .catch((err) => logger.error({ err }, 'Fallo el aviso a los ganadores'));
  }

  return {
    sorteo: sorteoActualizado,
    jornada: {
      id: resultado.jornadaId,
      fecha: fechaISO,
      nombre: jornada?.nombre || LOTERIA_POR_DEFECTO,
      numero_sorteo: jornada?.numero_sorteo ?? null,
    },
    fecha: fechaISO,
    // `numeros` son las dos cifras que validan los cartones;
    // `cargados` incluye además el valor de 4 cifras que tipeó el administrador.
    numeros: resultado.cargados.map((c) => c.numero),
    cargados: resultado.cargados,
    ignorados: resultado.ignorados,
    ganadores,
    // `finalizado` = esta carga cerro el sorteo (no que ya tuviera ganadores)
    finalizado: resultado.completos.length > 0,
    total_ganadores: ganadores.length,
  };
}

/**
 * Vista consolidada del sorteo: progreso, jornadas, ganadores y el ranking de
 * los 20 cartones que más números van acertando.
 */
async function resumen(sorteoId) {
  const sorteo = await sorteoModel.buscarPorId(sorteoId);
  if (!sorteo) throw ApiError.notFound('Sorteo inexistente');

  const [jornadas, ganadores, ranking, estados, vendedores] = await Promise.all([
    jornadaModel.historial(sorteoId),
    cartonModel.ganadoresDe(sorteoId),
    cartonModel.ranking(sorteoId, TOP_CARTONES),
    cartonModel.resumenEstados(sorteoId),
    cartonModel.vendedoresDeSorteo(sorteoId),
  ]);
  const numerosSalidos = jornadas.flatMap((j) => j.numeros);

  return {
    sorteo,
    jornadas,
    numeros_salidos: numerosSalidos,
    ganadores,
    total_ganadores: ganadores.length,
    ranking,
    // Distribución de estados de pago y vendedores que participaron: es lo que
    // consume el resumen visual del panel del administrador.
    resumen: estados,
    vendedores,
    // Mientras el sorteo esté en venta o en curso se puede cobrar/habilitar.
    editable: ['EN_VENTA', 'EN_CURSO'].includes(sorteo.estado),
  };
}

/**
 * Últimos sorteos en los que participó quien consulta, con todos sus datos.
 *
 * - JUGADOR: los sorteos donde tiene cartones, con sus propios cartones.
 * - VENDEDOR: los sorteos donde colocó cartones.
 * - ADMIN: los últimos sorteos del sistema.
 *
 * Devuelve el detalle completo de cada uno (jornadas, ganadores y ranking),
 * porque es lo que necesita la pantalla del jugador para controlar el sorteo.
 */
async function historialParticipante({ rol, jugadorId = null, vendedorId = null }, limite = ULTIMOS_SORTEOS) {
  const tope = Math.min(Math.max(Number(limite) || ULTIMOS_SORTEOS, 1), 50);

  let participaciones = [];
  if (rol === 'JUGADOR') {
    if (!jugadorId) throw ApiError.notFound('El usuario no tiene ficha de jugador');
    participaciones = await cartonModel.sorteosDeJugador(jugadorId, tope);
  } else if (rol === 'VENDEDOR') {
    if (!vendedorId) throw ApiError.notFound('El usuario no tiene ficha de vendedor');
    participaciones = await cartonModel.sorteosDeVendedor(vendedorId, tope);
  } else {
    const todos = await sorteoModel.listar();
    participaciones = todos.slice(0, tope).map((s) => ({ sorteo_id: s.id }));
  }

  const sorteos = [];
  for (const p of participaciones) {
    const detalle = await resumen(p.sorteo_id);

    // Los cartones propios del jugador en ese sorteo, para controlarlos contra
    // los números que salieron.
    let misCartones = [];
    if (rol === 'JUGADOR') misCartones = await cartonModel.listar({ sorteoId: p.sorteo_id, jugadorId, conNumeros: true });
    else if (rol === 'VENDEDOR') misCartones = await cartonModel.listar({ sorteoId: p.sorteo_id, vendedorId, conNumeros: true });

    sorteos.push({
      ...detalle,
      participacion: {
        cartones: Number(p.cartones ?? misCartones.length),
        mejor_acierto: p.mejor_acierto != null ? Number(p.mejor_acierto) : null,
        ganadores: p.ganadores != null ? Number(p.ganadores) : null,
      },
      mis_cartones: misCartones,
    });
  }

  return { limite: tope, total: sorteos.length, sorteos };
}

/** Avisa por WhatsApp a todos los ganadores del sorteo. */
async function notificarGanadores(sorteoId) {
  const sorteo = await sorteoModel.buscarPorId(sorteoId);
  if (!sorteo) throw ApiError.notFound('Sorteo inexistente');

  const ganadores = await cartonModel.ganadoresDe(sorteoId);
  if (ganadores.length === 0) {
    throw ApiError.conflict('Este sorteo todavia no tiene cartones ganadores');
  }
  return notificacion.notificarGanadoresDeSorteo(sorteo);
}

module.exports = {
  MAX_NUMEROS_CARTON, TOP_CARTONES, ULTIMOS_SORTEOS,
  crearSorteo, actualizarSorteo, abrirVenta, iniciarSorteo, cargarNumeros, resumen,
  historialParticipante, notificarGanadores,
};
