'use strict';
/**
 * Migración 002: carga de números por quiniela (4 cifras).
 *
 * - `jornadas.nombre` y `jornadas.numero_sorteo`
 * - `numeros_extraidos.valor_cargado`
 *
 * Idempotente: se puede correr varias veces sin efecto.
 * Uso: npm run migrar:nocturna
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

/** Agrega la columna sólo si falta. */
async function agregarColumna(tabla, columna, definicion) {
  if (await columnaExiste(tabla, columna)) {
    console.log(`  ${tabla}.${columna} ya existe.`);
    return;
  }
  await db.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  console.log(`  ${tabla}.${columna} agregada.`);
}

async function main() {
  console.log('Migración 002 · carga por quiniela');

  await agregarColumna(
    'jornadas',
    'nombre',
    "VARCHAR(40) NOT NULL DEFAULT 'Nocturna' COMMENT 'Loteria de la que se toman los numeros' AFTER fecha"
  );
  await agregarColumna(
    'jornadas',
    'numero_sorteo',
    "INT UNSIGNED NULL COMMENT 'Numero de sorteo de la quiniela' AFTER nombre"
  );
  await agregarColumna(
    'numeros_extraidos',
    'valor_cargado',
    "SMALLINT UNSIGNED NULL COMMENT 'Valor de hasta 4 cifras ingresado por el administrador' AFTER numero"
  );

  // Lo ya cargado se ingresó de a dos cifras: el valor coincide con el número.
  const r = await db.query(
    'UPDATE numeros_extraidos SET valor_cargado = numero WHERE valor_cargado IS NULL'
  );
  console.log(`  valores cargados completados: ${r.affectedRows}`);

  console.log('\nMigración completa.');
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Error en la migración:', err.message);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
