'use strict';
/**
 * Modelo de jornadas (el sorteo diario de la quiniela) y números extraídos.
 *
 * Cada jornada registra la fecha, el nombre de la lotería ('Nocturna') y el
 * número de sorteo de esa quiniela. Los números guardan dos valores:
 *   - `valor_cargado`: lo que tipeó el administrador (hasta 4 cifras)
 *   - `numero`: las dos últimas cifras, que son las que validan los cartones
 */
const { pool, query, queryOne } = require('../config/db');
const { LOTERIA_POR_DEFECTO } = require('../utils/helpers');

const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

const buscarPorFecha = (sorteoId, fecha, conn = null) =>
  exec(conn, 'SELECT * FROM jornadas WHERE sorteo_id = ? AND fecha = ?', [sorteoId, fecha]).then(
    ([f]) => f[0] || null
  );

async function crear(
  { sorteoId, fecha, creadoPor, nombre = LOTERIA_POR_DEFECTO, numeroSorteo = null },
  conn = null
) {
  const [res] = await exec(
    conn,
    'INSERT INTO jornadas (sorteo_id, fecha, nombre, numero_sorteo, creado_por) VALUES (?, ?, ?, ?, ?)',
    [sorteoId, fecha, nombre, numeroSorteo, creadoPor]
  );
  return res.insertId;
}

/**
 * Devuelve la jornada de esa fecha; la crea si aún no existe.
 * Si ya existía y ahora llega el número de sorteo, lo completa.
 */
async function obtenerOCrear(
  { sorteoId, fecha, creadoPor, nombre = LOTERIA_POR_DEFECTO, numeroSorteo = null },
  conn = null
) {
  const existente = await buscarPorFecha(sorteoId, fecha, conn);
  if (!existente) return crear({ sorteoId, fecha, creadoPor, nombre, numeroSorteo }, conn);

  if (numeroSorteo != null && Number(existente.numero_sorteo) !== Number(numeroSorteo)) {
    await exec(conn, 'UPDATE jornadas SET numero_sorteo = ?, nombre = ? WHERE id = ?', [
      numeroSorteo,
      nombre,
      existente.id,
    ]);
  }
  return existente.id;
}

/**
 * Números (dos cifras) que ya salieron en el sorteo y valen para los cartones.
 * Se excluyen los `cuenta = 0` (repetidos o fuera de rango).
 */
async function numerosDelSorteo(sorteoId, conn = null) {
  const [filas] = await exec(
    conn,
    `SELECT DISTINCT ne.numero
       FROM numeros_extraidos ne
       JOIN jornadas jo ON jo.id = ne.jornada_id
      WHERE jo.sorteo_id = ? AND ne.cuenta = 1`,
    [sorteoId]
  );
  return filas.map((f) => Number(f.numero));
}

/** Próxima posición libre de la jornada (las posiciones son 1..20). */
async function proximaPosicion(jornadaId, conn = null) {
  const [filas] = await exec(
    conn,
    'SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM numeros_extraidos WHERE jornada_id = ?',
    [jornadaId]
  );
  return Number(filas[0].n);
}

/**
 * Agrega los números de la jornada, uno por posición del sorteo.
 *
 * Se guardan TODAS las posiciones, incluso las que no suman al bingo, para que
 * la grilla 1..20 sea un registro fiel de la quiniela. `cuenta` distingue las
 * que validan cartones de las repetidas o fuera de rango.
 *
 * @param {{valor:number, numero:number, posicion?:number, cuenta?:boolean}[]} numeros
 */
async function agregarNumeros(jornadaId, numeros, conn = null) {
  const base = await proximaPosicion(jornadaId, conn);
  let i = 0;
  for (const n of numeros) {
    const posicion = n.posicion ?? base + i;
    await exec(
      conn,
      `INSERT INTO numeros_extraidos (jornada_id, numero, valor_cargado, cuenta, orden)
       VALUES (?, ?, ?, ?, ?)`,
      [jornadaId, n.numero, n.valor ?? n.numero, n.cuenta === false ? 0 : 1, posicion]
    );
    i += 1;
  }
}

/**
 * Jornadas del sorteo con sus números, más reciente primero.
 *
 * Cada jornada trae:
 *   - `numeros`: las dos cifras que valen para los cartones (sin repetir)
 *   - `extracciones`: una entrada por posición del sorteo (1..20), con el
 *     valor cargado, el número que juega y si cuenta o no
 */
async function historial(sorteoId) {
  const filas = await query(
    `SELECT jo.id AS jornada_id, jo.fecha, jo.nombre, jo.numero_sorteo, jo.cerrada,
            ne.numero, ne.valor_cargado, ne.cuenta, ne.orden
       FROM jornadas jo
       LEFT JOIN numeros_extraidos ne ON ne.jornada_id = jo.id
      WHERE jo.sorteo_id = ?
      ORDER BY jo.fecha DESC, ne.orden ASC`,
    [sorteoId]
  );

  const mapa = new Map();
  for (const f of filas) {
    if (!mapa.has(f.jornada_id)) {
      mapa.set(f.jornada_id, {
        jornada_id: f.jornada_id,
        fecha: f.fecha,
        nombre: f.nombre,
        numero_sorteo: f.numero_sorteo === null ? null : Number(f.numero_sorteo),
        cerrada: !!f.cerrada,
        numeros: [],
        extracciones: [],
      });
    }
    if (f.numero !== null) {
      const j = mapa.get(f.jornada_id);
      const cuenta = f.cuenta === undefined ? true : !!f.cuenta;
      if (cuenta && !j.numeros.includes(Number(f.numero))) j.numeros.push(Number(f.numero));
      j.extracciones.push({
        posicion: Number(f.orden),
        valor_cargado: f.valor_cargado === null ? null : Number(f.valor_cargado),
        numero: Number(f.numero),
        cuenta,
      });
    }
  }
  return [...mapa.values()];
}

const cerrar = (jornadaId) => query('UPDATE jornadas SET cerrada = 1 WHERE id = ?', [jornadaId]);

const buscarPorId = (id) => queryOne('SELECT * FROM jornadas WHERE id = ?', [id]);

module.exports = {
  buscarPorFecha, buscarPorId, crear, obtenerOCrear, numerosDelSorteo, proximaPosicion,
  agregarNumeros, historial, cerrar,
};
