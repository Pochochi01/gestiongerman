'use strict';
/**
 * Migración 003: posiciones del sorteo (grilla 1 a 20).
 *
 * - `numeros_extraidos.cuenta`: 1 si el número valida cartones, 0 si es
 *   repetido o cae fuera del rango.
 * - Se elimina UNIQUE (jornada_id, numero) para poder guardar todas las
 *   posiciones de la quiniela, incluso las que terminan en las mismas cifras.
 *
 * Idempotente. Uso: npm run migrar:posiciones
 */
const db = require('../src/config/db');

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
  console.log('Migración 003 · posiciones del sorteo');

  if (await columnaExiste('numeros_extraidos', 'cuenta')) {
    console.log('  numeros_extraidos.cuenta ya existe.');
  } else {
    await db.query(
      `ALTER TABLE numeros_extraidos
         ADD COLUMN cuenta TINYINT(1) NOT NULL DEFAULT 1
         COMMENT '1 = valida cartones; 0 = repetido o fuera de rango' AFTER valor_cargado`
    );
    console.log('  numeros_extraidos.cuenta agregada.');
  }

  if (await indiceExiste('numeros_extraidos', 'uq_extraido_jornada_numero')) {
    await db.query('ALTER TABLE numeros_extraidos DROP INDEX uq_extraido_jornada_numero');
    console.log('  UNIQUE (jornada_id, numero) eliminado: ya admite posiciones repetidas.');
  } else {
    console.log('  UNIQUE (jornada_id, numero) ya no estaba.');
  }

  if (await indiceExiste('numeros_extraidos', 'idx_extraido_numero')) {
    console.log('  idx_extraido_numero ya existe.');
  } else {
    await db.query(
      'ALTER TABLE numeros_extraidos ADD INDEX idx_extraido_numero (jornada_id, numero, cuenta)'
    );
    console.log('  idx_extraido_numero agregado.');
  }

  const r = await db.query('UPDATE numeros_extraidos SET cuenta = 1 WHERE cuenta <> 1');
  console.log(`  filas normalizadas a cuenta=1: ${r.affectedRows}`);

  console.log('\nMigración completa.');
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Error en la migración:', err.message);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
