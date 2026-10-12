'use strict';
/**
 * Modelo de catalogos: roles, estados y tipos de mensaje.
 * Cachea los ids de los catalogos porque son inmutables en runtime.
 */
const { query, queryOne } = require('../config/db');

const cache = new Map();

/** Devuelve el id de una fila de catalogo por su codigo (con cache). */
async function idPorCodigo(tabla, codigo) {
  const clave = `${tabla}:${codigo}`;
  if (cache.has(clave)) return cache.get(clave);
  const fila = await queryOne(`SELECT id FROM ${tabla} WHERE codigo = ?`, [codigo]);
  if (!fila) throw new Error(`Catalogo ${tabla} sin el codigo ${codigo}. Ejecute seed.sql`);
  cache.set(clave, fila.id);
  return fila.id;
}

const rolId          = (codigo) => idPorCodigo('roles', codigo);
const estadoSorteoId = (codigo) => idPorCodigo('estados_sorteo', codigo);
const estadoPagoId   = (codigo) => idPorCodigo('estados_pago', codigo);
const estadoCartonId = (codigo) => idPorCodigo('estados_carton', codigo);
const tipoMensajeId  = (codigo) => idPorCodigo('tipos_mensaje', codigo);
const estadoEnvioId  = (codigo) => idPorCodigo('estados_envio', codigo);

module.exports = {
  rolId, estadoSorteoId, estadoPagoId, estadoCartonId, tipoMensajeId, estadoEnvioId,
};
