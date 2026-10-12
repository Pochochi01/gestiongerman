'use strict';
/** Modulo 4 - Sorteo: configuracion, apertura, inicio y carga de numeros. */
const sorteoService = require('../services/sorteo.service');
const sorteoModel = require('../models/sorteo.model');
const jornadaModel = require('../models/jornada.model');
const cartonModel = require('../models/carton.model');
const { asyncHandler, ok } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

/** GET /api/sorteos */
const listar = asyncHandler(async (req, res) => ok(res, await sorteoModel.listar()));

/** GET /api/sorteos/vigente - el sorteo en venta o en curso */
const vigente = asyncHandler(async (req, res) => {
  const sorteo = (await sorteoModel.vigente()) || (await sorteoModel.abiertoParaVenta());
  if (!sorteo) return ok(res, null);
  return ok(res, await sorteoService.resumen(sorteo.id));
});

/** GET /api/sorteos/:id */
const obtener = asyncHandler(async (req, res) => ok(res, await sorteoService.resumen(req.params.id)));

/** POST /api/sorteos (admin) */
const crear = asyncHandler(async (req, res) =>
  ok(res, await sorteoService.crearSorteo(req.body, req.auth.usuarioId), 201)
);

/** PUT /api/sorteos/:id (admin) */
const actualizar = asyncHandler(async (req, res) =>
  ok(res, await sorteoService.actualizarSorteo(req.params.id, req.body))
);

/** POST /api/sorteos/:id/abrir-venta (admin) */
const abrirVenta = asyncHandler(async (req, res) =>
  ok(res, await sorteoService.abrirVenta(req.params.id))
);

/** POST /api/sorteos/:id/iniciar (admin) - forzado opcional */
const iniciar = asyncHandler(async (req, res) =>
  ok(res, await sorteoService.iniciarSorteo(req.params.id, { forzado: !!req.body.forzado }))
);

/**
 * POST /api/sorteos/:id/numeros (admin)
 *
 * Body: { fecha: 'YYYY-MM-DD', numero_sorteo: 9876, numeros: ['1234', '0078', 7] }
 *
 * Los numeros se cargan como salen en la quiniela (hasta 4 cifras) y el
 * sistema valida los cartones con las dos ultimas cifras. La jornada queda
 * registrada con la fecha, el nombre de la loteria ('Nocturna') y el numero
 * de sorteo. Tambien valida automaticamente si algun carton quedo completo.
 */
const cargarNumeros = asyncHandler(async (req, res) => {
  const { fecha, numeros, numero_sorteo: numeroSorteo } = req.body;
  if (!Array.isArray(numeros) && typeof numeros !== 'string') {
    throw ApiError.badRequest('`numeros` debe ser un arreglo o un texto con los numeros separados');
  }
  const resultado = await sorteoService.cargarNumeros(
    req.params.id,
    { fecha, numeros, numero_sorteo: numeroSorteo },
    req.auth.usuarioId
  );
  return ok(res, resultado, 201);
});

/** GET /api/sorteos/:id/jornadas - numeros cargados por dia (modulo 3) */
const jornadas = asyncHandler(async (req, res) =>
  ok(res, await jornadaModel.historial(req.params.id))
);

/**
 * GET /api/sorteos/historial?limite=10
 *
 * Los ultimos sorteos en los que participo quien consulta, con todos sus
 * datos: jornadas, numeros, ganadores (con jugador y vendedor), el ranking de
 * los 20 cartones con mas aciertos y los cartones propios.
 */
const historial = asyncHandler(async (req, res) =>
  ok(
    res,
    await sorteoService.historialParticipante(
      { rol: req.auth.rol, jugadorId: req.auth.perfilId, vendedorId: req.auth.perfilId },
      req.query.limite
    )
  )
);

/**
 * GET /api/sorteos/:id/cartones?vendedor=ID
 *
 * Cartones del sorteo, opcionalmente filtrados por vendedor. Incluye el
 * resumen de estados (impago / rendido / pagado) de ese mismo recorte, que es
 * lo que alimenta el texto y el grafico del panel.
 *
 * Un VENDEDOR solo puede pedir los suyos: el filtro se fuerza con su perfil.
 */
const cartonesDelSorteo = asyncHandler(async (req, res) => {
  const sorteo = await sorteoModel.buscarPorId(req.params.id);
  if (!sorteo) throw ApiError.notFound('Sorteo inexistente');

  let vendedorId = req.query.vendedor ? Number(req.query.vendedor) : null;
  if (req.auth.rol === 'VENDEDOR') vendedorId = req.auth.perfilId;

  const [cartones, resumen, vendedores] = await Promise.all([
    cartonModel.listar({ sorteoId: sorteo.id, vendedorId, conNumeros: true }),
    cartonModel.resumenEstados(sorteo.id, vendedorId),
    cartonModel.vendedoresDeSorteo(sorteo.id),
  ]);

  return ok(res, {
    sorteo,
    // Mientras el sorteo este en venta o en curso se puede habilitar/cobrar.
    editable: ['EN_VENTA', 'EN_CURSO'].includes(sorteo.estado),
    vendedor_id: vendedorId,
    vendedores,
    resumen,
    total: cartones.length,
    cartones,
  });
});

/** GET /api/sorteos/:id/ranking?limite=20 - cartones con mas aciertos */
const ranking = asyncHandler(async (req, res) =>
  ok(res, await cartonModel.ranking(req.params.id, Number(req.query.limite) || sorteoService.TOP_CARTONES))
);

/** GET /api/sorteos/:id/ganadores - quien gano, con su vendedor y su carton */
const ganadores = asyncHandler(async (req, res) => {
  const lista = await cartonModel.ganadoresDe(req.params.id);
  return ok(res, { total: lista.length, ganadores: lista });
});

/**
 * POST /api/sorteos/:id/notificar-ganadores (admin)
 * Avisa por WhatsApp a cada ganador que su carton gano y cuantos ganadores
 * hubo en total. Sirve para reenviar si el envio automatico fallo.
 */
const notificarGanadores = asyncHandler(async (req, res) =>
  ok(res, await sorteoService.notificarGanadores(req.params.id))
);

module.exports = {
  listar, vigente, obtener, crear, actualizar, abrirVenta, iniciar, cargarNumeros, jornadas,
  historial, ranking, ganadores, notificarGanadores, cartonesDelSorteo,
};
