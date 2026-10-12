'use strict';
/** Modulo 3 - Jugadores / cartones: venta, consulta y habilitacion. */
const path = require('path');
const { query } = require('../config/db');
const cartonService = require('../services/carton.service');
const cartonModel = require('../models/carton.model');
const jugadorModel = require('../models/jugador.model');
const { asyncHandler, ok } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

/** Filtro segun el rol: el jugador ve lo suyo, el vendedor lo de sus clientes. */
async function filtrosPorRol(req) {
  if (req.auth.rol === 'JUGADOR') {
    const jugador = await jugadorModel.buscarPorUsuarioId(req.auth.usuarioId);
    if (!jugador) throw ApiError.notFound('El usuario no tiene ficha de jugador');
    return { jugadorId: jugador.id };
  }
  if (req.auth.rol === 'VENDEDOR') return { vendedorId: req.auth.perfilId };
  return {
    sorteoId: req.query.sorteo_id ? Number(req.query.sorteo_id) : null,
    jugadorId: req.query.jugador_id ? Number(req.query.jugador_id) : null,
    vendedorId: req.query.vendedor_id ? Number(req.query.vendedor_id) : null,
  };
}

/** Verifica que el solicitante pueda ver ese carton. */
async function verificarAcceso(req, carton) {
  if (req.auth.rol === 'ADMIN') return;
  if (req.auth.rol === 'VENDEDOR' && carton.vendedor_id === req.auth.perfilId) return;
  if (req.auth.rol === 'JUGADOR') {
    const jugador = await jugadorModel.buscarPorUsuarioId(req.auth.usuarioId);
    if (jugador && jugador.id === carton.jugador_id) return;
  }
  throw ApiError.forbidden('No tiene acceso a este carton');
}

/** GET /api/cartones */
const listar = asyncHandler(async (req, res) => {
  const filtros = await filtrosPorRol(req);
  return ok(res, await cartonModel.listar({ ...filtros, conNumeros: true }));
});

/** GET /api/cartones/:id - carton pintado con los numeros que salieron */
const obtener = asyncHandler(async (req, res) => {
  const carton = await cartonModel.buscarPorId(req.params.id);
  if (!carton) throw ApiError.notFound('Carton inexistente');
  await verificarAcceso(req, carton);
  return ok(res, await cartonService.vistaCarton(carton.id));
});

/**
 * POST /api/cartones
 * Body: { jugador_id, numeros: [...] }
 * El jugador elige sus numeros; el vendedor puede cargarlos por el.
 */
const vender = asyncHandler(async (req, res) => {
  let jugadorId = Number(req.body.jugador_id);

  if (req.auth.rol === 'JUGADOR') {
    const jugador = await jugadorModel.buscarPorUsuarioId(req.auth.usuarioId);
    if (!jugador) throw ApiError.notFound('El usuario no tiene ficha de jugador');
    jugadorId = jugador.id;
  } else if (req.auth.rol === 'VENDEDOR') {
    const jugador = await jugadorModel.buscarPorId(jugadorId);
    if (!jugador) throw ApiError.notFound('Jugador inexistente');
    if (jugador.vendedor_id !== req.auth.perfilId) {
      throw ApiError.forbidden('El jugador pertenece a otro vendedor');
    }
  }

  const resultado = await cartonService.venderCarton({
    jugadorId,
    numeros: req.body.numeros,
    vendedorId: req.auth.rol === 'VENDEDOR' ? req.auth.perfilId : null,
  });
  return ok(res, resultado, 201);
});

/** PATCH /api/cartones/:id/habilitar (admin) - habilita y avisa al jugador */
const habilitar = asyncHandler(async (req, res) =>
  ok(res, await cartonService.habilitarCarton(req.params.id))
);

/**
 * POST /api/cartones/:id/notificar-habilitado (admin)
 *
 * Reenvia el aviso de carton habilitado: incluye la URL del sistema y las
 * credenciales del jugador. Solo se puede si el carton ya esta habilitado.
 */
const notificarHabilitado = asyncHandler(async (req, res) =>
  ok(res, await cartonService.notificarHabilitado(req.params.id))
);

/**
 * PATCH /api/cartones/:id (admin)
 *
 * Cambia el estado del carton en una sola llamada:
 *   { "estado_pago": "PAGADO" }      -> cobrado y habilitado
 *   { "habilitado": true }           -> habilita (y marca PAGADO si estaba impago)
 *   { "estado_pago": "RENDIDO", "habilitado": false }
 *
 * Al pasar a habilitado dispara el aviso por WhatsApp con la URL y las
 * credenciales del jugador.
 */
const actualizarEstado = asyncHandler(async (req, res) => {
  const { estado_pago: estadoPago, habilitado } = req.body;
  const r = await cartonService.actualizarEstado(req.params.id, {
    estado_pago: estadoPago,
    habilitado,
  });
  return ok(res, {
    carton: r.carton,
    cambio: r.cambio,
    mensaje: r.cambio
      ? `Carton ${r.carton.codigo}: ${r.carton.estado_pago}` +
        (r.carton.habilitado ? ' y habilitado' : '') +
        (r.aviso ? ` · aviso enviado a ${r.aviso.destino}` : '')
      : 'El carton ya estaba en ese estado',
  });
});

/** PATCH /api/cartones/:id/rendir (vendedor o admin) */
const rendir = asyncHandler(async (req, res) => {
  const carton = await cartonModel.buscarPorId(req.params.id);
  if (!carton) throw ApiError.notFound('Carton inexistente');
  await verificarAcceso(req, carton);
  return ok(res, await cartonService.marcarRendido(carton.id));
});

/** PATCH /api/cartones/:id/anular (admin) */
const anular = asyncHandler(async (req, res) =>
  ok(res, await cartonService.anularCarton(req.params.id))
);

/** POST /api/cartones/:id/comprobante - multipart con campo `comprobante` */
const subirComprobante = asyncHandler(async (req, res) => {
  const carton = await cartonModel.buscarPorId(req.params.id);
  if (!carton) throw ApiError.notFound('Carton inexistente');
  await verificarAcceso(req, carton);
  if (!req.file) throw ApiError.badRequest('No se recibio ningun archivo');

  await query(
    `INSERT INTO comprobantes
       (carton_id, subido_por, nombre_archivo, nombre_original, mime_type, tamano_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      carton.id,
      req.auth.usuarioId,
      path.basename(req.file.filename),
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
    ]
  );

  // Subir el comprobante implica que el vendedor rindio.
  const actualizado = await cartonService.marcarRendido(carton.id);
  return ok(res, { carton: actualizado, archivo: req.file.filename }, 201);
});

module.exports = {
  listar, obtener, vender, habilitar, notificarHabilitado, actualizarEstado,
  rendir, anular, subirComprobante,
};
