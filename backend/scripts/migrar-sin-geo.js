'use strict';
/**
 * Migración 005: se quita la geolocalización.
 *
 * Elimina la tabla `ubicaciones` y las columnas que la referencian, más
 * `jugadores.domicilio_id`. Deja `domicilios.localidad_id` NULL para que el
 * vendedor conserve un domicilio de calle y número.
 *
 * IRREVERSIBLE: se pierden las coordenadas cargadas. Informa cuántas antes de
 * borrarlas.
 *
 * Idempotente. Uso: npm run migrar:sin-geo
 */
const db = require('../src/config/db');

async function columnaExiste(tabla, columna) {
  const f = await db.queryOne(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna]
  );
  return Number(f.n) > 0;
}

async function tablaExiste(tabla) {
  const f = await db.queryOne(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tabla]
  );
  return Number(f.n) > 0;
}

/** Nombre real de la FK que usa esa columna (no se asume el nombre). */
async function nombreFk(tabla, columna) {
  const f = await db.queryOne(
    `SELECT CONSTRAINT_NAME AS fk FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      LIMIT 1`,
    [tabla, columna]
  );
  return f ? f.fk : null;
}

/** Suelta la FK (si la hay) y después la columna. */
async function quitarColumna(tabla, columna) {
  if (!(await columnaExiste(tabla, columna))) {
    console.log(`  ${tabla}.${columna} ya no existe.`);
    return;
  }
  const fk = await nombreFk(tabla, columna);
  if (fk) {
    await db.query(`ALTER TABLE ${tabla} DROP FOREIGN KEY ${fk}`);
    console.log(`  FK ${fk} eliminada.`);
  }
  await db.query(`ALTER TABLE ${tabla} DROP COLUMN ${columna}`);
  console.log(`  ${tabla}.${columna} eliminada.`);
}

async function main() {
  console.log('Migración 005 · se quita la geolocalización');

  if (await tablaExiste('ubicaciones')) {
    const { n } = await db.queryOne('SELECT COUNT(*) AS n FROM ubicaciones');
    console.log(`  se van a perder ${n} coordenadas`);
  }

  await quitarColumna('vendedores', 'ubicacion_id');
  await quitarColumna('jugadores', 'ubicacion_id');
  await quitarColumna('jugadores', 'domicilio_id');

  if (await tablaExiste('ubicaciones')) {
    await db.query('DROP TABLE ubicaciones');
    console.log('  tabla ubicaciones eliminada.');
  } else {
    console.log('  tabla ubicaciones ya no existe.');
  }

  // El domicilio del vendedor pasa a ser calle + número, sin localidad.
  const col = await db.queryOne(
    `SELECT IS_NULLABLE AS nulo FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'domicilios' AND COLUMN_NAME = 'localidad_id'`
  );
  if (col && col.nulo === 'NO') {
    await db.query('ALTER TABLE domicilios MODIFY COLUMN localidad_id INT UNSIGNED NULL');
    console.log('  domicilios.localidad_id ahora admite NULL.');
  } else {
    console.log('  domicilios.localidad_id ya admitía NULL.');
  }

  console.log('\nMigración completa.');
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Error en la migración:', err.message);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
