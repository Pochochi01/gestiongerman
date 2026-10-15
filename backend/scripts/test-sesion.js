'use strict';
/**
 * Prueba de la persistencia de la sesión de WhatsApp (sin tocar WhatsApp).
 *
 * Verifica que lo que se guarda en session.json se pueda volver a leer tal
 * cual, que es de lo que depende no tener que escanear el QR en cada reinicio.
 *
 * Uso: npm run test:sesion
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { useSingleFileAuthState } = require('../src/services/wa-auth');

const logger = { info: () => {}, warn: () => {}, error: (o, m) => console.log('   log:', m) };

let fallos = 0;
const ok = (cond, texto) => {
  console.log(`  ${cond ? 'OK  ' : 'FALLA'} ${texto}`);
  if (!cond) fallos += 1;
};

(async () => {
  const baileys = await import('@whiskeysockets/baileys');
  const raiz = baileys.default?.makeWASocket ? baileys.default : baileys;
  const mod = { initAuthCreds: raiz.initAuthCreds, BufferJSON: raiz.BufferJSON, proto: raiz.proto };

  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-wa-')), 'session.json');

  console.log('\n=== 1. Sesión nueva (no hay archivo) ===');
  const a = useSingleFileAuthState(archivo, mod, logger);
  ok(a.existia === false, 'detecta que no hay sesión previa');
  ok(a.estaRegistrada() === false, 'no figura como registrada');
  ok(typeof a.state.creds.noiseKey === 'object', 'genera credenciales nuevas');

  console.log('\n=== 2. Se guardan credenciales y claves ===');
  // Simula lo que hace Baileys tras escanear el QR.
  a.state.creds.registered = true;
  a.state.creds.me = { id: '5493764123456:1@s.whatsapp.net', name: 'DGG Gestión' };
  await a.state.keys.set({
    'pre-key': { 1: { public: Buffer.from([1, 2, 3]), private: Buffer.from([4, 5, 6]) } },
    'session': { '5493764123456.0': Buffer.from('sesion-signal') },
  });
  a.flush();

  ok(fs.existsSync(archivo), 'session.json escrito en disco');
  const crudo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  ok(Boolean(crudo.creds) && Boolean(crudo.keys), 'el JSON tiene creds y keys');
  ok(crudo.creds.registered === true, 'guarda el flag de registrada');

  console.log('\n=== 3. Reinicio: se relee el mismo archivo ===');
  const b = useSingleFileAuthState(archivo, mod, logger);
  ok(b.existia === true, 'detecta la sesión guardada');
  ok(b.estaRegistrada() === true, 'la reconoce como vinculada (no pedirá QR)');
  ok(b.state.creds.me?.id === a.state.creds.me.id, 'conserva el número vinculado');
  ok(
    Buffer.isBuffer(b.state.creds.noiseKey.private) &&
      b.state.creds.noiseKey.private.equals(a.state.creds.noiseKey.private),
    'los Buffers de las claves sobreviven al JSON'
  );

  const recuperadas = b.state.keys.get('pre-key', ['1']);
  ok(
    Buffer.isBuffer(recuperadas['1'].public) && recuperadas['1'].public.equals(Buffer.from([1, 2, 3])),
    'recupera las pre-keys con su contenido binario'
  );
  const sesionSignal = b.state.keys.get('session', ['5493764123456.0']);
  ok(
    sesionSignal['5493764123456.0'].toString() === 'sesion-signal',
    'recupera las sesiones de Signal'
  );

  console.log('\n=== 4. Borrado de claves ===');
  await b.state.keys.set({ 'pre-key': { 1: null } });
  b.flush();
  const c = useSingleFileAuthState(archivo, mod, logger);
  ok(c.state.keys.get('pre-key', ['1'])['1'] === undefined, 'una clave borrada no vuelve a aparecer');

  console.log('\n=== 5. Archivo corrupto ===');
  fs.writeFileSync(archivo, '{ esto no es json');
  const d = useSingleFileAuthState(archivo, mod, logger);
  ok(d.existia === false, 'ante un JSON ilegible arranca de cero');
  ok(
    fs.readdirSync(path.dirname(archivo)).some((f) => f.includes('corrupto')),
    'deja un respaldo del archivo corrupto'
  );

  console.log('\n=== 6. Desvinculación ===');
  d.flush();
  ok(fs.existsSync(archivo), 'hay archivo antes de desvincular');
  d.clear();
  ok(!fs.existsSync(archivo), 'clear() elimina session.json');
  ok(d.estaRegistrada() === false, 'queda sin sesión registrada');

  fs.rmSync(path.dirname(archivo), { recursive: true, force: true });
  console.log(`\n${fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBAS FALLARON`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
