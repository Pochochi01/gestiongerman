'use strict';
/** Modelo de jugadores (clientes cargados por un vendedor). */
const { pool, query, queryOne } = require('../config/db');

const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

const SELECT_BASE = `
  SELECT j.id, j.usuario_id, j.vendedor_id, j.apellido, j.nombre, j.dni, j.whatsapp, j.creado_en,
         u.username, u.activo AS usuario_activo,
         v.apellido AS vendedor_apellido, v.nombre AS vendedor_nombre, v.telefono AS vendedor_telefono,
         (SELECT COUNT(*) FROM cartones c WHERE c.jugador_id = j.id) AS cartones
  FROM jugadores j
  JOIN usuarios u  ON u.id = j.usuario_id
  JOIN vendedores v ON v.id = j.vendedor_id`;

async function listar({ vendedorId = null, busqueda = '' } = {}) {
  const where = [];
  const params = [];
  if (vendedorId) {
    where.push('j.vendedor_id = ?');
    params.push(vendedorId);
  }
  if (busqueda) {
    where.push('(j.apellido LIKE ? OR j.nombre LIKE ? OR j.dni LIKE ?)');
    const like = `%${busqueda}%`;
    params.push(like, like, like);
  }
  return query(
    `${SELECT_BASE}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY j.apellido, j.nombre`,
    params
  );
}

const buscarPorId = (id) => queryOne(`${SELECT_BASE} WHERE j.id = ?`, [id]);
const buscarPorDni = (dni) => queryOne(`${SELECT_BASE} WHERE j.dni = ?`, [dni]);
const buscarPorUsuarioId = (usuarioId) => queryOne(`${SELECT_BASE} WHERE j.usuario_id = ?`, [usuarioId]);

async function crear(datos, conn = null) {
  const [res] = await exec(
    conn,
    `INSERT INTO jugadores
       (usuario_id, vendedor_id, apellido, nombre, dni, whatsapp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      datos.usuario_id,
      datos.vendedor_id,
      datos.apellido,
      datos.nombre,
      datos.dni,
      datos.whatsapp,
    ]
  );
  return res.insertId;
}

const actualizar = (id, datos, conn = null) =>
  exec(
    conn,
    `UPDATE jugadores
        SET apellido = ?, nombre = ?, whatsapp = ?
      WHERE id = ?`,
    [datos.apellido, datos.nombre, datos.whatsapp, id]
  );

/** Jugadores con carton en un sorteo (para avisos masivos por WhatsApp). */
const conCartonEnSorteo = (sorteoId) =>
  query(
    `SELECT DISTINCT j.id, j.apellido, j.nombre, j.whatsapp
       FROM jugadores j
       JOIN cartones c ON c.jugador_id = j.id
      WHERE c.sorteo_id = ?`,
    [sorteoId]
  );

module.exports = {
  listar, buscarPorId, buscarPorDni, buscarPorUsuarioId,
  crear, actualizar, conCartonEnSorteo,
};
