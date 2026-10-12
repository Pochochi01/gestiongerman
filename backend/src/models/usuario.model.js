'use strict';
/** Modelo de usuarios (credenciales y rol). */
const { pool, query, queryOne } = require('../config/db');

/** Ejecuta sobre la conexion de la transaccion si se pasa, si no sobre el pool. */
const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

const SELECT_BASE = `
  SELECT u.id, u.username, u.password_hash, u.activo, u.debe_cambiar_password,
         u.rol_id, r.codigo AS rol, u.creado_en, u.ultimo_acceso
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id`;

const buscarPorUsername = (username) =>
  queryOne(`${SELECT_BASE} WHERE u.username = ?`, [username]);

const buscarPorId = (id) => queryOne(`${SELECT_BASE} WHERE u.id = ?`, [id]);

async function crear({ rolId, username, passwordHash, debeCambiarPassword = 1, activo = 1 }, conn = null) {
  const [res] = await exec(
    conn,
    `INSERT INTO usuarios (rol_id, username, password_hash, debe_cambiar_password, activo)
     VALUES (?, ?, ?, ?, ?)`,
    [rolId, username, passwordHash, debeCambiarPassword, activo]
  );
  return res.insertId;
}

const actualizarEstado = (usuarioId, activo, conn = null) =>
  exec(conn, 'UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, usuarioId]);

const actualizarPassword = (usuarioId, passwordHash) =>
  query('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 0 WHERE id = ?', [
    passwordHash,
    usuarioId,
  ]);

const registrarAcceso = (usuarioId) =>
  query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [usuarioId]);

module.exports = {
  buscarPorUsername, buscarPorId, crear, actualizarEstado, actualizarPassword, registrarAcceso,
};
