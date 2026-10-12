'use strict';
/**
 * Crea la base, aplica schema.sql y seed.sql.
 *
 * ATENCIÓN: `schema.sql` empieza con `DROP DATABASE IF EXISTS`, así que esto
 * REHACE la base desde cero. Por eso el script se niega a correr si la base ya
 * tiene tablas, salvo que se pase `--forzar`.
 *
 * Para una base que ya está en uso no se usa este script: se aplican las
 * migraciones de `database/migrations/` (ver docs/08-produccion.md).
 *
 * Uso:
 *   npm run db:install              instalación nueva
 *   npm run db:install -- --forzar  rehace una base existente (BORRA TODO)
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const forzar = process.argv.includes('--forzar');

async function main() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  // ---- Seguro: no pisar una base con datos sin que lo pidan expresamente ----
  const [[{ tablas }]] = await conn.query(
    `SELECT COUNT(*) AS tablas FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    [env.db.database]
  );

  if (tablas > 0 && !forzar) {
    const [[conteo]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM \`${env.db.database}\`.cartones)  AS cartones,
         (SELECT COUNT(*) FROM \`${env.db.database}\`.jugadores) AS jugadores,
         (SELECT COUNT(*) FROM \`${env.db.database}\`.sorteos)   AS sorteos`
    ).catch(() => [[{ cartones: '?', jugadores: '?', sorteos: '?' }]]);

    await conn.end();
    console.error(
      `\nLa base "${env.db.database}" ya existe y tiene ${tablas} tablas ` +
        `(${conteo.sorteos} sorteos, ${conteo.jugadores} jugadores, ${conteo.cartones} cartones).\n\n` +
        'Este script la REHACE DESDE CERO y perdería todo eso.\n\n' +
        'Si querías actualizar el esquema, usá las migraciones:\n' +
        '  npm run migrar:celdas\n' +
        '  npm run migrar:nocturna\n' +
        '  npm run migrar:posiciones\n' +
        '  npm run migrar:pdf\n' +
        '  npm run migrar:sin-geo\n\n' +
        'Si de verdad querés borrarla y empezar de nuevo:\n' +
        '  npm run db:install -- --forzar\n'
    );
    process.exit(1);
  }

  if (forzar && tablas > 0) {
    console.log(`Rehaciendo la base "${env.db.database}" (--forzar): se pierden los datos actuales.`);
  }

  // `schema.sql` y `seed.sql` nombran la base como `bingodgg`. Si DB_NAME
  // apunta a otra, hay que reemplazarlo: de lo contrario los scripts
  // trabajarían sobre `bingodgg` ignorando la configuración, y el
  // `DROP DATABASE` del encabezado borraría la base equivocada.
  const reemplazarNombre = (sql) =>
    env.db.database === 'bingodgg'
      ? sql
      : sql.replace(/\bbingodgg\b/g, env.db.database);

  if (env.db.database !== 'bingodgg') {
    console.log(`Aplicando sobre la base "${env.db.database}" (DB_NAME).`);
  }

  const dir = path.join(__dirname, '..', 'database');
  for (const archivo of ['schema.sql', 'seed.sql']) {
    const sql = reemplazarNombre(fs.readFileSync(path.join(dir, archivo), 'utf8'));
    process.stdout.write(`Aplicando ${archivo}... `);
    await conn.query(sql);
    console.log('OK');
  }

  await conn.end();
  console.log(`\nBase "${env.db.database}" lista. Ahora ejecute: npm run seed:admin`);
}

main().catch((err) => {
  console.error('Error instalando la base:', err.message);
  process.exit(1);
});
