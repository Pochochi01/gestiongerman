'use strict';
/** Error de negocio con codigo HTTP. El middleware de errores lo serializa. */
class ApiError extends Error {
  constructor(status, message, detalles = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detalles = detalles;
  }

  static badRequest(msg, detalles) { return new ApiError(400, msg, detalles); }
  static unauthorized(msg = 'No autenticado') { return new ApiError(401, msg); }
  static forbidden(msg = 'No autorizado') { return new ApiError(403, msg); }
  static notFound(msg = 'Recurso no encontrado') { return new ApiError(404, msg); }
  static conflict(msg, detalles) { return new ApiError(409, msg, detalles); }
}

module.exports = ApiError;
