'use strict';
/**
 * Modelo de administradores.
 *
 * Solo contiene los administradores creados desde el sistema. La cuenta raiz
 * (la del seed, `usuarios.es_raiz = 1`) no tiene fila aca, asi que no aparece
 * en ninguna consulta de este archivo ni se puede alcanzar por id.
 *
 * Igual, cada consulta lleva `u.es_raiz = 0` de forma explicita. Es redundante
 * hoy, y a proposito: si alguna vez se le crea una ficha a la cuenta raiz por
 * error o por una migracion futura, el CRUD sigue sin poder tocarla.
 */
const { pool, query, queryOne } = require('../config/db');

/** Ejecuta sobre la conexion de la transaccion si se pasa, si no sobre el pool. */
const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

const SELECT_BASE = `
  SELECT a.id, a.usuario_id, a.apellido, a.nombre, a.dni,
         a.creado_en, a.actualizado_en,
         u.username, u.activo, u.debe_cambiar_password, u.ultimo_acceso,
         creador.username AS creado_por_username
  FROM administradores a
  JOIN usuarios u       ON u.id = a.usuario_id
  LEFT JOIN usuarios creador ON creador.id = a.creado_por
  WHERE u.es_raiz = 0`;

/**
 * Lista los administradores, con busqueda por apellido, nombre o DNI.
 *
 * `activo` llega como texto desde el query string ('1' / '0'); se compara
 * contra la cadena para no tratar '0' como falso.
 */
function listar({ busqueda, activo } = {}) {
  const where = [];
  const params = [];

  if (busqueda) {
    where.push('(a.apellido LIKE ? OR a.nombre LIKE ? OR a.dni LIKE ?)');
    const like = `%${busqueda}%`;
    params.push(like, like, like);
  }
  if (activo === '1' || activo === '0') {
    where.push('u.activo = ?');
    params.push(Number(activo));
  }

  const filtro = where.length ? ` AND ${where.join(' AND ')}` : '';
  return query(`${SELECT_BASE}${filtro} ORDER BY a.apellido, a.nombre`, params);
}

const buscarPorId = (id) => queryOne(`${SELECT_BASE} AND a.id = ?`, [id]);

const buscarPorDni = (dni) => queryOne(`${SELECT_BASE} AND a.dni = ?`, [dni]);

const buscarPorUsuarioId = (usuarioId) =>
  queryOne(`${SELECT_BASE} AND a.usuario_id = ?`, [usuarioId]);

/**
 * Cuenta los administradores activos, raiz incluida.
 *
 * Se usa como resguardo contra el bloqueo total: si al inhabilitar o eliminar
 * uno no quedara ninguno, el sistema se queda sin quien lo administre y no hay
 * forma de volver a entrar sin tocar la base a mano.
 */
async function activos(conn = null) {
  const [filas] = await exec(
    conn,
    `SELECT COUNT(*) AS n
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
      WHERE r.codigo = 'ADMIN' AND u.activo = 1`
  );
  return Number(filas[0].n);
}

async function crear({ usuario_id, apellido, nombre, dni, creado_por }, conn = null) {
  const [res] = await exec(
    conn,
    `INSERT INTO administradores (usuario_id, apellido, nombre, dni, creado_por)
     VALUES (?, ?, ?, ?, ?)`,
    [usuario_id, apellido, nombre, dni, creado_por ?? null]
  );
  return res.insertId;
}

const actualizar = (id, { apellido, nombre }, conn = null) =>
  exec(conn, 'UPDATE administradores SET apellido = ?, nombre = ? WHERE id = ?', [
    apellido,
    nombre,
    id,
  ]);

module.exports = {
  listar, buscarPorId, buscarPorDni, buscarPorUsuarioId, activos, crear, actualizar,
};
