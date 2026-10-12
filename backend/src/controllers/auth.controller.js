'use strict';
/**
 * Controlador de autenticacion.
 * El usuario de vendedores y jugadores es su DNI; la clave inicial tambien.
 */
const bcrypt = require('bcryptjs');
const usuarioModel = require('../models/usuario.model');
const vendedorModel = require('../models/vendedor.model');
const jugadorModel = require('../models/jugador.model');
const { firmarToken } = require('../middlewares/auth.middleware');
const { asyncHandler, ok } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

/** Adjunta el perfil (vendedor/jugador) correspondiente al usuario. */
async function perfilDe(usuario) {
  if (usuario.rol === 'VENDEDOR') return vendedorModel.buscarPorUsuarioId(usuario.id);
  if (usuario.rol === 'JUGADOR') return jugadorModel.buscarPorUsuarioId(usuario.id);
  return null;
}

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const usuario = await usuarioModel.buscarPorUsername(String(username).trim());
  if (!usuario) throw ApiError.unauthorized('Usuario o clave incorrectos');
  if (!usuario.activo) throw ApiError.forbidden('El usuario esta inhabilitado');

  const coincide = await bcrypt.compare(String(password), usuario.password_hash);
  if (!coincide) throw ApiError.unauthorized('Usuario o clave incorrectos');

  const perfil = await perfilDe(usuario);
  if (usuario.rol === 'VENDEDOR' && perfil && !perfil.habilitado) {
    throw ApiError.forbidden('El vendedor esta inhabilitado por el administrador');
  }

  await usuarioModel.registrarAcceso(usuario.id);
  const token = firmarToken({
    usuarioId: usuario.id,
    rol: usuario.rol,
    username: usuario.username,
    perfilId: perfil ? perfil.id : null,
  });

  return ok(res, {
    token,
    usuario: {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      debe_cambiar_password: !!usuario.debe_cambiar_password,
    },
    perfil,
  });
});

/** GET /api/auth/perfil */
const perfil = asyncHandler(async (req, res) => {
  const usuario = await usuarioModel.buscarPorId(req.auth.usuarioId);
  const datos = await perfilDe(usuario);
  return ok(res, {
    usuario: {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      debe_cambiar_password: !!usuario.debe_cambiar_password,
    },
    perfil: datos,
  });
});

/** PUT /api/auth/password */
const cambiarPassword = asyncHandler(async (req, res) => {
  const { password_actual: actual, password_nueva: nueva } = req.body;
  const usuario = await usuarioModel.buscarPorId(req.auth.usuarioId);
  const coincide = await bcrypt.compare(String(actual), usuario.password_hash);
  if (!coincide) throw ApiError.badRequest('La clave actual es incorrecta');
  if (String(nueva).length < 6) throw ApiError.badRequest('La nueva clave debe tener 6 caracteres o mas');

  await usuarioModel.actualizarPassword(usuario.id, await bcrypt.hash(String(nueva), 10));
  return ok(res, { mensaje: 'Clave actualizada' });
});

module.exports = { login, perfil, cambiarPassword };
