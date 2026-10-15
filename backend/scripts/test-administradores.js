'use strict';
/**
 * Prueba del CRUD de administradores y del blanqueo de clave.
 *
 * Lo que de verdad importa comprobar acá no es que el alta funcione, sino que
 * la cuenta raíz sea **inalcanzable** para un administrador creado desde el
 * sistema: no sólo ausente de la lista, sino imposible de leer, editar,
 * inhabilitar, blanquear o eliminar probando ids a mano.
 *
 * A diferencia de las otras pruebas, esta levanta la API en proceso, en un
 * puerto libre, en lugar de pegarle a una que ya esté corriendo. Así la prueba
 * usa la base que diga DB_NAME y nunca la de producción por descuido.
 *
 * Uso (con una base desechable, NUNCA la que está en uso):
 *   DB_NAME=bingodgg_pruebas npm run test:administradores
 *
 * Crea su propio escenario y lo borra al terminar.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/config/db');
const env = require('../src/config/env');

let fallos = 0;
const ok = (cond, texto, extra = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALLA'} ${texto}${cond ? '' : ` -> ${extra}`}`);
  if (!cond) fallos += 1;
};

let BASE = '';
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

const login = (username, password) =>
  req('POST', '/api/auth/login', { body: { username, password } });

(async () => {
  if (/^bingodgg$/i.test(env.db.database)) {
    console.error(
      `\nABORTA: DB_NAME es "${env.db.database}", que es la base en uso.\n` +
        'Esta prueba crea y borra usuarios. Pasele una base desechable:\n' +
        '  DB_NAME=bingodgg_pruebas npm run test:administradores\n'
    );
    process.exit(1);
  }

  const servidor = app.listen(0);
  await new Promise((r) => servidor.once('listening', r));
  BASE = `http://127.0.0.1:${servidor.address().port}`;
  console.log(`API en ${BASE} · base "${env.db.database}"`);

  const sufijo = Date.now().toString().slice(-6);
  const dniA = `41${sufijo}`.slice(0, 8);
  const dniB = `42${sufijo}`.slice(0, 8);
  const dniVend = `43${sufijo}`.slice(0, 8);
  const creados = [];

  try {
    // ---------------------------------------------------------------------
    console.log('\n=== 1. La cuenta raiz ===');
    const raiz = await login(env.admin.username, env.admin.password);
    ok(raiz.status === 200, 'el administrador raiz entra', JSON.stringify(raiz.error));
    const tokenRaiz = raiz.data.token;

    const filaRaiz = await db.queryOne('SELECT id, es_raiz FROM usuarios WHERE username = ?', [
      env.admin.username,
    ]);
    ok(filaRaiz && filaRaiz.es_raiz === 1, 'queda marcada con es_raiz = 1');
    const usuarioIdRaiz = filaRaiz.id;

    const yoRaiz = await req('GET', '/api/administradores/yo', { token: tokenRaiz });
    ok(yoRaiz.data?.es_raiz === true, 'se reconoce como raiz en /administradores/yo');
    ok(
      yoRaiz.data?.administrador_id === null,
      'no tiene ficha en administradores (por eso es inalcanzable)'
    );

    const listaInicial = await req('GET', '/api/administradores', { token: tokenRaiz });
    ok(
      Array.isArray(listaInicial.data) && listaInicial.data.length === 0,
      'la lista arranca vacia: ni siquiera el raiz se lista a si mismo',
      JSON.stringify(listaInicial.data)
    );

    // ---------------------------------------------------------------------
    console.log('\n=== 2. El raiz crea un administrador ===');
    const altaA = await req('POST', '/api/administradores', {
      token: tokenRaiz,
      body: { apellido: 'Lopez', nombre: 'Ana', dni: dniA },
    });
    ok(altaA.status === 201, 'alta correcta', JSON.stringify(altaA.error));
    const adminAId = altaA.data.id;
    creados.push(altaA.data.usuario_id);
    ok(altaA.data.credenciales?.clave === dniA, 'la clave inicial es el DNI');
    ok(altaA.data.debe_cambiar_password === true, 'queda obligado a cambiar la clave');

    const dupDni = await req('POST', '/api/administradores', {
      token: tokenRaiz,
      body: { apellido: 'Otro', nombre: 'Repetido', dni: dniA },
    });
    ok(dupDni.status === 409, 'rechaza un DNI repetido', `status ${dupDni.status}`);

    const dniMalo = await req('POST', '/api/administradores', {
      token: tokenRaiz,
      body: { apellido: 'Mal', nombre: 'Dni', dni: '12.345' },
    });
    ok(dniMalo.status === 400, 'rechaza un DNI con puntos', `status ${dniMalo.status}`);

    // ---------------------------------------------------------------------
    console.log('\n=== 3. El administrador nuevo entra y NO ve al raiz ===');
    const sesionA = await login(dniA, dniA);
    ok(sesionA.status === 200, 'entra con su DNI como usuario y clave');
    ok(
      sesionA.data.usuario.debe_cambiar_password === true,
      'el login avisa que tiene que cambiar la clave'
    );
    const tokenA = sesionA.data.token;

    const listaA = await req('GET', '/api/administradores', { token: tokenA });
    ok(listaA.data.length === 1, 've exactamente un administrador: el mismo');
    ok(listaA.data[0].dni === dniA, 'y es el suyo');
    ok(
      !listaA.data.some((a) => a.username === env.admin.username),
      'el usuario raiz NO aparece en la lista'
    );

    const yoA = await req('GET', '/api/administradores/yo', { token: tokenA });
    ok(yoA.data?.es_raiz === false, 'no se cree raiz');

    // ---------------------------------------------------------------------
    console.log('\n=== 4. El raiz es inalcanzable probando ids a mano ===');
    // Se recorren mas ids de los que existen: si alguna ruta devolviera el
    // raiz con algun id, aca se ve.
    let filtracion = null;
    for (let id = 1; id <= 20; id += 1) {
      const r = await req('GET', `/api/administradores/${id}`, { token: tokenA });
      if (r.status === 200 && r.data?.username === env.admin.username) filtracion = id;
    }
    ok(filtracion === null, 'ningun id devuelve la cuenta raiz', `la filtro el id ${filtracion}`);

    // Ojo con una confusion facil: el :id de estas rutas es `administradores.id`,
    // NO `usuarios.id`. El raiz tiene un usuarios.id (casi siempre 1) que en
    // este modulo corresponde a la ficha de OTRO administrador. Por eso la
    // prueba no puede limitarse a pedir el id del usuario raiz: barre todos los
    // ids que no son fichas validas, con todos los verbos, y despues comprueba
    // que la fila del raiz en `usuarios` quedo intacta byte a byte.
    const fichasValidas = new Set(
      (await db.query('SELECT id FROM administradores')).map((f) => f.id)
    );
    const antes = await db.queryOne(
      'SELECT username, activo, es_raiz, password_hash, rol_id FROM usuarios WHERE id = ?',
      [usuarioIdRaiz]
    );

    let respuestaIndebida = null;
    for (let id = 1; id <= 30; id += 1) {
      if (fichasValidas.has(id)) continue;
      for (const [metodo, ruta, body] of [
        ['GET', `/api/administradores/${id}`, undefined],
        ['PUT', `/api/administradores/${id}`, { apellido: 'Hackeado', nombre: 'X' }],
        ['PATCH', `/api/administradores/${id}/activacion`, { activo: false }],
        ['POST', `/api/administradores/${id}/blanqueo`, undefined],
        ['DELETE', `/api/administradores/${id}`, undefined],
      ]) {
        const r = await req(metodo, ruta, { token: tokenA, body });
        if (r.status !== 404) respuestaIndebida = `${metodo} ${ruta} -> ${r.status}`;
      }
    }
    ok(
      respuestaIndebida === null,
      'ningun id ajeno responde algo distinto de 404, con ningun verbo',
      respuestaIndebida
    );

    // Lo definitivo: despues de ese barrido la cuenta raiz esta igual.
    const despues = await db.queryOne(
      'SELECT username, activo, es_raiz, password_hash, rol_id FROM usuarios WHERE id = ?',
      [usuarioIdRaiz]
    );
    ok(!!despues, 'la fila del raiz sigue existiendo');
    ok(despues.activo === 1 && antes.activo === 1, 'sigue activa');
    ok(despues.es_raiz === 1, 'sigue marcada como raiz');
    ok(
      despues.password_hash === antes.password_hash,
      'su clave no fue tocada (el hash es identico)'
    );
    ok(despues.username === antes.username, 'su usuario no fue renombrado');

    const reentra = await login(env.admin.username, env.admin.password);
    ok(reentra.status === 200, 'y sigue entrando con su clave original');

    // Tampoco se la alcanza desde su propia ficha, porque no tiene ninguna.
    const fichaDelRaiz = await db.queryOne(
      'SELECT id FROM administradores WHERE usuario_id = ?',
      [usuarioIdRaiz]
    );
    ok(!fichaDelRaiz, 'el raiz no tiene ficha en administradores: no hay id que pedir');

    // ---------------------------------------------------------------------
    console.log('\n=== 5. El administrador nuevo maneja el resto del sistema ===');
    const comoRaiz = [
      ['GET', '/api/vendedores'],
      ['GET', '/api/sorteos'],
      ['GET', '/api/cartones'],
      ['GET', '/api/whatsapp/estado'],
    ];
    for (const [metodo, ruta] of comoRaiz) {
      const r = await req(metodo, ruta, { token: tokenA });
      ok(r.status === 200, `${metodo} ${ruta} -> 200`, `status ${r.status}`);
    }

    const vend = await req('POST', '/api/vendedores', {
      token: tokenA,
      body: { apellido: 'Vendedor', nombre: 'Prueba', dni: dniVend, telefono: '3764000111' },
    });
    ok(vend.status === 201, 'puede crear un vendedor, igual que el raiz', JSON.stringify(vend.error));
    if (vend.data?.usuario_id) creados.push(vend.data.usuario_id);

    const altaB = await req('POST', '/api/administradores', {
      token: tokenA,
      body: { apellido: 'Diaz', nombre: 'Beto', dni: dniB },
    });
    ok(altaB.status === 201, 'puede crear otro administrador', JSON.stringify(altaB.error));
    const adminBId = altaB.data?.id;
    if (altaB.data?.usuario_id) creados.push(altaB.data.usuario_id);
    ok(altaB.data?.creado_por_username === dniA, 'queda registrado quien lo creo');

    // ---------------------------------------------------------------------
    console.log('\n=== 6. Un DNI no puede tener dos cuentas ===');
    const choque = await req('POST', '/api/administradores', {
      token: tokenRaiz,
      body: { apellido: 'Vendedor', nombre: 'Prueba', dni: dniVend },
    });
    ok(choque.status === 409, 'el DNI de un vendedor no sirve para un administrador');
    ok(
      /vendedor|jugador/i.test(choque.error || ''),
      'y el mensaje explica por que',
      choque.error
    );

    // ---------------------------------------------------------------------
    console.log('\n=== 7. Nadie se bloquea a si mismo ===');
    const autoBaja = await req('PATCH', `/api/administradores/${adminAId}/activacion`, {
      token: tokenA,
      body: { activo: false },
    });
    ok(autoBaja.status === 409, 'no puede inhabilitarse a si mismo', `status ${autoBaja.status}`);

    const autoBorrado = await req('DELETE', `/api/administradores/${adminAId}`, { token: tokenA });
    ok(autoBorrado.status === 409, 'no puede eliminarse a si mismo', `status ${autoBorrado.status}`);

    const autoBlanqueo = await req('POST', `/api/administradores/${adminAId}/blanqueo`, {
      token: tokenA,
    });
    ok(autoBlanqueo.status === 409, 'no se blanquea su propia clave', `status ${autoBlanqueo.status}`);

    // ---------------------------------------------------------------------
    console.log('\n=== 8. Blanqueo de clave ===');
    // A cambia su clave para que el blanqueo tenga algo que deshacer.
    const cambio = await req('PUT', '/api/auth/password', {
      token: tokenA,
      body: { password_actual: dniA, password_nueva: 'ClaveNueva.123' },
    });
    ok(cambio.status === 200, 'A cambia su clave', JSON.stringify(cambio.error));
    ok((await login(dniA, 'ClaveNueva.123')).status === 200, 'y entra con la nueva');
    ok((await login(dniA, dniA)).status === 401, 'la vieja ya no sirve');

    const blanqueo = await req('POST', `/api/administradores/${adminAId}/blanqueo`, {
      token: tokenRaiz,
    });
    ok(blanqueo.status === 200, 'el raiz le blanquea la clave', JSON.stringify(blanqueo.error));
    ok(blanqueo.data?.credenciales?.clave === dniA, 'la clave provisoria es el DNI');

    const reLogin = await login(dniA, dniA);
    ok(reLogin.status === 200, 'A vuelve a entrar con su DNI');
    ok(
      reLogin.data.usuario.debe_cambiar_password === true,
      'y el sistema le exige cambiarla otra vez'
    );
    ok((await login(dniA, 'ClaveNueva.123')).status === 401, 'la clave anterior quedo invalidada');

    // ---------------------------------------------------------------------
    console.log('\n=== 9. Habilitacion e inhabilitacion ===');
    const bajaB = await req('PATCH', `/api/administradores/${adminBId}/activacion`, {
      token: tokenRaiz,
      body: { activo: false },
    });
    ok(bajaB.status === 200, 'el raiz inhabilita a B');
    ok(bajaB.data?.activo === false, 'y queda inactivo');
    const loginB = await login(dniB, dniB);
    ok(loginB.status === 403, 'B inhabilitado no puede entrar', `status ${loginB.status}`);

    const altaDeB = await req('PATCH', `/api/administradores/${adminBId}/activacion`, {
      token: tokenRaiz,
      body: { activo: true },
    });
    ok(altaDeB.status === 200 && altaDeB.data.activo === true, 'y se lo puede rehabilitar');

    // ---------------------------------------------------------------------
    console.log('\n=== 10. Resguardo: no queda el sistema sin administradores ===');
    // Se deja al raiz inactivo a proposito y en la base, para que A quede como
    // el unico activo y el resguardo tenga que actuar.
    await db.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [usuarioIdRaiz]);
    await db.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [altaB.data.usuario_id]);
    const tokenAVigente = (await login(dniA, dniA)).data.token;
    const ultimo = await req('PATCH', `/api/administradores/${adminAId}/activacion`, {
      token: tokenAVigente,
      body: { activo: false },
    });
    ok(ultimo.status === 409, 'no se puede inhabilitar al ultimo administrador activo');
    await db.query('UPDATE usuarios SET activo = 1 WHERE id IN (?, ?)', [
      usuarioIdRaiz,
      altaB.data.usuario_id,
    ]);

    // ---------------------------------------------------------------------
    console.log('\n=== 11. Edicion y borrado ===');
    const edicion = await req('PUT', `/api/administradores/${adminBId}`, {
      token: tokenRaiz,
      body: { apellido: 'Diaz Corregido', nombre: 'Beto' },
    });
    ok(edicion.data?.apellido === 'Diaz Corregido', 'se edita el apellido');
    ok(edicion.data?.dni === dniB, 'el DNI no cambia: es el usuario de la cuenta');

    const borrado = await req('DELETE', `/api/administradores/${adminBId}`, { token: tokenRaiz });
    ok(borrado.status === 200, 'se elimina a B', JSON.stringify(borrado.error));
    const quedaB = await db.queryOne('SELECT id FROM usuarios WHERE username = ?', [dniB]);
    ok(!quedaB, 'y su usuario desaparece de la base');
    ok(
      (await req('GET', `/api/administradores/${adminBId}`, { token: tokenRaiz })).status === 404,
      'ya no se puede obtener'
    );

    // ---------------------------------------------------------------------
    console.log('\n=== 12. Un vendedor no entra a este modulo ===');
    const sesionVend = await login(dniVend, dniVend);
    const vendIntenta = await req('GET', '/api/administradores', {
      token: sesionVend.data?.token,
    });
    ok(vendIntenta.status === 403, 'un VENDEDOR recibe 403', `status ${vendIntenta.status}`);
    const sinToken = await req('GET', '/api/administradores');
    ok(sinToken.status === 401, 'sin token, 401', `status ${sinToken.status}`);
  } catch (err) {
    console.error('\nError inesperado:', err);
    fallos += 1;
  } finally {
    // ---- Limpieza ------------------------------------------------------
    console.log('\n=== Limpieza ===');
    for (const usuarioId of creados) {
      await db.query('DELETE FROM usuarios WHERE id = ? AND es_raiz = 0', [usuarioId]).catch(() => {});
    }
    const restantes = await db.queryOne(
      `SELECT COUNT(*) AS n FROM usuarios u JOIN roles r ON r.id = u.rol_id
        WHERE r.codigo = 'ADMIN' AND u.es_raiz = 0`
    );
    console.log(`  administradores no raiz que quedan: ${restantes.n}`);
    servidor.close();
    await db.pool.end();
  }

  console.log(fallos === 0 ? '\nTODO OK\n' : `\n${fallos} FALLA(S)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
