'use strict';
/**
 * Autenticacion con JWT y autorizacion por rol.
 * `verificarToken` deja en req.auth: { usuarioId, rol, username, perfilId }.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const usuarioModel = require('../models/usuario.model');

function firmarToken(payload) {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

async function verificarToken(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [tipo, token] = header.split(' ');
    if (tipo !== 'Bearer' || !token) throw ApiError.unauthorized('Falta el token Bearer');

    let payload;
    try {
      payload = jwt.verify(token, env.jwt.secret);
    } catch (err) {
      throw ApiError.unauthorized(
        err.name === 'TokenExpiredError' ? 'La sesion expiro' : 'Token invalido'
      );
    }

    // Se revalida contra la base: un usuario dado de baja pierde el acceso
    // aunque su token siga vigente.
    const usuario = await usuarioModel.buscarPorId(payload.usuarioId);
    if (!usuario || !usuario.activo) throw ApiError.unauthorized('Usuario inactivo');

    req.auth = {
      usuarioId: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      perfilId: payload.perfilId ?? null,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Restringe la ruta a los roles indicados. */
const permitir = (...roles) => (req, res, next) => {
  if (!req.auth) return next(ApiError.unauthorized());
  if (!roles.includes(req.auth.rol)) {
    return next(ApiError.forbidden(`Requiere rol: ${roles.join(' o ')}`));
  }
  return next();
};

module.exports = { firmarToken, verificarToken, permitir };
