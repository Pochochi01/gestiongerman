'use strict';
/**
 * Modelo de domicilios.
 *
 * Reemplaza al viejo `geo.model.js`: el sistema ya no usa mapas ni coordenadas,
 * así que la tabla `ubicaciones` se eliminó. Queda el domicilio como texto
 * simple (calle y número) del vendedor.
 *
 * `localidad_id` admite NULL: el formulario no pide provincia ni localidad.
 */
const { pool } = require('../config/db');

const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

/** ¿Hay algo que guardar? Un domicilio vacío no se crea. */
const tieneDatos = (d) => Boolean(d && String(d.calle || '').trim());

async function crear(domicilio, conn = null) {
  if (!tieneDatos(domicilio)) return null;
  const [res] = await exec(
    conn,
    `INSERT INTO domicilios (localidad_id, calle, numero, piso, departamento, referencia)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      domicilio.localidad_id ?? null,
      domicilio.calle,
      domicilio.numero ?? null,
      domicilio.piso ?? null,
      domicilio.departamento ?? null,
      domicilio.referencia ?? null,
    ]
  );
  return res.insertId;
}

/** Crea el domicilio si no existía, o actualiza el que ya estaba. */
async function guardar(domicilioId, domicilio, conn = null) {
  if (!tieneDatos(domicilio)) return domicilioId;
  if (!domicilioId) return crear(domicilio, conn);

  await exec(
    conn,
    `UPDATE domicilios
        SET calle = ?, numero = ?, piso = ?, departamento = ?, referencia = ?
      WHERE id = ?`,
    [
      domicilio.calle,
      domicilio.numero ?? null,
      domicilio.piso ?? null,
      domicilio.departamento ?? null,
      domicilio.referencia ?? null,
      domicilioId,
    ]
  );
  return domicilioId;
}

module.exports = { crear, guardar, tieneDatos };
