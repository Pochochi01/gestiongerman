'use strict';
/**
 * Crea (o actualiza la clave del) usuario administrador definido en .env.
 *
 * Esta es la cuenta raiz: queda con `usuarios.es_raiz = 1`, que es lo que la
 * hace invisible e intocable para los administradores creados despues desde el
 * sistema. Volver a correr el script la vuelve a marcar, asi que la marca no se
 * pierde por un blanqueo de clave.
 *
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
    await db.query(
      'UPDATE usuarios SET password_hash = ?, activo = 1, es_raiz = 1 WHERE id = ?',
      [hash, existente.id]
    );
    console.log(`Clave del administrador raiz "${env.admin.username}" actualizada.`);
  } else {
    const id = await usuarioModel.crear({
      rolId,
      username: env.admin.username,
      passwordHash: hash,
      debeCambiarPassword: 1,
    });
    await db.query('UPDATE usuarios SET es_raiz = 1 WHERE id = ?', [id]);
    console.log(`Administrador raiz "${env.admin.username}" creado.`);
  }

  console.log('Esta cuenta no aparece en /admin/administradores: es la cuenta raiz.');

  console.log(`Clave: ${env.admin.password}  (cambiela desde el sistema)`);
  await db.pool.end();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
