'use strict';
/**
 * Crea la base, aplica schema.sql y seed.sql.
 * Uso: npm run db:install
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

async function main() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  const dir = path.join(__dirname, '..', 'database');
  for (const archivo of ['schema.sql', 'seed.sql']) {
    const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
    process.stdout.write(`Aplicando ${archivo}... `);
    await conn.query(sql);
    console.log('OK');
  }

  await conn.end();
  console.log('\nBase lista. Ahora ejecute: npm run seed:admin');
}

main().catch((err) => {
  console.error('Error instalando la base:', err.message);
  process.exit(1);
});
