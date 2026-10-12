'use strict';
/**
 * Pool de conexiones MySQL + helpers de consulta y transaccion.
 * Toda la capa de modelos usa este modulo (nunca mysql2 directo).
 */
const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: ['DATE'],
  timezone: 'local',
});

/** Ejecuta una consulta preparada y devuelve las filas. */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Devuelve la primera fila o null. */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * Ejecuta `fn(conn)` dentro de una transaccion.
 * Hace COMMIT si resuelve y ROLLBACK si lanza.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Verifica la conectividad al arrancar el servidor. */
async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryOne, withTransaction, ping };
