'use strict';
/**
 * Migración 006: varios administradores.
 *
 * Agrega `usuarios.es_raiz` (la cuenta fundadora, invisible para los demás
 * administradores) y la tabla `administradores` con sus datos personales.
 *
 * A diferencia del .sql, este script marca la cuenta raíz por el
 * ADMIN_USERNAME del .env, que es el criterio exacto; si ese usuario no
 * existe, cae al ADMIN de id más bajo, que es el que creó el seed.
 *
 * Idempotente. Uso: npm run migrar:administradores
 */
const db = require('../src/config/db');
const env = require('../src/config/env');

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

async function main() {
  console.log(`Migrando la base "${env.db.database}"...\n`);

  // ---- 1. usuarios.es_raiz --------------------------------------------
  if (await columnaExiste('usuarios', 'es_raiz')) {
    console.log('1. usuarios.es_raiz ya existe.');
  } else {
    await db.query(
      `ALTER TABLE usuarios
         ADD COLUMN es_raiz TINYINT(1) NOT NULL DEFAULT 0
         COMMENT 'Cuenta fundadora: invisible e intocable para los demas administradores'
         AFTER activo`
    );
    console.log('1. usuarios.es_raiz agregada.');
  }

  // ---- 2. Se marca la cuenta fundadora --------------------------------
  const yaMarcados = await db.queryOne('SELECT COUNT(*) AS n FROM usuarios WHERE es_raiz = 1');
  if (Number(yaMarcados.n) > 0) {
    const raiz = await db.query('SELECT username FROM usuarios WHERE es_raiz = 1');
    console.log(`2. Ya hay cuenta raiz: ${raiz.map((r) => r.username).join(', ')}.`);
  } else {
    const porEnv = await db.queryOne(
      `SELECT u.id, u.username FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
        WHERE r.codigo = 'ADMIN' AND u.username = ?`,
      [env.admin.username]
    );
    const elegido =
      porEnv ||
      (await db.queryOne(
        `SELECT u.id, u.username FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
          WHERE r.codigo = 'ADMIN'
          ORDER BY u.id
          LIMIT 1`
      ));

    if (!elegido) {
      console.log('2. No hay ningun ADMIN todavia. Ejecute: npm run seed:admin');
    } else {
      await db.query('UPDATE usuarios SET es_raiz = 1 WHERE id = ?', [elegido.id]);
      console.log(
        `2. Cuenta raiz: "${elegido.username}"` +
          (porEnv ? ' (por ADMIN_USERNAME del .env).' : ' (el ADMIN de id mas bajo).')
      );
    }
  }

  // ---- 3. Tabla administradores ---------------------------------------
  if (await tablaExiste('administradores')) {
    const n = await db.queryOne('SELECT COUNT(*) AS n FROM administradores');
    console.log(`3. La tabla administradores ya existe (${n.n} fila/s).`);
  } else {
    await db.query(
      `CREATE TABLE administradores (
         id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
         usuario_id     INT UNSIGNED NOT NULL UNIQUE,
         apellido       VARCHAR(80) NOT NULL,
         nombre         VARCHAR(80) NOT NULL,
         dni            VARCHAR(15) NOT NULL UNIQUE,
         creado_por     INT UNSIGNED NULL
                        COMMENT 'Usuario que lo dio de alta; NULL si esa cuenta se elimina',
         creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         CONSTRAINT fk_administrador_usuario FOREIGN KEY (usuario_id)
           REFERENCES usuarios(id) ON DELETE CASCADE,
         CONSTRAINT fk_administrador_creador FOREIGN KEY (creado_por)
           REFERENCES usuarios(id) ON DELETE SET NULL
       ) ENGINE=InnoDB`
    );
    console.log('3. Tabla administradores creada.');
  }

  // ---- Comprobacion ----------------------------------------------------
  const resumen = await db.query(
    `SELECT u.username, u.es_raiz, u.activo,
            CASE WHEN a.id IS NULL THEN 'sin ficha' ELSE CONCAT(a.apellido, ', ', a.nombre) END AS ficha
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN administradores a ON a.usuario_id = u.id
      WHERE r.codigo = 'ADMIN'
      ORDER BY u.es_raiz DESC, u.id`
  );
  console.log('\nAdministradores en la base:');
  for (const a of resumen) {
    console.log(
      `  ${a.es_raiz ? '[raiz]' : '      '} ${String(a.username).padEnd(14)} ` +
        `${a.activo ? 'activo  ' : 'inactivo'} ${a.ficha}`
    );
  }

  console.log('\nListo.');
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Error:', err.message);
  try {
    await db.pool.end();
  } catch {}
  process.exit(1);
});
