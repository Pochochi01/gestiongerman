'use strict';
/**
 * Crea (o actualiza la clave del) usuario administrador definido en .env.
 * Uso: npm run seed:admin
 */
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const db = require('../src/config/db');
const usuarioModel = require('../src/models/usuario.model');
const catalogo = require('../src/models/catalogo.model');

async function main() {
  const rolId = await catalogo.rolId('ADMIN');
  const hash = await bcrypt.hash(env.admin.password, 10);
  const existente = await usuarioModel.buscarPorUsername(env.admin.username);

  if (existente) {
    await db.query('UPDATE usuarios SET password_hash = ?, activo = 1 WHERE id = ?', [
      hash,
      existente.id,
    ]);
    console.log(`Clave del administrador "${env.admin.username}" actualizada.`);
  } else {
    await usuarioModel.crear({
      rolId,
      username: env.admin.username,
      passwordHash: hash,
      debeCambiarPassword: 1,
    });
    console.log(`Administrador "${env.admin.username}" creado.`);
  }

  console.log(`Clave: ${env.admin.password}  (cambiela desde el sistema)`);
  await db.pool.end();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
