'use strict';
/**
 * Módulo 5 - Panel de WhatsApp.
 * Expone al administrador el estado de la sesión, el QR de vinculación,
 * la desvinculación y la bandeja de salida.
 */
const whatsapp = require('../services/whatsapp.service');
const mensajeModel = require('../models/mensaje.model');
const cartonModel = require('../models/carton.model');
const jugadorModel = require('../models/jugador.model');
const sorteoModel = require('../models/sorteo.model');
const vendedorModel = require('../models/vendedor.model');
const notificacion = require('../services/notificacion.service');
const { asyncHandler, ok } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/whatsapp/estado
 * Devuelve el estado de conexión y, si hay uno vigente, el QR en base64.
 * El panel la consulta cada pocos segundos.
 */
const estado = asyncHandler(async (req, res) => {
  await whatsapp.iniciar(); // idempotente: reusa el socket si ya está abierto
  return ok(res, whatsapp.obtenerEstado());
});

/**
 * GET /api/whatsapp/qr
 * Sólo el QR, para incrustarlo directo en un <img>.
 */
const qr = asyncHandler(async (req, res) => {
  await whatsapp.iniciar();
  const info = whatsapp.obtenerEstado();
  if (info.estado === 'conectado') {
    return ok(res, { qr: null, estado: info.estado, mensaje: 'La sesión ya está vinculada' });
  }
  return ok(res, { qr: info.qr, estado: info.estado, mensaje: info.mensaje });
});

/**
 * POST /api/whatsapp/vincular
 * Fuerza una conexión nueva para generar el QR sin esperar al backoff.
 */
const vincular = asyncHandler(async (req, res) => ok(res, await whatsapp.vincular()));

/**
 * POST /api/whatsapp/desvincular
 * Cierra la sesión en el teléfono y borra session.json del servidor.
 */
const desvincular = asyncHandler(async (req, res) => {
  const info = await whatsapp.desvincular();
  return ok(res, {
    ...info,
    mensaje: 'Dispositivo desvinculado y session.json eliminado. Escanee el QR nuevo para volver a vincular.',
  });
});

/** POST /api/whatsapp/reintentar - reenvía los pendientes y fallidos */
const reintentar = asyncHandler(async (req, res) =>
  ok(res, { enviados: await whatsapp.procesarPendientes() })
);

/** GET /api/whatsapp/mensajes */
const mensajes = asyncHandler(async (req, res) =>
  ok(res, await mensajeModel.listar(Number(req.query.limite) || 100))
);

/**
 * POST /api/whatsapp/cartones/:id/reenviar
 * Reenvía a un jugador el mensaje con los datos de su cartón.
 * Sirve como prueba de la vinculación y para cuando el envío original falló.
 */
const reenviarCarton = asyncHandler(async (req, res) => {
  const carton = await cartonModel.buscarPorId(req.params.id);
  if (!carton) throw ApiError.notFound('Cartón inexistente');

  const [jugador, vendedor, sorteo] = await Promise.all([
    jugadorModel.buscarPorId(carton.jugador_id),
    vendedorModel.buscarPorId(carton.vendedor_id),
    sorteoModel.buscarPorId(carton.sorteo_id),
  ]);

  const resultado = await notificacion.notificarCartonNuevo({
    sorteo,
    jugador,
    vendedor,
    carton,
    numeros: carton.numeros,
  });

  return ok(res, {
    ...resultado,
    destino: jugador.whatsapp,
    carton: carton.codigo,
    mensaje: resultado.enviado
      ? `Cartón ${carton.codigo} reenviado a ${jugador.whatsapp}`
      : 'El mensaje quedó registrado como pendiente: WhatsApp no está conectado',
  });
});

module.exports = { estado, qr, vincular, desvincular, reintentar, mensajes, reenviarCarton };
