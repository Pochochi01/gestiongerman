'use strict';
/** Modelo de sorteos. */
const { pool, query, queryOne } = require('../config/db');

const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

const SELECT_BASE = `
  SELECT s.id, s.numero, s.nombre, s.estado_id, es.codigo AS estado, es.nombre AS estado_nombre,
         s.cartones_objetivo, s.numeros_por_carton, s.rango_min, s.rango_max, s.precio_carton,
         s.color_carton,
         s.creado_por, s.creado_en, s.iniciado_en, s.finalizado_en,
         (SELECT COUNT(*) FROM cartones c
            WHERE c.sorteo_id = s.id
              AND c.estado_id <> (SELECT id FROM estados_carton WHERE codigo = 'ANULADO')
         ) AS cartones_vendidos
  FROM sorteos s
  JOIN estados_sorteo es ON es.id = s.estado_id`;

/** Agrega el calculo de faltantes al resultado crudo. */
function conProgreso(fila) {
  if (!fila) return null;
  const vendidos = Number(fila.cartones_vendidos || 0);
  return {
    ...fila,
    cartones_vendidos: vendidos,
    cartones_faltantes: Math.max(Number(fila.cartones_objetivo) - vendidos, 0),
  };
}

async function listar() {
  const filas = await query(`${SELECT_BASE} ORDER BY s.numero DESC`);
  return filas.map(conProgreso);
}

const buscarPorId = async (id) => conProgreso(await queryOne(`${SELECT_BASE} WHERE s.id = ?`, [id]));

/** Sorteo vigente: el que esta en venta o en curso (el de numero mas alto). */
const vigente = async () =>
  conProgreso(
    await queryOne(
      `${SELECT_BASE} WHERE es.codigo IN ('EN_VENTA', 'EN_CURSO') ORDER BY s.numero DESC LIMIT 1`
    )
  );

/** Sorteo que admite venta de cartones. */
const abiertoParaVenta = async () =>
  conProgreso(
    await queryOne(`${SELECT_BASE} WHERE es.codigo = 'EN_VENTA' ORDER BY s.numero ASC LIMIT 1`)
  );

const proximoNumero = async () => {
  const fila = await queryOne('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM sorteos');
  return fila.n;
};

async function crear(datos, conn = null) {
  const [res] = await exec(
    conn,
    `INSERT INTO sorteos
       (numero, nombre, estado_id, cartones_objetivo, numeros_por_carton,
        rango_min, rango_max, precio_carton, color_carton, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.numero,
      datos.nombre,
      datos.estado_id,
      datos.cartones_objetivo,
      datos.numeros_por_carton,
      datos.rango_min,
      datos.rango_max,
      datos.precio_carton ?? 0,
      datos.color_carton,
      datos.creado_por,
    ]
  );
  return res.insertId;
}

const actualizarConfiguracion = (id, datos, conn = null) =>
  exec(
    conn,
    `UPDATE sorteos
        SET nombre = ?, cartones_objetivo = ?, numeros_por_carton = ?,
            rango_min = ?, rango_max = ?, precio_carton = ?
      WHERE id = ?`,
    [
      datos.nombre,
      datos.cartones_objetivo,
      datos.numeros_por_carton,
      datos.rango_min,
      datos.rango_max,
      datos.precio_carton ?? 0,
      id,
    ]
  );

const cambiarEstado = (id, estadoId, campoFecha = null, conn = null) =>
  exec(
    conn,
    `UPDATE sorteos SET estado_id = ?${campoFecha ? `, ${campoFecha} = NOW()` : ''} WHERE id = ?`,
    [estadoId, id]
  );

module.exports = {
  listar, buscarPorId, vigente, abiertoParaVenta, proximoNumero,
  crear, actualizarConfiguracion, cambiarEstado,
};
