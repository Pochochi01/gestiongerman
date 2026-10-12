/**
 * Prueba end-to-end de los 8 pasos del flujo de datos, contra la API real.
 * Uso: con la API levantada -> npm run test:e2e
 * Crea datos de prueba en la base configurada en .env (usar una base de pruebas).
 */
const BASE = process.env.BASE || 'http://localhost:4000/api';
// Credenciales del administrador (si se cambio la clave, pasarlas por entorno).
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin1234!';

let fallos = 0;
const ok = (cond, texto, extra = '') => {
  if (cond) console.log(`  OK   ${texto}`);
  else { fallos += 1; console.log(`  FALLA ${texto} ${extra}`); }
};

async function req(metodo, ruta, { token, body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: json.ok, data: json.data, error: json.error };
}

(async () => {
  const sufijo = Date.now().toString().slice(-7);
  const dniVendedor = `9${sufijo}`;
  const dniJugador1 = `8${sufijo}`;
  const dniJugador2 = `7${sufijo}`;

  console.log('\n=== PASO 0: login del administrador ===');
  const login = await req('POST', '/auth/login', {
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  ok(login.ok && login.data.token, 'login admin', login.error || '');
  const admin = login.data.token;
  ok(login.data.usuario.rol === 'ADMIN', 'rol ADMIN en el token');

  console.log('\n=== PASO 1: el admin define el sorteo y habilita un vendedor ===');
  const sorteo = await req('POST', '/sorteos', {
    token: admin,
    body: {
      nombre: 'Sorteo de prueba',
      cartones_objetivo: 2,
      numeros_por_carton: 3,
      rango_min: 1,
      rango_max: 20,
      precio_carton: 1000,
    },
  });
  ok(sorteo.ok && sorteo.data.estado === 'CONFIGURACION', 'sorteo creado en CONFIGURACION', sorteo.error || '');
  const sorteoId = sorteo.data.id;

  const malNumeros = await req('POST', '/sorteos', {
    token: admin,
    body: { nombre: 'invalido', cartones_objetivo: 5, numeros_por_carton: 15 },
  });
  ok(malNumeros.status === 400, 'rechaza mas de 10 numeros por carton');

  const abrir = await req('POST', `/sorteos/${sorteoId}/abrir-venta`, { token: admin });
  ok(abrir.ok && abrir.data.estado === 'EN_VENTA', 'venta abierta', abrir.error || '');

  const vendedor = await req('POST', '/vendedores', {
    token: admin,
    body: {
      apellido: 'Gomez', nombre: 'Ana', dni: dniVendedor, telefono: '3764111222',
      domicilio: { calle: 'San Martin', numero: '450' },
      habilitado: true,
    },
  });
  ok(vendedor.ok && vendedor.data.habilitado === 1, 'vendedor creado y habilitado', vendedor.error || '');
  ok(vendedor.data.calle === 'San Martin', 'domicilio guardado (calle y numero)');
  const vendedorId = vendedor.data.id;

  const dup = await req('POST', '/vendedores', {
    token: admin,
    body: { apellido: 'X', nombre: 'Y', dni: dniVendedor, telefono: '1' },
  });
  ok(dup.status === 409, 'rechaza DNI de vendedor duplicado');

  console.log('\n=== PASO 2: el vendedor ingresa y registra un jugador ===');
  const loginVend = await req('POST', '/auth/login', {
    body: { username: dniVendedor, password: dniVendedor },
  });
  ok(loginVend.ok && loginVend.data.usuario.rol === 'VENDEDOR', 'login del vendedor con su DNI', loginVend.error || '');
  const tVend = loginVend.data.token;

  const jugador1 = await req('POST', '/jugadores', {
    token: tVend,
    body: {
      apellido: 'Perez', nombre: 'Juan', dni: dniJugador1,
      whatsapp: '03764-123456',
    },
  });
  ok(jugador1.ok, 'jugador 1 creado', jugador1.error || '');
  ok(jugador1.data.jugador.whatsapp === '5493764123456', `whatsapp normalizado -> ${jugador1.data.jugador.whatsapp}`);
  ok(jugador1.data.credenciales.usuario === dniJugador1, 'credenciales generadas con el DNI');
  const jugador1Id = jugador1.data.jugador.id;

  console.log('\n=== PASO 3-5: eleccion de numeros, carton y envio por WhatsApp ===');
  const malCantidad = await req('POST', '/cartones', {
    token: tVend,
    body: { jugador_id: jugador1Id, numeros: [1, 2] },
  });
  ok(malCantidad.status === 400, 'rechaza cantidad de numeros distinta a la del sorteo');

  const repetidos = await req('POST', '/cartones', {
    token: tVend,
    body: { jugador_id: jugador1Id, numeros: [5, 5, 7] },
  });
  ok(repetidos.status === 400, 'rechaza numeros repetidos en el carton');

  const carton1 = await req('POST', '/cartones', {
    token: tVend,
    body: { jugador_id: jugador1Id, numeros: [5, 10, 15] },
  });
  ok(carton1.ok, 'carton 1 vendido', carton1.error || '');
  ok(/^S\d{4}-C\d{6}$/.test(carton1.data.carton.codigo), `codigo con formato -> ${carton1.data.carton.codigo}`);
  ok(carton1.data.carton.estado_pago === 'IMPAGO', 'carton nace IMPAGO');
  ok(carton1.data.carton.habilitado === 0, 'carton nace no habilitado');
  ok(carton1.data.sorteo_iniciado === null, 'el sorteo NO arranca con 1 de 2 cartones');
  const carton1Id = carton1.data.carton.id;

  const msgs = await req('GET', '/whatsapp/mensajes?limite=5', { token: admin });
  const msgCarton = msgs.data.find((m) => m.tipo === 'CARTON_NUEVO');
  ok(!!msgCarton, 'mensaje CARTON_NUEVO registrado');
  // El mensaje del carton ya NO lleva el estado ni el aviso de los 24 hs: son
  // datos de cobranza entre el vendedor y la administracion.
  ['IMPAGO', 'RENDIDO', 'Estado del'].forEach((t) =>
    ok(!msgCarton.contenido.includes(t), `el mensaje NO menciona el estado ("${t}")`)
  );
  ok(
    !msgCarton.contenido.includes('rinda cuentas'),
    'el mensaje ya no incluye el aviso de las 24 hs'
  );
  ok(msgCarton.contenido.includes('Gomez'), 'el mensaje incluye los datos del vendedor');
  ok(msgCarton.contenido.includes('5 - 10 - 15'), 'el mensaje incluye los numeros del carton');

  console.log('\n=== PASO 6: se vende el ultimo cartón y arranca el sorteo ===');
  const jugador2 = await req('POST', '/jugadores', {
    token: tVend,
    body: {
      apellido: 'Lopez', nombre: 'Marta', dni: dniJugador2,
      whatsapp: '+54 9 3764 998877',
      numeros: [1, 2, 3],
    },
  });
  ok(jugador2.ok, 'jugador 2 creado con carton en el mismo paso', jugador2.error || '');
  ok(!!jugador2.data.venta, 'la venta se concreto en el alta');
  ok(jugador2.data.venta.sorteo_iniciado?.estado === 'EN_CURSO', 'al completarse la venta el sorteo pasa a EN_CURSO');
  const carton2Id = jugador2.data.venta.carton.id;

  const sinCupo = await req('POST', '/cartones', {
    token: tVend,
    body: { jugador_id: jugador1Id, numeros: [7, 8, 9] },
  });
  ok(sinCupo.status === 409, 'rechaza vender por encima del objetivo');

  // La bandeja acumula corridas anteriores: se cuentan sólo los avisos
  // dirigidos a los dos jugadores de ESTA corrida.
  const avisos = await req('GET', '/whatsapp/mensajes?limite=100', { token: admin });
  const destinos = new Set([jugador1.data.jugador.whatsapp, jugador2.data.jugador.whatsapp]);
  const inicios = avisos.data.filter(
    (m) => m.tipo === 'SORTEO_INICIADO' && destinos.has(m.destino) && m.carton_codigo === null
  );
  ok(inicios.length >= 2, `se avisa el inicio a los 2 jugadores (encontrados ${inicios.length})`);

  console.log('\n=== Habilitacion del carton tras la rendicion ===');
  const rendido = await req('PATCH', `/cartones/${carton1Id}/rendir`, { token: tVend });
  ok(rendido.data.estado_pago === 'RENDIDO', 'el vendedor marca RENDIDO');

  const habilitado = await req('PATCH', `/cartones/${carton1Id}/habilitar`, { token: admin });
  ok(habilitado.data.habilitado === 1 && habilitado.data.estado_pago === 'PAGADO', 'el admin habilita el carton');

  const noAdmin = await req('PATCH', `/cartones/${carton2Id}/habilitar`, { token: tVend });
  ok(noAdmin.status === 403, 'un vendedor NO puede habilitar cartones');

  console.log('\n=== PASO 7: carga de numeros y validacion automatica ===');
  const fuera = await req('POST', `/sorteos/${sorteoId}/numeros`, {
    token: admin,
    body: { fecha: '2026-09-19', numeros: [99] },
  });
  ok(
    fuera.ok && fuera.data.cargados.length === 0 && fuera.data.ignorados[0].motivo.includes('rango'),
    'ignora los numeros fuera del rango del sorteo'
  );

  const cifras = await req('POST', `/sorteos/${sorteoId}/numeros`, {
    token: admin,
    body: { fecha: '2026-09-19', numeros: ['12345'] },
  });
  ok(cifras.status === 400, 'rechaza valores de mas de 4 cifras');

  const dia1 = await req('POST', `/sorteos/${sorteoId}/numeros`, {
    token: admin,
    body: { fecha: '2026-09-19', numero_sorteo: 5001, numeros: [5, 10] },
  });
  ok(dia1.ok && dia1.data.finalizado === false, 'jornada 1 cargada sin ganadores', dia1.error || '');
  ok(dia1.data.jornada.nombre === 'Nocturna', 'la jornada se registra como Nocturna');
  ok(dia1.data.jornada.numero_sorteo === 5001, 'la jornada guarda el numero de sorteo');

  const repe = await req('POST', `/sorteos/${sorteoId}/numeros`, {
    token: admin,
    body: { fecha: '2026-09-20', numeros: [10, 12] },
  });
  ok(
    repe.ok && repe.data.numeros.join() === '12' &&
      repe.data.ignorados.some((g) => g.numero === 10 && g.motivo.includes('ya habia salido')),
    'ignora el numero ya salido y carga el resto'
  );

  const estadoMedio = await req('GET', `/cartones/${carton1Id}`, { token: admin });
  ok(estadoMedio.data.carton.aciertos === 2, 'aciertos parciales del carton 1 = 2');
  ok(estadoMedio.data.carton.numeros.filter((n) => n.salio).length === 2, 'dos numeros marcados como salidos');

  // Se carga con 4 cifras: 2015 -> 15, que es el numero que falta en el carton.
  const dia2 = await req('POST', `/sorteos/${sorteoId}/numeros`, {
    token: admin,
    body: { fecha: '2026-09-20', numeros: ['2015'] },
  });
  ok(dia2.ok, 'jornada 2 cargada', dia2.error || '');
  ok(dia2.data.numeros.join() === '15', '2015 se tradujo al numero 15');
  ok(dia2.data.finalizado === true, 'el sistema detecta el carton completo');
  ok(dia2.data.ganadores.length === 1 && dia2.data.ganadores[0].id === carton1Id, 'el ganador es el carton 1');
  ok(dia2.data.sorteo.estado === 'FINALIZADO', 'el sorteo queda FINALIZADO');

  // El aviso a los ganadores se dispara sin bloquear la respuesta de la carga,
  // así que puede llegar unos milisegundos después: se espera un momento.
  let msgGanador = null;
  for (let intento = 0; intento < 20 && !msgGanador; intento += 1) {
    const bandeja = await req('GET', '/whatsapp/mensajes?limite=30', { token: admin });
    msgGanador = bandeja.data.find(
      (m) => m.tipo === 'GANADOR' && m.carton_codigo === carton1.data.carton.codigo
    );
    if (!msgGanador) await new Promise((r) => setTimeout(r, 150));
  }
  ok(!!msgGanador, 'se genero el aviso al ganador');
  ok(
    !!msgGanador && /UNICO ganador|Ganadores en total/.test(msgGanador.contenido),
    'el aviso informa cuantos ganadores hubo'
  );

  console.log('\n=== PASO 8: el jugador consulta su progreso ===');
  const loginJug = await req('POST', '/auth/login', {
    body: { username: dniJugador1, password: dniJugador1 },
  });
  ok(loginJug.ok && loginJug.data.usuario.rol === 'JUGADOR', 'login del jugador con su DNI');
  const tJug = loginJug.data.token;

  const misCartones = await req('GET', '/cartones', { token: tJug });
  ok(misCartones.data.length === 1, 'el jugador ve solo su carton');

  const detalle = await req('GET', `/cartones/${carton1Id}`, { token: tJug });
  ok(detalle.data.carton.numeros.every((n) => n.salio), 'los 3 numeros figuran como salidos');
  ok(detalle.data.carton.estado === 'GANADOR', 'el carton figura como GANADOR');
  ok(detalle.data.jornadas.length === 2, 've los numeros cargados por dia (2 jornadas)');

  const ajeno = await req('GET', `/cartones/${carton2Id}`, { token: tJug });
  ok(ajeno.status === 403, 'un jugador NO puede ver el carton de otro');

  const jugadores = await req('GET', '/jugadores', { token: tJug });
  ok(jugadores.status === 403, 'un jugador NO puede listar jugadores');

  console.log('\n=== Seguridad: token y roles ===');
  const sinToken = await req('GET', '/vendedores');
  ok(sinToken.status === 401, 'sin token -> 401');

  const tokenFalso = await req('GET', '/vendedores', { token: 'abc.def.ghi' });
  ok(tokenFalso.status === 401, 'token invalido -> 401');

  const vendListaAdmin = await req('GET', '/vendedores', { token: tVend });
  ok(vendListaAdmin.status === 403, 'un vendedor NO accede al CRUD de vendedores');

  console.log('\n=== Inhabilitacion del vendedor ===');
  await req('PATCH', `/vendedores/${vendedorId}/habilitacion`, {
    token: admin, body: { habilitado: false },
  });
  const loginBloqueado = await req('POST', '/auth/login', {
    body: { username: dniVendedor, password: dniVendedor },
  });
  ok(loginBloqueado.status === 403, 'el vendedor inhabilitado no puede ingresar');

  const tokenViejo = await req('GET', '/jugadores', { token: tVend });
  ok(tokenViejo.status === 401, 'su token anterior deja de servir de inmediato');

  console.log(`\n${fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBAS FALLARON`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
