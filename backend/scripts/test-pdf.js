'use strict';
/**
 * Pruebas del alta con PDF, QR y color por sorteo.
 *
 * Cubre los cinco casos del requerimiento:
 *   1. Un vendedor guarda un jugador -> se genera el PDF y llega el enlace de WhatsApp.
 *   2. El administrador guarda un jugador -> se genera el PDF y NO llega enlace.
 *   3. Todos los cartones de un mismo sorteo salen del mismo color.
 *   4. Al cambiar de sorteo, el color cambia.
 *   5. El QR del PDF valida el cartón contra el endpoint público.
 *
 * Crea su propio escenario y lo borra al terminar.
 * Uso: con la API levantada -> npm run test:pdf
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE || 'http://localhost:4000/api';
const db = require('../src/config/db');
const colores = require('../src/utils/colores');
const pdfService = require('../src/services/pdf.service');

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

/** Texto visible de un PDF sin comprimir: pdfkit lo escribe en cadenas hex. */
function textoDelPdf(ruta) {
  const crudo = fs.readFileSync(ruta, 'latin1');
  let texto = '';
  for (const m of crudo.matchAll(/\[(<[0-9a-fA-F]+>(?:\s*-?\d+\s*<[0-9a-fA-F]+>)*)\s*\d*\]\s*TJ/g)) {
    for (const h of m[1].matchAll(/<([0-9a-fA-F]+)>/g)) {
      texto += Buffer.from(h[1], 'hex').toString('latin1');
    }
  }
  return texto;
}

/** Colores de relleno del PDF, en hex. pdfkit los emite como `r g b scn`. */
function coloresDelPdf(ruta) {
  const crudo = fs.readFileSync(ruta, 'latin1');
  const vistos = new Set();
  for (const m of crudo.matchAll(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+scn/g)) {
    vistos.add(
      colores.aHex({ r: Number(m[1]) * 255, g: Number(m[2]) * 255, b: Number(m[3]) * 255 })
    );
  }
  return [...vistos];
}

(async () => {
  const sufijo = Date.now().toString().slice(-7);
  const usuarios = [];
  const sorteosCreados = [];
  const pdfs = [];

  try {
    // ---------- Escenario ----------
    const rolAdmin = (await db.queryOne("SELECT id FROM roles WHERE codigo='ADMIN'")).id;
    const r = await db.query(
      'INSERT INTO usuarios (rol_id,username,password_hash,debe_cambiar_password,activo) VALUES (?,?,?,0,1)',
      [rolAdmin, `__pdf_${sufijo}`, await bcrypt.hash('T3mp!', 10)]
    );
    usuarios.push(r.insertId);
    const admin = (await req('POST', '/auth/login', {
      body: { username: `__pdf_${sufijo}`, password: 'T3mp!' },
    })).data.token;

    const vend = await req('POST', '/vendedores', {
      token: admin,
      body: { apellido: 'PdfTest', nombre: 'Vend', dni: `7${sufijo}`, telefono: '3810000111' },
    });
    usuarios.push(vend.data.usuario_id);
    const vendedorId = vend.data.id;
    const tVend = (await req('POST', '/auth/login', {
      body: { username: `7${sufijo}`, password: `7${sufijo}` },
    })).data.token;

    /** Crea un sorteo EN_CURSO aislado (no toca el sorteo real en venta). */
    async function sorteoAislado(nombre) {
      const s = await req('POST', '/sorteos', {
        token: admin,
        body: {
          nombre, cartones_objetivo: 50, numeros_por_carton: 10,
          rango_min: 0, rango_max: 99, precio_carton: 1000,
        },
      });
      sorteosCreados.push(s.data.id);
      return s.data;
    }

    console.log('\n=== CASO 3 y 4: color por sorteo ===');
    const sorteoA = await sorteoAislado('PdfTest A');
    const sorteoB = await sorteoAislado('PdfTest B');
    ok(!!sorteoA.color_carton, `el sorteo A tiene color (${sorteoA.color_carton})`);
    ok(
      sorteoA.color_carton !== sorteoB.color_carton,
      `al cambiar de sorteo cambia el color (${sorteoA.color_carton} vs ${sorteoB.color_carton})`
    );
    ok(
      sorteoA.color_carton === colores.colorDeSorteo(sorteoA.numero),
      'el color sale de la paleta segun el numero de sorteo'
    );

    // Se abre la venta del sorteo A para poder vender por el endpoint real.
    await req('POST', `/sorteos/${sorteoA.id}/abrir-venta`, { token: admin });
    const abierto = await db.queryOne(
      "SELECT es.codigo e FROM sorteos s JOIN estados_sorteo es ON es.id=s.estado_id WHERE s.id=?",
      [sorteoA.id]
    );
    if (abierto.e !== 'EN_VENTA') {
      console.log(
        '\n  OMITIDA: ya hay otro sorteo EN_VENTA, no se puede abrir la venta de la prueba.\n' +
          '  Corra la suite contra una base de pruebas (ver README).\n'
      );
      return;
    }

    // ---------- CASO 1: vendedor ----------
    console.log('\n=== CASO 1: el vendedor guarda un jugador ===');
    const comoVendedor = await req('POST', '/jugadores/nuevo', {
      token: tVend,
      body: {
        apellido: 'PdfJug', nombre: 'Uno', dni: `6${sufijo}1`, whatsapp: '3764111222',
        numeros: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
    });
    usuarios.push(comoVendedor.data.jugador.usuario_id);
    ok(comoVendedor.ok, 'alta exitosa', comoVendedor.error || '');
    ok(!!comoVendedor.data.carton, 'se genero el carton');
    ok(!!comoVendedor.data.pdf?.archivo, 'se genero el PDF');
    ok(comoVendedor.data.whatsapp?.habilitado === true, 'el vendedor recibe el enlace de WhatsApp');
    ok(
      String(comoVendedor.data.whatsapp?.url || '').startsWith('https://wa.me/5493764111222?text='),
      'el enlace usa el esquema wa.me/<telefono>'
    );
    ok(
      decodeURIComponent(comoVendedor.data.whatsapp.url).includes(comoVendedor.data.carton.codigo),
      'el mensaje precargado trae el codigo del carton'
    );
    ['PdfJug', `6${sufijo}1`, 'PdfTest', '3810000111'].forEach((t) =>
      ok(comoVendedor.data.whatsapp.texto.includes(t), `el mensaje incluye "${t}"`)
    );
    ok(
      !!comoVendedor.data.pdf.url_publica &&
        comoVendedor.data.whatsapp.texto.includes(comoVendedor.data.pdf.url_publica),
      'el mensaje incluye el enlace al PDF'
    );

    // El estado del carton no va ni en el mensaje ni en el PDF.
    ['IMPAGO', 'RENDIDO', 'HABILITADO', 'Estado del', 'ESTADO'].forEach((t) =>
      ok(!comoVendedor.data.whatsapp.texto.includes(t), `el mensaje NO menciona el estado ("${t}")`)
    );
    ['rinda cuentas', 'Validá tu cartón', 'Acceso al sistema', 'Usuario:', 'Clave:'].forEach((t) =>
      ok(!comoVendedor.data.whatsapp.texto.includes(t), `el mensaje ya NO dice "${t}"`)
    );

    const rutaPdf = path.join(pdfService.DIR_PDF, comoVendedor.data.pdf.archivo);
    pdfs.push(rutaPdf);
    ok(fs.existsSync(rutaPdf), 'el archivo PDF existe en disco');
    ok(fs.statSync(rutaPdf).size > 5000, `el PDF tiene contenido (${(fs.statSync(rutaPdf).size / 1024).toFixed(1)} KB)`);

    const enBase = await db.queryOne('SELECT pdf_archivo, pdf_generado_en, token_validacion FROM cartones WHERE id = ?', [
      comoVendedor.data.carton.id,
    ]);
    ok(enBase.pdf_archivo === comoVendedor.data.pdf.archivo, 'la referencia del PDF quedo en la base');
    ok(!!enBase.pdf_generado_en, 'quedo la fecha de emision');
    ok(/^[0-9a-f]{32}$/.test(enBase.token_validacion), 'el carton tiene token de validacion');

    // ---------- CASO 2: administrador ----------
    console.log('\n=== CASO 2: el administrador guarda un jugador ===');
    const comoAdmin = await req('POST', '/jugadores/nuevo', {
      token: admin,
      body: {
        vendedor_id: vendedorId,
        apellido: 'PdfJug', nombre: 'Dos', dni: `6${sufijo}2`, whatsapp: '3764333444',
        numeros: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      },
    });
    usuarios.push(comoAdmin.data.jugador.usuario_id);
    ok(comoAdmin.ok, 'alta exitosa', comoAdmin.error || '');
    ok(!!comoAdmin.data.pdf?.archivo, 'el administrador tambien obtiene el PDF');
    ok(comoAdmin.data.whatsapp?.habilitado === false, 'al administrador NO se le habilita WhatsApp');
    ok(!comoAdmin.data.whatsapp?.url, 'no se devuelve ninguna URL de WhatsApp');
    ok(!!comoAdmin.data.whatsapp?.motivo, `se explica el motivo: "${comoAdmin.data.whatsapp?.motivo}"`);
    pdfs.push(path.join(pdfService.DIR_PDF, comoAdmin.data.pdf.archivo));

    // ---------- CASO 3: mismo sorteo, mismo color ----------
    console.log('\n=== CASO 3: cartones del mismo sorteo, mismo color ===');
    const delSorteo = await db.query(
      'SELECT c.id, s.color_carton FROM cartones c JOIN sorteos s ON s.id = c.sorteo_id WHERE c.sorteo_id = ?',
      [sorteoA.id]
    );
    ok(delSorteo.length >= 2, `${delSorteo.length} cartones en el sorteo A`);
    ok(
      new Set(delSorteo.map((c) => c.color_carton)).size === 1,
      'todos los cartones del sorteo comparten un unico color'
    );

    // El color vive en `sorteos`, asi que es imposible por construccion que dos
    // cartones del mismo sorteo difieran. Se verifica tambien en el PDF.
    const sinComprimir = await pdfService.generarCartonPdf({
      carton: await require('../src/models/carton.model').buscarPorId(comoVendedor.data.carton.id),
      sorteo: await require('../src/models/sorteo.model').buscarPorId(sorteoA.id),
      jugador: await require('../src/models/jugador.model').buscarPorId(comoVendedor.data.jugador.id),
      vendedor: await require('../src/models/vendedor.model').buscarPorId(vendedorId),
      grilla: pdfService.grillaDesdeDisposicion(
        await require('../src/models/carton.model').disposicionDe(comoVendedor.data.carton.id)
      ),
      comprimir: false,
    });
    pdfs.push(sinComprimir.ruta);

    const texto = textoDelPdf(sinComprimir.ruta);
    const usados = coloresDelPdf(sinComprimir.ruta);

    console.log('\n=== Contenido del PDF ===');
    ['DGG GESTIÓN', 'JUGADOR', 'VENDEDOR', 'uso exclusivo del vendedor', 'evitar estafas'].forEach((t) =>
      ok(texto.includes(t), `el PDF dice "${t}"`)
    );

    // Lo que se saco a pedido: el rotulo VALIDACION, la URL escrita, las
    // credenciales, el aviso de los 24 hs, el estado del carton y el texto
    // viejo del QR.
    ['VALIDACI', 'rinda cuentas', 'Ingres', 'Usuario', 'Clave', 'http',
     'ESTADO', 'IMPAGO', 'RENDIDO', 'HABILITADO', 'falsificados', 'Escane'].forEach((t) =>
      ok(!texto.includes(t), `el PDF ya NO dice "${t}"`)
    );
    ok(texto.includes(comoVendedor.data.carton.codigo), 'el PDF trae el codigo del carton');
    ok(texto.includes('PdfJug'), 'el PDF trae el apellido del jugador');
    ok(texto.includes(`6${sufijo}1`), 'el PDF trae el DNI del jugador');
    ok(texto.includes('3810000111'), 'el PDF trae el telefono del vendedor');
    ok(texto.includes(`${sorteoA.numero}`), 'el PDF trae el numero de sorteo');
    ok(
      usados.includes(sorteoA.color_carton.toLowerCase()),
      `el PDF usa el color del sorteo (${sorteoA.color_carton}); encontrados: ${usados.length}`
    );
    ok(usados.includes('#94a3b8'), 'el PDF usa el gris de los casilleros vacios');

    // ---------- CASO 5: el QR valida ----------
    console.log('\n=== CASO 5: el QR del PDF valida el carton ===');
    const token = enBase.token_validacion;
    ok(
      comoVendedor.data.pdf.url_validacion.endsWith(`/validar/${token}`),
      'la URL del QR apunta a la validacion del carton'
    );

    const val = await req('GET', `/validar/${token}`);
    ok(val.ok && val.data.valido === true, 'el endpoint publico valida el carton', val.error || '');
    ok(val.data.carton.codigo === comoVendedor.data.carton.codigo, 'devuelve el carton correcto');
    ok(val.data.jugador.apellido === 'PdfJug', 'devuelve el jugador');
    ok(val.data.vendedor.apellido === 'PdfTest', 'devuelve el vendedor');
    ok(val.data.sorteo.numero === sorteoA.numero, 'devuelve el sorteo');
    ok(val.data.sorteo.color === sorteoA.color_carton, 'devuelve el color del sorteo');
    ok(val.data.grilla.length === 30, 'devuelve la grilla de 30 casilleros');
    ok(
      val.data.grilla.filter((c) => c.numero !== null).length === 10,
      'la grilla tiene los 10 numeros del carton'
    );
    ok(val.data.jugador.dni === undefined, 'NO expone el DNI del jugador en la ruta publica');
    ok(val.data.carton.jugador_whatsapp === undefined, 'NO expone el WhatsApp del jugador');

    // El enlace del mensaje tiene que servir el PDF sin autenticacion: es el
    // que abre el jugador desde WhatsApp.
    const resPdf = await fetch(`${BASE}/validar/${token}/pdf`);
    const cuerpo = Buffer.from(await resPdf.arrayBuffer());
    ok(resPdf.status === 200, 'el enlace publico del PDF responde 200');
    ok(
      (resPdf.headers.get('content-type') || '').includes('application/pdf'),
      `se sirve como PDF (${resPdf.headers.get('content-type')})`
    );
    ok(cuerpo.slice(0, 5).toString() === '%PDF-', 'el cuerpo es un PDF valido');
    ok(cuerpo.length > 5000, `el PDF descargado pesa ${(cuerpo.length / 1024).toFixed(1)} KB`);

    // Si el archivo se borra, el enlace lo regenera en vez de romperse.
    fs.rmSync(path.join(pdfService.DIR_PDF, enBase.pdf_archivo), { force: true });
    const reGenerado = await fetch(`${BASE}/validar/${token}/pdf`);
    ok(reGenerado.status === 200, 'si el archivo falta, el enlace lo regenera');
    const nuevo = await db.queryOne('SELECT pdf_archivo FROM cartones WHERE token_validacion = ?', [token]);
    pdfs.push(path.join(pdfService.DIR_PDF, nuevo.pdf_archivo));

    const pdfInventado = await fetch(`${BASE}/validar/${'0'.repeat(32)}/pdf`);
    ok(pdfInventado.status === 404, 'un token inexistente no entrega PDF');

    const inventado = await req('GET', `/validar/${'0'.repeat(32)}`);
    ok(inventado.status === 404, 'un token inexistente da 404');
    const malo = await req('GET', '/validar/no-es-un-token');
    ok(malo.status === 404, 'un token con formato invalido da 404');

    // ---------- Reemision ----------
    console.log('\n=== Reemision del PDF ===');
    const re = await req('POST', `/jugadores/cartones/${comoVendedor.data.carton.id}/pdf`, { token: tVend });
    ok(re.ok && !!re.data.pdf.archivo, 'el vendedor puede reemitir el PDF', re.error || '');
    ok(re.data.whatsapp.habilitado === true, 'la reemision tambien trae el enlace para el vendedor');
    pdfs.push(path.join(pdfService.DIR_PDF, re.data.pdf.archivo));

    const reAdmin = await req('POST', `/jugadores/cartones/${comoVendedor.data.carton.id}/pdf`, { token: admin });
    ok(reAdmin.data.whatsapp.habilitado === false, 'al administrador la reemision no le da WhatsApp');
    pdfs.push(path.join(pdfService.DIR_PDF, reAdmin.data.pdf.archivo));
  } finally {
    console.log('\n=== Limpieza ===');
    for (const p of pdfs) fs.rmSync(p, { force: true });
    for (const id of sorteosCreados) await db.query('DELETE FROM sorteos WHERE id = ?', [id]);
    for (const id of [...usuarios].reverse()) {
      await db.query('DELETE FROM usuarios WHERE id = ?', [id]).catch((e) => console.log('   ', e.code));
    }
    await db.query('DELETE FROM mensajes_whatsapp WHERE jugador_id IS NULL AND carton_id IS NULL');
    console.log(`  ${pdfs.length} PDFs de prueba borrados`);
    console.log('  sorteos:', (await db.query('SELECT numero, nombre FROM sorteos')).map((s) => `${s.numero}:${s.nombre}`).join(', '));
  }

  console.log(`\n${fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBAS FALLARON`}\n`);
  await db.pool.end();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error('Error inesperado:', err);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
