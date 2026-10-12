'use strict';
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** Corta la cadena si express-validator encontro errores. */
function validar(req, res, next) {
  const resultado = validationResult(req);
  if (resultado.isEmpty()) return next();
  const detalles = resultado.array().map((e) => ({ campo: e.path, mensaje: e.msg }));
  return next(ApiError.badRequest('Datos invalidos', detalles));
}

module.exports = { validar };
