/**
 * Prueba de las posiciones del sorteo (grilla 1..20) y de la vista del jugador.
 * Crea su propio escenario y lo borra al terminar.
 *
 * Uso: con la API levantada -> npm run test:posiciones
 */
const BASE = process.env.BASE || 'http://localhost:4000/api';
const db = require('../src/config/db');
const bcrypt = require('bcryptjs');

let fallos = 0;
const ok = (cond, texto, extra = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALLA'} ${texto}${cond ? '' : ` ${extra}`}`);
  if (!cond) fallos += 1;
};

async function req(metodo, ruta, { token, body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: json.ok, data: json.data, error: json.error, detalles: json.detalles };
}

(async () => {
  const sufijo = Date.now().toString().slice(-7);
  const usuarios = [];
  let sorteoId = null;

  try {
    const rol = (await db.queryOne("SELECT id FROM roles WHERE codigo='ADMIN'")).id;
    const r = await db.query(
      'INSERT INTO usuarios (rol_id,username,password_hash,debe_cambiar_password,activo) VALUES (?,?,?,0,1)',
      [rol, `__pos_${sufijo}`, await bcrypt.hash('T3mp!', 10)]
    );
    usuarios.push(r.insertId);
    const admin = (await req('POST', '/auth/login', {
      body: { username: `__pos_${sufijo}`, password: 'T3mp!' },
    })).data.token;

    const sorteo = await req('POST', '/sorteos', {
      token: admin,
      body: { nombre: 'Prueba posiciones', cartones_objetivo: 1, numeros_por_carton: 3, rango_min: 0, rango_max: 99 },
    });
    sorteoId = sorteo.data.id;
    await req('POST', `/sorteos/${sorteoId}/abrir-venta`, { token: admin });

    const vend = await req('POST', '/vendedores', {
      token: admin, body: { apellido: 'PTest', nombre: 'V', dni: `4${sufijo}`, telefono: '3810000000' },
    });
    usuarios.push(vend.data.usuario_id);
    const jug = await req('POST', '/jugadores', {
      token: admin,
      body: {
        vendedor_id: vend.data.id, apellido: 'PTest', nombre: 'J',
        dni: `3${sufijo}`, whatsapp: '3810000002', numeros: [34, 11, 99],
      },
    });
    usuarios.push(jug.data.jugador.usuario_id);
    const cartonId = jug.data.venta.carton.id;

    console.log('\n=== Carga de 20 posiciones con repetidos intercalados ===');
    // Posición 3 y 7 terminan en 34 igual que la 1: se registran pero no cuentan.
    const quiniela = [
      '1234', '5611', '7734', '0099', '4455', '8866', '9934', '1177',
      '2288', '3300', '4412', '5523', '6645', '7756', '8867', '9978',
      '1089', '2190', '3201', '4302',
    ];
    const carga = await req('POST', `/sorteos/${sorteoId}/numeros`, {
      token: admin,
      body: { fecha: '2026-10-04', numero_sorteo: 1234, numeros: quiniela },
    });
    ok(carga.ok, 'carga de 20 valores aceptada', carga.error || JSON.stringify(carga.detalles || ''));

    const filas = await db.query(
      `SELECT ne.orden AS posicion, ne.valor_cargado, ne.numero, ne.cuenta
         FROM numeros_extraidos ne WHERE ne.jornada_id = ? ORDER BY ne.orden`,
      [carga.data.jornada.id]
    );
    ok(filas.length === 20, `se guardaron las 20 posiciones (obtenido ${filas.length})`);
    ok(
      filas.every((f, i) => Number(f.posicion) === i + 1),
      'las posiciones van de 1 a 20 sin huecos'
    );
    ok(
      filas.every((f, i) => Number(f.valor_cargado) === Number(quiniela[i])),
      'cada posición guarda el valor de la quiniela que le corresponde'
    );

    console.log('\n=== Los repetidos ocupan su posición pero no cuentan ===');
    const p3 = filas.find((f) => Number(f.posicion) === 3);
    const p7 = filas.find((f) => Number(f.posicion) === 7);
    const p1 = filas.find((f) => Number(f.posicion) === 1);
    ok(Number(p1.numero) === 34 && Number(p1.cuenta) === 1, 'posición 1: 1234 -> 34, cuenta');
    ok(Number(p3.numero) === 34 && Number(p3.cuenta) === 0, 'posición 3: 7734 -> 34, NO cuenta');
    ok(Number(p7.numero) === 34 && Number(p7.cuenta) === 0, 'posición 7: 9934 -> 34, NO cuenta');
    ok(
      Number(p3.valor_cargado) === 7734,
      `la posición 3 conserva su valor 7734 (obtenido ${p3.valor_cargado})`
    );

    console.log('\n=== Lo que ve el jugador ===');
    const detalle = await req('GET', `/cartones/${cartonId}`, { token: admin });
    const jornada = detalle.data.jornadas.find((j) => j.fecha === '2026-10-04');
    ok(jornada.extracciones.length === 20, `el historial trae las 20 posiciones (${jornada.extracciones.length})`);
    ok(
      jornada.extracciones.every((e, i) => e.posicion === i + 1),
      'el historial las entrega ordenadas por posición'
    );
    ok(
      jornada.extracciones.filter((e) => e.cuenta === false).length === 2,
      'marca 2 posiciones como que no cuentan'
    );
    ok(
      jornada.numeros.filter((n) => n === 34).length === 1,
      'el 34 figura una sola vez entre los números que valen'
    );

    console.log('\n=== El cartón (34, 11, 99) se completó ===');
    ok(carga.data.finalizado === true, 'el sistema detectó el cartón completo');
    const pintados = detalle.data.carton.grilla.filter((g) => g.salio).map((g) => g.numero);
    ok(
      pintados.sort((a, b) => a - b).join() === '11,34,99',
      `se pintaron 11, 34 y 99 (obtenido ${pintados.join()})`
    );
    ok(
      detalle.data.numeros_salidos.filter((n) => n === 34).length === 1,
      'numeros_salidos no duplica el 34'
    );
    ok(
      !detalle.data.numeros_salidos.includes(0) || quiniela.some((q) => Number(q) % 100 === 0),
      'no aparecen números que no se cargaron'
    );
  } finally {
    console.log('\n=== Limpieza ===');
    if (sorteoId) await db.query('DELETE FROM sorteos WHERE id = ?', [sorteoId]);
    for (const id of [...usuarios].reverse()) {
      await db.query('DELETE FROM usuarios WHERE id = ?', [id]).catch((e) => console.log('   ', e.code));
    }
    console.log('  sorteos:', (await db.query('SELECT numero,nombre FROM sorteos')).map((s) => `${s.numero}:${s.nombre}`).join(', ') || '(ninguno)');
    console.log('  usuarios:', (await db.query('SELECT username FROM usuarios')).map((u) => u.username).join(', '));
  }

  console.log(`\n${fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBAS FALLARON`}\n`);
  await db.pool.end();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error('Error inesperado:', err);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
