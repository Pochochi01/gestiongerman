'use strict';
/**
 * Migración 004: PDF del cartón, QR de validación y color por sorteo.
 *
 * - `sorteos.color_carton`: color de los cartones de ese sorteo.
 * - `cartones.token_validacion`: token del QR (único).
 * - `cartones.pdf_archivo` / `pdf_generado_en`: referencia al PDF emitido.
 *
 * Además completa los datos de lo que ya existe: asigna un color a cada sorteo
 * según su número y genera el token de los cartones que no lo tienen.
 *
 * Idempotente. Uso: npm run migrar:pdf
 */
const crypto = require('crypto');
const db = require('../src/config/db');
const { colorDeSorteo } = require('../src/utils/colores');

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

async function agregarColumna(tabla, columna, definicion) {
  if (await columnaExiste(tabla, columna)) {
    console.log(`  ${tabla}.${columna} ya existe.`);
    return;
  }
  await db.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  console.log(`  ${tabla}.${columna} agregada.`);
}

async function main() {
  console.log('Migración 004 · PDF, QR y color por sorteo');

  await agregarColumna(
    'sorteos',
    'color_carton',
    "VARCHAR(7) NOT NULL DEFAULT '#1f40f5' COMMENT 'Color de los cartones de este sorteo (hex)' AFTER precio_carton"
  );
  await agregarColumna(
    'cartones',
    'token_validacion',
    "CHAR(32) NULL COMMENT 'Token del QR de validacion' AFTER codigo"
  );
  await agregarColumna(
    'cartones',
    'pdf_archivo',
    "VARCHAR(255) NULL COMMENT 'Nombre del PDF emitido' AFTER habilitado_en"
  );
  await agregarColumna('cartones', 'pdf_generado_en', 'DATETIME NULL AFTER pdf_archivo');

  // --- Color de los sorteos que ya existían ---
  const sorteos = await db.query('SELECT id, numero FROM sorteos');
  let coloreados = 0;
  for (const s of sorteos) {
    const color = colorDeSorteo(s.numero);
    const r = await db.query('UPDATE sorteos SET color_carton = ? WHERE id = ? AND color_carton <> ?', [
      color,
      s.id,
      color,
    ]);
    if (r.affectedRows) coloreados += 1;
  }
  console.log(`  sorteos coloreados: ${coloreados} de ${sorteos.length}`);

  // --- Token de los cartones que no lo tienen ---
  const sinToken = await db.query('SELECT id FROM cartones WHERE token_validacion IS NULL');
  for (const c of sinToken) {
    await db.query('UPDATE cartones SET token_validacion = ? WHERE id = ?', [
      crypto.randomBytes(16).toString('hex'),
      c.id,
    ]);
  }
  console.log(`  tokens generados: ${sinToken.length}`);

  if (await indiceExiste('cartones', 'uq_carton_token')) {
    console.log('  uq_carton_token ya existe.');
  } else {
    await db.query('ALTER TABLE cartones ADD UNIQUE KEY uq_carton_token (token_validacion)');
    console.log('  uq_carton_token agregado.');
  }

  console.log('\nMigración completa.');
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Error en la migración:', err.message);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
