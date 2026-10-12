'use strict';
/**
 * Prueba de la gestión de sorteos y cartones desde el panel del administrador:
 * detalle del sorteo, filtro por vendedor, cambio de estado unificado y
 * resumen de cartones por sorteo del vendedor.
 *
 * Crea su propio escenario y lo borra al terminar.
 * Uso: con la API levantada -> npm run test:gestion
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
  return { status: res.status, ok: json.ok, data: json.data, error: json.error };
}

(async () => {
  const sufijo = Date.now().toString().slice(-7);
  const usuarios = [];
  let sorteoId = null;

  try {
    const rol = (await db.queryOne("SELECT id FROM roles WHERE codigo='ADMIN'")).id;
    const r = await db.query(
      'INSERT INTO usuarios (rol_id,username,password_hash,debe_cambiar_password,activo) VALUES (?,?,?,0,1)',
      [rol, `__g_${sufijo}`, await bcrypt.hash('T3mp!', 10)]
    );
    usuarios.push(r.insertId);
    const admin = (await req('POST', '/auth/login', {
      body: { username: `__g_${sufijo}`, password: 'T3mp!' },
    })).data.token;

    console.log('\n=== Escenario: 1 sorteo, 2 vendedores, 4 cartones ===');
    const sorteo = await req('POST', '/sorteos', {
      token: admin,
      body: {
        nombre: 'GTest gestion', cartones_objetivo: 4, numeros_por_carton: 3,
        rango_min: 0, rango_max: 99, precio_carton: 1000,
      },
    });
    sorteoId = sorteo.data.id;

    // El sorteo de la prueba se pone EN_CURSO (no EN_VENTA) y los cartones se
    // insertan con el modelo, sin pasar por la venta.
    //
    // Motivo: el sistema admite UN solo sorteo EN_VENTA a la vez, y la venta
    // siempre apunta a ese. Si la prueba abriera su propia venta mientras hay
    // un sorteo real en venta, le metería cartones al sorteo del usuario.
    // Así la prueba queda aislada, y `editable` igual se ejercita porque
    // incluye EN_CURSO.
    await db.query(
      "UPDATE sorteos SET estado_id = (SELECT id FROM estados_sorteo WHERE codigo='EN_CURSO'), iniciado_en = NOW() WHERE id = ?",
      [sorteoId]
    );

    const vendedores = [];
    for (let i = 0; i < 2; i += 1) {
      const v = await req('POST', '/vendedores', {
        token: admin,
        body: { apellido: `GTest${i}`, nombre: 'Vend', dni: `2${sufijo}${i}`, telefono: '3810000000' },
      });
      usuarios.push(v.data.usuario_id);
      vendedores.push(v.data);
    }

    // Vendedor 0 coloca 3 cartones, vendedor 1 coloca 1.
    const cartonModel = require('../src/models/carton.model');
    const catalogo = require('../src/models/catalogo.model');
    const [estActivo, estImpago] = await Promise.all([
      catalogo.estadoCartonId('ACTIVO'),
      catalogo.estadoPagoId('IMPAGO'),
    ]);

    const cartones = [];
    for (let i = 0; i < 4; i += 1) {
      const vend = i < 3 ? vendedores[0] : vendedores[1];
      const j = await req('POST', '/jugadores', {
        token: admin,
        body: {
          vendedor_id: vend.id, apellido: 'GTestJug', nombre: `J${i}`,
          dni: `1${sufijo}${i}`, whatsapp: `381000000${i}`,
        },
      });
      usuarios.push(j.data.jugador.usuario_id);

      const cartonId = await db.withTransaction((conn) =>
        cartonModel.crear(
          {
            codigo: `GT-${sufijo}-${i}`,
            sorteo_id: sorteoId,
            jugador_id: j.data.jugador.id,
            vendedor_id: vend.id,
            estado_id: estActivo,
            estado_pago_id: estImpago,
            habilitado: 0,
          },
          [i, i + 10, i + 20],
          conn
        )
      );
      cartones.push(await cartonModel.buscarPorId(cartonId));
    }
    ok(cartones.length === 4, '4 cartones cargados');

    console.log('\n=== GET /sorteos/:id trae vendedores y resumen ===');
    const detalle = await req('GET', `/sorteos/${sorteoId}`, { token: admin });
    ok(detalle.ok, 'detalle del sorteo', detalle.error || '');
    ok(detalle.data.vendedores.length === 2, `2 vendedores asociados (${detalle.data.vendedores.length})`);
    ok(detalle.data.vendedores[0].cartones === 3, 'el primer vendedor tiene 3 cartones');
    ok(detalle.data.resumen.total === 4, `resumen.total = 4 (${detalle.data.resumen.total})`);
    ok(detalle.data.resumen.impagos === 4, `los 4 nacen impagos (${detalle.data.resumen.impagos})`);
    ok(detalle.data.editable === true, 'el sorteo EN_CURSO es editable');

    console.log('\n=== GET /sorteos/:id/cartones?vendedor=ID ===');
    const todos = await req('GET', `/sorteos/${sorteoId}/cartones`, { token: admin });
    ok(todos.data.total === 4, `sin filtro devuelve 4 (${todos.data.total})`);

    const filtrado = await req('GET', `/sorteos/${sorteoId}/cartones?vendedor=${vendedores[0].id}`, {
      token: admin,
    });
    ok(filtrado.data.total === 3, `filtrado por vendedor devuelve 3 (${filtrado.data.total})`);
    ok(
      filtrado.data.cartones.every((c) => c.vendedor_id === vendedores[0].id),
      'todos los cartones son del vendedor filtrado'
    );
    ok(filtrado.data.resumen.total === 3, 'el resumen acompaña al filtro');

    console.log('\n=== PATCH /cartones/:id — cambio de estado unificado ===');
    const p1 = await req('PATCH', `/cartones/${cartones[0].id}`, {
      token: admin, body: { estado_pago: 'RENDIDO' },
    });
    ok(p1.ok && p1.data.carton.estado_pago === 'RENDIDO', 'pasa a RENDIDO', p1.error || '');
    ok(p1.data.carton.habilitado === 0, 'rendido no habilita por si solo');

    const p2 = await req('PATCH', `/cartones/${cartones[0].id}`, {
      token: admin, body: { habilitado: true },
    });
    ok(p2.data.carton.habilitado === 1, 'habilitado = true');
    ok(p2.data.carton.estado_pago === 'PAGADO', 'habilitar implica PAGADO');

    const p3 = await req('PATCH', `/cartones/${cartones[0].id}`, {
      token: admin, body: { habilitado: false },
    });
    ok(p3.data.carton.habilitado === 0 && p3.data.carton.estado_pago === 'RENDIDO',
      'deshabilitar vuelve a RENDIDO');

    const p4 = await req('PATCH', `/cartones/${cartones[1].id}`, {
      token: admin, body: { estado_pago: 'PAGADO' },
    });
    ok(p4.data.carton.habilitado === 1, 'PAGADO habilita automaticamente');

    const sinCambio = await req('PATCH', `/cartones/${cartones[1].id}`, {
      token: admin, body: { estado_pago: 'PAGADO' },
    });
    ok(sinCambio.data.cambio === false, 'repetir el mismo estado no cuenta como cambio');

    const malo = await req('PATCH', `/cartones/${cartones[1].id}`, {
      token: admin, body: { estado_pago: 'CUALQUIERA' },
    });
    ok(malo.status === 400, 'rechaza un estado_pago invalido');

    const vacio = await req('PATCH', `/cartones/${cartones[1].id}`, { token: admin, body: {} });
    ok(vacio.status === 400, 'rechaza un PATCH sin cambios');

    console.log('\n=== El resumen refleja los cambios ===');
    const tras = await req('GET', `/sorteos/${sorteoId}/cartones`, { token: admin });
    ok(tras.data.resumen.pagados === 1, `1 pagado (${tras.data.resumen.pagados})`);
    ok(tras.data.resumen.rendidos === 1, `1 rendido (${tras.data.resumen.rendidos})`);
    ok(tras.data.resumen.impagos === 2, `2 impagos (${tras.data.resumen.impagos})`);
    ok(tras.data.resumen.habilitados === 1, `1 habilitado (${tras.data.resumen.habilitados})`);
    ok(
      tras.data.resumen.impagos + tras.data.resumen.rendidos + tras.data.resumen.pagados === 4,
      'los tres estados suman el total'
    );

    console.log('\n=== GET /vendedores/:id/cartones ===');
    const resVend = await req('GET', `/vendedores/${vendedores[0].id}/cartones`, { token: admin });
    ok(resVend.ok, 'resumen por sorteo del vendedor', resVend.error || '');
    ok(resVend.data.sorteos.length === 1, '1 sorteo en el resumen');
    const s0 = resVend.data.sorteos[0];
    ok(s0.cartones === 3, `3 cartones vendidos (${s0.cartones})`);
    ok(s0.pagados === 1 && s0.rendidos === 1 && s0.impagos === 1, 'estados desglosados por sorteo');
    ok(s0.recaudado === 1000, `recaudado = 1 carton x $1000 (${s0.recaudado})`);
    ok(resVend.data.totales.cartones === 3, 'totales generales');

    console.log('\n=== Seguridad ===');
    const tVend = (await req('POST', '/auth/login', {
      body: { username: `2${sufijo}0`, password: `2${sufijo}0` },
    })).data.token;

    const propio = await req('GET', `/vendedores/${vendedores[0].id}/cartones`, { token: tVend });
    ok(propio.ok, 'el vendedor ve su propio resumen');

    const ajeno = await req('GET', `/vendedores/${vendedores[1].id}/cartones`, { token: tVend });
    ok(ajeno.status === 403, 'el vendedor NO ve el resumen de otro');

    const forzado = await req('GET', `/sorteos/${sorteoId}/cartones?vendedor=${vendedores[1].id}`, {
      token: tVend,
    });
    ok(
      forzado.data.cartones.every((c) => c.vendedor_id === vendedores[0].id),
      'al vendedor se le fuerza el filtro a sus propios cartones'
    );

    const noAdmin = await req('PATCH', `/cartones/${cartones[2].id}`, {
      token: tVend, body: { habilitado: true },
    });
    ok(noAdmin.status === 403, 'un vendedor NO puede cambiar el estado de un carton');

    console.log('\n=== Sorteo cerrado: ya no es editable ===');
    await db.query(
      "UPDATE sorteos SET estado_id = (SELECT id FROM estados_sorteo WHERE codigo='FINALIZADO') WHERE id = ?",
      [sorteoId]
    );
    const cerrado = await req('GET', `/sorteos/${sorteoId}/cartones`, { token: admin });
    ok(cerrado.data.editable === false, 'editable = false con el sorteo FINALIZADO');
  } finally {
    console.log('\n=== Limpieza ===');
    if (sorteoId) await db.query('DELETE FROM sorteos WHERE id = ?', [sorteoId]);
    for (const id of [...usuarios].reverse()) {
      await db.query('DELETE FROM usuarios WHERE id = ?', [id]).catch((e) => console.log('   ', e.code));
    }
    await db.query("DELETE FROM mensajes_whatsapp WHERE jugador_id IS NULL AND carton_id IS NULL");
    console.log('  sorteos:', (await db.query('SELECT numero,nombre FROM sorteos')).map((s) => `${s.numero}:${s.nombre}`).join(', ') || '(ninguno)');
  }

  console.log(`\n${fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBAS FALLARON`}\n`);
  await db.pool.end();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error('Error inesperado:', err);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
