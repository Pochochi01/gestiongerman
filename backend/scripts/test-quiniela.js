/**
 * Prueba de la carga de números por quiniela (4 cifras -> 2 últimas).
 * Crea su propio sorteo/vendedor/jugador y limpia todo al terminar.
 *
 * Uso: con la API levantada -> npm run test:quiniela
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
  const usuariosCreados = [];
  let sorteoId = null;

  try {
    const rolAdmin = (await db.queryOne("SELECT id FROM roles WHERE codigo='ADMIN'")).id;
    const r1 = await db.query(
      'INSERT INTO usuarios (rol_id,username,password_hash,debe_cambiar_password,activo) VALUES (?,?,?,0,1)',
      [rolAdmin, `__q_admin_${sufijo}`, await bcrypt.hash('T3mp!', 10)]
    );
    usuariosCreados.push(r1.insertId);

    const login = await req('POST', '/auth/login', {
      body: { username: `__q_admin_${sufijo}`, password: 'T3mp!' },
    });
    const admin = login.data.token;

    console.log('\n=== Escenario: sorteo de 1 cartón, 3 números, rango 0-99 ===');
    const sorteo = await req('POST', '/sorteos', {
      token: admin,
      body: {
        nombre: 'Prueba quiniela', cartones_objetivo: 1, numeros_por_carton: 3,
        rango_min: 0, rango_max: 99,
      },
    });
    ok(sorteo.ok, 'sorteo creado', sorteo.error || '');
    sorteoId = sorteo.data.id;
    await req('POST', `/sorteos/${sorteoId}/abrir-venta`, { token: admin });

    const vendedor = await req('POST', '/vendedores', {
      token: admin,
      body: { apellido: 'QTest', nombre: 'Vend', dni: `6${sufijo}`, telefono: '3810000000' },
    });
    usuariosCreados.push(vendedor.data.usuario_id);

    const jugador = await req('POST', '/jugadores', {
      token: admin,
      body: {
        vendedor_id: vendedor.data.id,
        apellido: 'QTest', nombre: 'Jug', dni: `5${sufijo}`, whatsapp: '3810000001',
        numeros: [34, 78, 55],
      },
    });
    ok(jugador.ok && jugador.data.venta, 'jugador con cartón creado', jugador.error || '');
    usuariosCreados.push(jugador.data.jugador.usuario_id);
    const cartonId = jugador.data.venta.carton.id;
    ok(jugador.data.venta.sorteo_iniciado?.estado === 'EN_CURSO', 'el sorteo arrancó (1 de 1 cartón)');

    console.log('\n=== Carga de 4 cifras: se toman las dos últimas ===');
    const c1 = await req('POST', `/sorteos/${sorteoId}/numeros`, {
      token: admin,
      body: { fecha: '2026-10-03', numero_sorteo: 9876, numeros: ['1234', '0078'] },
    });
    ok(c1.ok, 'carga aceptada', c1.error || JSON.stringify(c1.detalles || ''));
    ok(c1.data.numeros.join() === '34,78', `1234->34 y 0078->78 (obtenido ${c1.data.numeros.join()})`);
    ok(
      c1.data.cargados[0].valor === 1234 && c1.data.cargados[0].numero === 34,
      'el detalle conserva valor 1234 junto al número 34'
    );

    console.log('\n=== La jornada registra fecha, Nocturna y número de sorteo ===');
    ok(c1.data.jornada.nombre === 'Nocturna', `nombre = Nocturna (obtenido ${c1.data.jornada.nombre})`);
    ok(c1.data.jornada.numero_sorteo === 9876, `numero_sorteo = 9876 (obtenido ${c1.data.jornada.numero_sorteo})`);
    ok(c1.data.jornada.fecha === '2026-10-03', `fecha = 2026-10-03 (obtenido ${c1.data.jornada.fecha})`);

    const enBase = await db.queryOne(
      'SELECT fecha, nombre, numero_sorteo FROM jornadas WHERE id = ?', [c1.data.jornada.id]
    );
    ok(
      enBase.nombre === 'Nocturna' && Number(enBase.numero_sorteo) === 9876,
      'quedó guardado en la tabla jornadas'
    );
    const valores = await db.query(
      'SELECT numero, valor_cargado FROM numeros_extraidos WHERE jornada_id = ? ORDER BY orden',
      [c1.data.jornada.id]
    );
    ok(
      Number(valores[0].numero) === 34 && Number(valores[0].valor_cargado) === 1234,
      `numeros_extraidos: numero=34, valor_cargado=1234 (obtenido ${valores[0].numero}/${valores[0].valor_cargado})`
    );

    console.log('\n=== Números que ya salieron: se ignoran, no rompen la carga ===');
    const c2 = await req('POST', `/sorteos/${sorteoId}/numeros`, {
      token: admin,
      body: { fecha: '2026-10-04', numero_sorteo: 9877, numeros: ['5634', '9934', '0007'] },
    });
    ok(c2.ok, 'carga con repetidos aceptada', c2.error || '');
    ok(c2.data.numeros.join() === '7', `sólo entra el 07 (obtenido ${c2.data.numeros.join()})`);
    ok(
      c2.data.ignorados.filter((g) => g.motivo.includes('ya habia salido')).length === 2,
      `5634 y 9934 terminan en 34, que ya había salido (${c2.data.ignorados.map((g) => `${g.valor}:${g.motivo}`).join(' | ')})`
    );

    console.log('\n=== Duplicado dentro de la misma carga ===');
    const c3 = await req('POST', `/sorteos/${sorteoId}/numeros`, {
      token: admin,
      body: { fecha: '2026-10-05', numeros: ['1155', '2255'] }, // ambos -> 55, que es nuevo
    });
    ok(c3.ok, 'carga aceptada', c3.error || '');
    ok(c3.data.numeros.join() === '55', `entra el 55 una sola vez (obtenido ${c3.data.numeros.join()})`);
    ok(
      c3.data.ignorados.length === 1 && c3.data.ignorados[0].motivo.includes('repetido en esta misma carga'),
      `el segundo se ignora como repetido de la carga (${c3.data.ignorados.map((g) => `${g.valor}:${g.motivo}`).join()})`
    );
    ok(
      c3.data.jornada.nombre === 'Nocturna' && c3.data.jornada.numero_sorteo === null,
      'sin número de sorteo la jornada igual queda como Nocturna'
    );

    console.log('\n=== El cartón se completó con los números de 2 cifras ===');
    ok(c3.data.finalizado === true, 'el sistema detectó el cartón completo (34, 78, 55)');
    ok(c3.data.ganadores[0]?.id === cartonId, 'el ganador es el cartón del jugador');

    const detalle = await req('GET', `/cartones/${cartonId}`, { token: admin });
    const pintados = detalle.data.carton.grilla.filter((g) => g.salio).map((g) => g.numero);
    ok(
      pintados.sort((a, b) => a - b).join() === '34,55,78',
      `se pintaron 34, 55 y 78 (obtenido ${pintados.join()})`
    );

    console.log('\n=== Validaciones de entrada ===');
    const cinco = await req('POST', `/sorteos/${sorteoId}/numeros`, { token: admin, body: { numeros: ['12345'] } });
    ok(cinco.status === 400, 'rechaza 5 cifras');
    const letras = await req('POST', `/sorteos/${sorteoId}/numeros`, { token: admin, body: { numeros: ['12ab'] } });
    ok(letras.status === 400, 'rechaza no numéricos');
    const vacio = await req('POST', `/sorteos/${sorteoId}/numeros`, { token: admin, body: { numeros: [] } });
    ok(vacio.status === 400, 'rechaza la carga vacía');

    console.log('\n=== Historial expuesto al jugador ===');
    const resumen = await req('GET', `/sorteos/${sorteoId}`, { token: admin });
    const j = resumen.data.jornadas.find((x) => x.fecha === '2026-10-03');
    ok(j.nombre === 'Nocturna' && j.numero_sorteo === 9876, 'el historial trae Nocturna + número de sorteo');
    ok(
      j.extracciones.some((e) => e.valor_cargado === 1234 && e.numero === 34),
      'el historial trae el valor cargado y el número usado'
    );
    ok(resumen.data.numeros_salidos.sort((a, b) => a - b).join() === '7,34,55,78',
      `números salidos del sorteo: 7,34,55,78 (obtenido ${resumen.data.numeros_salidos.join()})`);
  } finally {
    console.log('\n=== Limpieza ===');
    if (sorteoId) await db.query('DELETE FROM sorteos WHERE id = ?', [sorteoId]);
    // En orden inverso: el jugador referencia al vendedor con ON DELETE RESTRICT.
    for (const id of [...usuariosCreados].reverse()) {
      await db.query('DELETE FROM usuarios WHERE id = ?', [id]).catch((e) => console.log('   ', e.code));
    }
    const sorteos = await db.query('SELECT numero, nombre FROM sorteos');
    const usuarios = await db.query('SELECT username FROM usuarios');
    console.log('  sorteos restantes:', sorteos.map((s) => `${s.numero}:${s.nombre}`).join(', ') || '(ninguno)');
    console.log('  usuarios restantes:', usuarios.map((u) => u.username).join(', '));
  }

  console.log(`\n${fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBAS FALLARON`}\n`);
  await db.pool.end();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error('Error inesperado:', err);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
