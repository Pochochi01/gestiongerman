'use strict';
/** Modelo de vendedores. */
const { pool, query, queryOne } = require('../config/db');

const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

const SELECT_BASE = `
  SELECT v.id, v.usuario_id, v.apellido, v.nombre, v.dni, v.telefono,
         v.habilitado, v.creado_en,
         v.domicilio_id, d.calle, d.numero, d.piso, d.departamento, d.referencia,
         u.username, u.activo AS usuario_activo,
         (SELECT COUNT(*) FROM jugadores j WHERE j.vendedor_id = v.id) AS jugadores_cargados
  FROM vendedores v
  JOIN usuarios u        ON u.id = v.usuario_id
  LEFT JOIN domicilios d ON d.id = v.domicilio_id`;

async function listar({ busqueda = '', habilitado = null } = {}) {
  const where = [];
  const params = [];
  if (busqueda) {
    where.push('(v.apellido LIKE ? OR v.nombre LIKE ? OR v.dni LIKE ?)');
    const like = `%${busqueda}%`;
    params.push(like, like, like);
  }
  if (habilitado !== null && habilitado !== undefined && habilitado !== '') {
    where.push('v.habilitado = ?');
    params.push(Number(habilitado) ? 1 : 0);
  }
  const sql = `${SELECT_BASE}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
               ORDER BY v.apellido, v.nombre`;
  return query(sql, params);
}

const buscarPorId = (id) => queryOne(`${SELECT_BASE} WHERE v.id = ?`, [id]);
const buscarPorDni = (dni) => queryOne(`${SELECT_BASE} WHERE v.dni = ?`, [dni]);
const buscarPorUsuarioId = (usuarioId) => queryOne(`${SELECT_BASE} WHERE v.usuario_id = ?`, [usuarioId]);

async function crear(datos, conn = null) {
  const [res] = await exec(
    conn,
    `INSERT INTO vendedores
       (usuario_id, apellido, nombre, dni, telefono, domicilio_id, habilitado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.usuario_id,
      datos.apellido,
      datos.nombre,
      datos.dni,
      datos.telefono,
      datos.domicilio_id ?? null,
      datos.habilitado ? 1 : 0,
    ]
  );
  return res.insertId;
}

async function actualizar(id, datos, conn = null) {
  await exec(
    conn,
    `UPDATE vendedores
        SET apellido = ?, nombre = ?, telefono = ?, domicilio_id = ?
      WHERE id = ?`,
    [datos.apellido, datos.nombre, datos.telefono, datos.domicilio_id ?? null, id]
  );
}

const cambiarHabilitacion = (id, habilitado, conn = null) =>
  exec(conn, 'UPDATE vendedores SET habilitado = ? WHERE id = ?', [habilitado ? 1 : 0, id]);

const eliminar = (id) => query('DELETE FROM vendedores WHERE id = ?', [id]);

module.exports = {
  listar, buscarPorId, buscarPorDni, buscarPorUsuarioId,
  crear, actualizar, cambiarHabilitacion, eliminar,
};
