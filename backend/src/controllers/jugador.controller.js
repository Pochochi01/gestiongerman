'use strict';
/**
 * Modulo 2 - Vendedores: alta de jugadores y listado de clientes propios.
 * El alta genera usuario y clave con el DNI del jugador (modulo 3).
 */
const bcrypt = require('bcryptjs');
const { withTransaction } = require('../config/db');
const jugadorModel = require('../models/jugador.model');
const vendedorModel = require('../models/vendedor.model');
const usuarioModel = require('../models/usuario.model');
const catalogo = require('../models/catalogo.model');
const cartonService = require('../services/carton.service');
const altaJugador = require('../services/alta-jugador.service');
const { asyncHandler, ok, normalizarWhatsapp } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** El vendedor solo opera sobre sus propios jugadores; el admin sobre todos. */
function vendedorDelRequest(req) {
  if (req.auth.rol === 'VENDEDOR') return req.auth.perfilId;
  return req.query.vendedor_id ? Number(req.query.vendedor_id) : null;
}

function verificarPropiedad(req, jugador) {
  if (req.auth.rol === 'VENDEDOR' && jugador.vendedor_id !== req.auth.perfilId) {
    throw ApiError.forbidden('El jugador pertenece a otro vendedor');
  }
  if (req.auth.rol === 'JUGADOR' && jugador.usuario_id !== req.auth.usuarioId) {
    throw ApiError.forbidden('Solo puede consultar sus propios datos');
  }
}

/** GET /api/jugadores - lista de clientes (propios si el rol es VENDEDOR) */
const listar = asyncHandler(async (req, res) =>
  ok(res, await jugadorModel.listar({ vendedorId: vendedorDelRequest(req), busqueda: req.query.q }))
);

/** GET /api/jugadores/:id */
const obtener = asyncHandler(async (req, res) => {
  const jugador = await jugadorModel.buscarPorId(req.params.id);
  if (!jugador) throw ApiError.notFound('Jugador inexistente');
  verificarPropiedad(req, jugador);
  return ok(res, jugador);
});

/**
 * POST /api/jugadores
 * Body: { apellido, nombre, dni, whatsapp, numeros? }
 * Si se envian `numeros`, ademas del alta se vende el carton en el mismo paso.
 */
const crear = asyncHandler(async (req, res) => {
  const { apellido, nombre, dni, whatsapp, numeros } = req.body;

  const vendedorId =
    req.auth.rol === 'VENDEDOR' ? req.auth.perfilId : Number(req.body.vendedor_id);
  if (!vendedorId) throw ApiError.badRequest('Falta indicar el vendedor');

  const vendedor = await vendedorModel.buscarPorId(vendedorId);
  if (!vendedor) throw ApiError.notFound('Vendedor inexistente');
  if (!vendedor.habilitado) throw ApiError.forbidden('El vendedor esta inhabilitado');

  const wa = normalizarWhatsapp(whatsapp);
  if (!wa) throw ApiError.badRequest('El numero de WhatsApp no es valido');
  if (await jugadorModel.buscarPorDni(dni)) throw ApiError.conflict('Ya existe un jugador con ese DNI');
  if (await usuarioModel.buscarPorUsername(String(dni))) {
    throw ApiError.conflict('El DNI ya se usa como usuario');
  }

  const rolId = await catalogo.rolId('JUGADOR');
  const passwordHash = await bcrypt.hash(String(dni), 10);

  const jugadorId = await withTransaction(async (conn) => {
    const usuarioId = await usuarioModel.crear(
      { rolId, username: String(dni), passwordHash },
      conn
    );
    return jugadorModel.crear(
      {
        usuario_id: usuarioId,
        vendedor_id: vendedorId,
        apellido,
        nombre,
        dni: String(dni),
        whatsapp: wa,
      },
      conn
    );
  });

  const jugador = await jugadorModel.buscarPorId(jugadorId);

  // Venta del carton en el mismo alta (opcional): dispara el envio por WhatsApp.
  //
  // El jugador ya quedo confirmado en la transaccion de arriba. Si la venta
  // falla (no hay sorteo en venta, numeros fuera de rango, cupo agotado), NO se
  // devuelve un error: eso dejaria al vendedor creyendo que no se guardo nada y
  // reintentando contra un DNI que ya existe. Se devuelve el alta con una
  // advertencia, para que el carton se pueda cargar despues.
  let venta = null;
  let advertencia = null;
  if (Array.isArray(numeros) && numeros.length) {
    try {
      venta = await cartonService.venderCarton({ jugadorId, numeros, vendedorId });
    } catch (err) {
      advertencia =
        `El jugador se dio de alta, pero el carton no se pudo generar: ${err.message}. ` +
        'Cargueselo desde la lista de clientes.';
      logger.warn({ jugadorId, err: err.message }, 'Alta de jugador sin carton');
    }
  }

  return ok(
    res,
    { jugador, credenciales: { usuario: jugador.dni, clave: jugador.dni }, venta, advertencia },
    201
  );
});

/**
 * POST /api/jugadores/nuevo
 *
 * Es el botón "Guardar jugador" de /vendedor/jugadores/nuevo:
 *   1. registra el jugador (y su usuario, con el DNI),
 *   2. vende el carton con los numeros elegidos,
 *   3. genera el PDF con los datos y el QR de validacion,
 *   4. devuelve el enlace de WhatsApp con el mensaje armado.
 *
 * El enlace de WhatsApp se devuelve SOLO si quien carga es un vendedor; para
 * el administrador llega `whatsapp.habilitado = false` con el motivo.
 */
const nuevo = asyncHandler(async (req, res) =>
  ok(
    res,
    await altaJugador.altaConCarton(req.body, {
      rol: req.auth.rol,
      usuarioId: req.auth.usuarioId,
      perfilId: req.auth.perfilId,
    }),
    201
  )
);

/**
 * POST /api/jugadores/cartones/:id/pdf
 * Vuelve a emitir el PDF de un carton (y el enlace de WhatsApp si es vendedor).
 */
const reemitirPdf = asyncHandler(async (req, res) =>
  ok(
    res,
    await altaJugador.reemitirPdf(req.params.id, {
      rol: req.auth.rol,
      perfilId: req.auth.perfilId,
    })
  )
);

/** PUT /api/jugadores/:id */
const actualizar = asyncHandler(async (req, res) => {
  const jugador = await jugadorModel.buscarPorId(req.params.id);
  if (!jugador) throw ApiError.notFound('Jugador inexistente');
  verificarPropiedad(req, jugador);

  const { apellido, nombre, whatsapp } = req.body;
  const wa = whatsapp ? normalizarWhatsapp(whatsapp) : jugador.whatsapp;
  if (!wa) throw ApiError.badRequest('El numero de WhatsApp no es valido');

  await jugadorModel.actualizar(jugador.id, {
    apellido: apellido ?? jugador.apellido,
    nombre: nombre ?? jugador.nombre,
    whatsapp: wa,
  });

  return ok(res, await jugadorModel.buscarPorId(jugador.id));
});

module.exports = { listar, obtener, crear, nuevo, reemitirPdf, actualizar };
