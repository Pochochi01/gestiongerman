'use strict';
/**
 * Borra los datos que dejó `npm run seed:simulacion`.
 *
 * Reconoce lo simulado por el prefijo `SIM` en el nombre del sorteo y en los
 * apellidos de vendedores y jugadores, así que no toca los datos reales.
 *
 * Uso: npm run seed:limpiar
 */
const db = require('../src/config/db');

const MARCA = 'SIM';

async function main() {
  const sorteos = await db.query('SELECT id, numero, nombre FROM sorteos WHERE nombre LIKE ?', [
    `${MARCA}%`,
  ]);
  const vendedores = await db.query(
    'SELECT id, usuario_id, apellido, nombre FROM vendedores WHERE apellido LIKE ?',
    [`${MARCA}%`]
  );
  const jugadores = await db.query(
    'SELECT id, usuario_id FROM jugadores WHERE apellido LIKE ?',
    [`${MARCA}%`]
  );

  if (!sorteos.length && !vendedores.length && !jugadores.length) {
    console.log('No hay datos de simulacion para borrar.');
    await db.pool.end();
    return;
  }

  console.log(
    `A borrar: ${sorteos.length} sorteo(s), ${vendedores.length} vendedor(es), ` +
      `${jugadores.length} jugador(es) y sus cartones.`
  );

  await db.withTransaction(async (conn) => {
    // Los mensajes van primero: la FK a jugadores/cartones es ON DELETE SET
    // NULL, así que si se borran antes los jugadores quedan filas huérfanas
    // ensuciando la bandeja de salida del administrador.
    for (const j of jugadores) {
      await conn.execute('DELETE FROM mensajes_whatsapp WHERE jugador_id = ?', [j.id]);
    }

    // Los sorteos arrastran cartones, jornadas y ganadores por ON DELETE CASCADE.
    for (const s of sorteos) {
      await conn.execute('DELETE FROM sorteos WHERE id = ?', [s.id]);
    }
    // Por si quedaron cartones en otros sorteos.
    for (const j of jugadores) {
      await conn.execute('DELETE FROM cartones WHERE jugador_id = ?', [j.id]);
    }
    // Al borrar el usuario cae el jugador/vendedor por ON DELETE CASCADE.
    for (const j of jugadores) {
      await conn.execute('DELETE FROM usuarios WHERE id = ?', [j.usuario_id]);
    }
    for (const v of vendedores) {
      await conn.execute('DELETE FROM usuarios WHERE id = ?', [v.usuario_id]);
    }
  });


  // Mensajes que quedaron sin jugador ni carton: sólo pueden venir de datos ya
  // borrados (simulaciones anteriores), y ensucian la bandeja del administrador.
  const mensajes = await db.query(
    'DELETE FROM mensajes_whatsapp WHERE jugador_id IS NULL AND carton_id IS NULL'
  );

  // Los domicilios quedan sin referencias (la FK es ON DELETE SET NULL).
  const domicilios = await db.query(
    `DELETE d FROM domicilios d
      WHERE d.calle LIKE ?
        AND NOT EXISTS (SELECT 1 FROM vendedores v WHERE v.domicilio_id = d.id)`,
    [`Calle ${MARCA}%`]
  );

  console.log(
    `Limpieza lista. Domicilios: ${domicilios.affectedRows}, ` +
      `mensajes huerfanos: ${mensajes.affectedRows}.`
  );

  const quedan = await db.query('SELECT numero, nombre FROM sorteos ORDER BY numero');
  console.log('Sorteos restantes:', quedan.map((s) => `${s.numero}:${s.nombre}`).join(', ') || '(ninguno)');
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('Error limpiando:', err.message);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
