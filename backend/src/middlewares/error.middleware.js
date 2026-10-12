'use strict';
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../utils/logger');

const notFound = (req, res, next) => next(ApiError.notFound(`Ruta no encontrada: ${req.originalUrl}`));

/** Traduce errores de MySQL, multer y ApiError a una respuesta uniforme. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let mensaje = err.message || 'Error interno del servidor';
  let detalles = err.detalles || null;

  if (err instanceof multer.MulterError) {
    status = 400;
    mensaje =
      err.code === 'LIMIT_FILE_SIZE'
        ? `El archivo supera el maximo de ${env.uploads.maxBytes / 1024 / 1024} MB`
        : `Error al subir el archivo: ${err.message}`;
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    mensaje = 'Ya existe un registro con esos datos unicos (DNI, usuario o codigo)';
    detalles = err.sqlMessage;
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    status = 409;
    mensaje = 'La operacion viola una relacion entre tablas';
    detalles = err.sqlMessage;
  } else if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    status = 400;
    mensaje = 'Los datos no cumplen una restriccion de la base';
  }

  if (status >= 500) logger.error({ err }, 'Error no controlado');
  else logger.warn({ status, mensaje }, 'Error de negocio');

  res.status(status).json({
    ok: false,
    error: mensaje,
    detalles: env.nodeEnv === 'production' ? undefined : detalles,
  });
}

module.exports = { notFound, errorHandler };
