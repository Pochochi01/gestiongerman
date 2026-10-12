'use strict';
/**
 * Migración 001: agrega `carton_numeros.celda` y reparte en la grilla los
 * cartones que ya existían.
 *
 * Es idempotente: si la columna ya está, sólo completa los que quedaron en
 * NULL. No modifica los cartones que ya tienen disposición.
 *
 * Uso: npm run migrar:celdas
 */
const db = require('../src/config/db');
const { generarDisposicion } = require('../src/utils/helpers');

async function columnaExiste(tabla, columna) {
  const fila = await db.queryOne(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna]
  );
  return Number(fila.n) > 0;
}

async function indiceExiste(tabla, indice) {
  const fila = await db.queryOne(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tabla, indice]
  );
  return Number(fila.n) > 0;
}

async function main() {
  if (await columnaExiste('carton_numeros', 'celda')) {
    console.log('La columna `celda` ya existe.');
  } else {
    await db.query(
      `ALTER TABLE carton_numeros
         ADD COLUMN celda TINYINT UNSIGNED NULL
         COMMENT 'Casillero 1..30 en la grilla 3x10' AFTER posicion`
    );
    console.log('Columna `celda` agregada.');
  }

  // El backfill se hace antes del índice único, para no chocar con los NULL.
  const pendientes = await db.query(
    'SELECT DISTINCT carton_id FROM carton_numeros WHERE celda IS NULL ORDER BY carton_id'
  );

  if (pendientes.length === 0) {
    console.log('No hay cartones pendientes de repartir.');
  } else {
    console.log(`Repartiendo ${pendientes.length} cartón(es) en la grilla...`);
    for (const { carton_id: cartonId } of pendientes) {
      const filas = await db.query(
        'SELECT numero FROM carton_numeros WHERE carton_id = ? ORDER BY numero',
        [cartonId]
      );
      const disposicion = generarDisposicion(filas.map((f) => Number(f.numero)));

      await db.withTransaction(async (conn) => {
        // `posicion` tiene índice único por cartón: si se reasignara fila por
        // fila, el nuevo valor chocaría con el que todavía tiene otra fila.
        // Por eso primero se corren todas a un rango libre (+100) y recién
        // después se escriben los valores definitivos.
        await conn.execute(
          'UPDATE carton_numeros SET posicion = posicion + 100 WHERE carton_id = ?',
          [cartonId]
        );
        for (let i = 0; i < disposicion.length; i += 1) {
          await conn.execute(
            'UPDATE carton_numeros SET celda = ?, posicion = ? WHERE carton_id = ? AND numero = ?',
            [disposicion[i].celda, i + 1, cartonId, disposicion[i].numero]
          );
        }
      });

      console.log(
        `  cartón ${cartonId}: ${disposicion.map((d) => `${d.numero}@${d.celda}`).join(' ')}`
      );
    }
  }

  if (await indiceExiste('carton_numeros', 'uq_carton_celda')) {
    console.log('El índice `uq_carton_celda` ya existe.');
  } else {
    await db.query('ALTER TABLE carton_numeros ADD UNIQUE KEY uq_carton_celda (carton_id, celda)');
    console.log('Índice único (carton_id, celda) agregado.');
  }

  console.log('\nMigración completa.');
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Error en la migración:', err.message);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
