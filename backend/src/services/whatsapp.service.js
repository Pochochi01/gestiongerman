'use strict';
/**
 * Integración con WhatsApp mediante Baileys.
 *
 * Ciclo de vida de la sesión:
 *
 *   arranque ──> ¿existe session.json?
 *                  │
 *                  ├── sí ──> reconecta solo, sin QR ──────────> CONECTADO
 *                  │
 *                  └── no ──> emite QR (consola + base64 para
 *                             el panel del admin) ──escaneo──> CONECTADO
 *
 *   caída de red ──> reintento con backoff (5s, 10s, 20s… máx 60s)
 *   logout desde el panel o el teléfono ──> borra session.json ──> vuelve al QR
 *
 * Reglas de diseño:
 * - `enviar()` NUNCA lanza: registra el resultado en `mensajes_whatsapp` para
 *   que una caída de WhatsApp no aborte una venta.
 * - Con WA_ENABLED=false trabaja en modo simulado (sólo registra en la tabla).
 */
const fs = require('fs');
const QRCode = require('qrcode');
const env = require('../config/env');
const logger = require('../utils/logger');
const mensajeModel = require('../models/mensaje.model');
const catalogo = require('../models/catalogo.model');
const { useSingleFileAuthState } = require('./wa-auth');

/** Estados posibles que ve el panel del administrador. */
const ESTADOS = {
  DESHABILITADO: 'deshabilitado', // WA_ENABLED=false
  DESCONECTADO: 'desconectado',   // sin socket activo
  CONECTANDO: 'conectando',       // handshake en curso
  ESPERANDO_QR: 'esperando_qr',   // hay QR vigente para escanear
  CONECTADO: 'conectado',         // listo para enviar
};

const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 60000;
const QR_VIGENCIA_MS = 60000;      // WhatsApp rota el QR cada ~20s; 60s es margen
const ESPERA_CONEXION_MS = 20000;  // margen para que termine el handshake antes de enviar

let sock = null;
let auth = null;
let estado = ESTADOS.DESCONECTADO;
let iniciando = null;

let qrTexto = null;
let qrBase64 = null;
let qrGeneradoEn = null;

let intentos = 0;
let timerReconexion = null;
let reconectarEn = null;     // timestamp del próximo intento
let ultimoError = null;
let conectadoDesde = null;
let telefono = null;         // número vinculado, para mostrarlo en el panel
let desvinculando = false;   // evita que el logout dispare una reconexión

/** Importa Baileys (ESM puro) desde CommonJS. */
async function cargarBaileys() {
  const mod = await import('@whiskeysockets/baileys');
  const raiz = mod.default?.makeWASocket ? mod.default : mod;
  return {
    makeWASocket: raiz.makeWASocket || raiz.default,
    DisconnectReason: raiz.DisconnectReason,
    fetchLatestBaileysVersion: raiz.fetchLatestBaileysVersion,
    initAuthCreds: raiz.initAuthCreds,
    BufferJSON: raiz.BufferJSON,
    proto: raiz.proto,
  };
}

/**
 * ¿Hay una sesión vinculada que permita reconectar sin QR?
 * No alcanza con que el archivo exista: debe tener credenciales registradas
 * (si el QR nunca se escaneó, las credenciales están a medio hacer).
 */
function haySesionGuardada() {
  if (auth) return auth.estaRegistrada();
  return fs.existsSync(env.whatsapp.sessionFile);
}

/** Estado público para `GET /api/whatsapp/estado`. */
function obtenerEstado() {
  if (!env.whatsapp.enabled) {
    return {
      habilitado: false,
      estado: ESTADOS.DESHABILITADO,
      mensaje:
        'El chatbot de WhatsApp está DESCONECTADO (WA_ENABLED=false). Los cartones los envía ' +
        'cada vendedor desde su propio WhatsApp, con el enlace que genera el alta del jugador. ' +
        'Los avisos automáticos (cartón habilitado, números del día, ganadores) quedan ' +
        'registrados en la bandeja pero no se envían. Para reactivar el chatbot: WA_ENABLED=true.',
      qr: null,
      sesion_guardada: haySesionGuardada(),
      archivo_sesion: env.whatsapp.sessionFile,
    };
  }

  const qrVigente = qrBase64 && Date.now() - qrGeneradoEn < QR_VIGENCIA_MS;

  return {
    habilitado: true,
    estado,
    conectado: estado === ESTADOS.CONECTADO,
    telefono,
    conectado_desde: conectadoDesde,
    qr: qrVigente ? qrBase64 : null,        // data:image/png;base64,...
    qr_texto: qrVigente ? qrTexto : null,   // por si se quiere renderizar aparte
    sesion_guardada: haySesionGuardada(),
    archivo_sesion: env.whatsapp.sessionFile,
    intentos_reconexion: intentos,
    reconectar_en: reconectarEn,
    ultimo_error: ultimoError,
    mensaje: mensajeDeEstado(),
  };
}

function mensajeDeEstado() {
  switch (estado) {
    case ESTADOS.CONECTADO:
      return `Vinculado${telefono ? ` con el número ${telefono}` : ''}. La sesión queda guardada: no hace falta volver a escanear el QR.`;
    case ESTADOS.ESPERANDO_QR:
      return 'Escanee el código QR desde WhatsApp > Dispositivos vinculados > Vincular un dispositivo.';
    case ESTADOS.CONECTANDO:
      return 'Estableciendo conexión con WhatsApp...';
    default:
      return reconectarEn
        ? `Sin conexión. Próximo reintento automático en ${Math.max(0, Math.round((reconectarEn - Date.now()) / 1000))} s.`
        : 'Sin conexión. Use "Vincular dispositivo" para generar un código QR.';
  }
}

/** Programa el próximo intento con backoff exponencial acotado. */
function programarReconexion() {
  if (timerReconexion) clearTimeout(timerReconexion);
  const espera = Math.min(BACKOFF_BASE_MS * 2 ** Math.min(intentos, 4), BACKOFF_MAX_MS);
  reconectarEn = Date.now() + espera;
  intentos += 1;
  logger.warn(`WhatsApp: reintentando la conexión en ${espera / 1000} s (intento ${intentos})`);
  timerReconexion = setTimeout(() => {
    timerReconexion = null;
    reconectarEn = null;
    iniciar().catch((err) => logger.error({ err }, 'WhatsApp: falló el reintento de conexión'));
  }, espera);
}

function limpiarQr() {
  qrTexto = null;
  qrBase64 = null;
  qrGeneradoEn = null;
}

/**
 * Espera a que la conexión termine de abrirse.
 *
 * El handshake tarda un par de segundos. Sin esta espera, cualquier envío que
 * caiga en esa ventana (por ejemplo, vender un cartón apenas arranca el
 * servidor) fallaría aunque la sesión estuviera perfectamente vinculada.
 *
 * @returns {Promise<boolean>} true si quedó conectado dentro del plazo.
 */
function esperarConexion(ms = ESPERA_CONEXION_MS) {
  if (estado === ESTADOS.CONECTADO) return Promise.resolve(true);

  return new Promise((resolve) => {
    const limite = Date.now() + ms;
    const revisar = () => {
      if (estado === ESTADOS.CONECTADO) return resolve(true);
      // Si falta vincular el dispositivo, esperar no cambia nada.
      if (estado === ESTADOS.ESPERANDO_QR || estado === ESTADOS.DESHABILITADO) return resolve(false);
      if (Date.now() >= limite) return resolve(false);
      return setTimeout(revisar, 250);
    };
    revisar();
  });
}

/**
 * Abre (o reusa) la conexión con WhatsApp.
 * Si `session.json` existe, reconecta sin pedir QR.
 */
async function iniciar() {
  if (!env.whatsapp.enabled) {
    estado = ESTADOS.DESHABILITADO;
    logger.warn('WhatsApp deshabilitado (WA_ENABLED=false): los mensajes sólo se registran');
    return null;
  }
  if (sock) return sock;
  if (iniciando) return iniciando;

  iniciando = (async () => {
    const baileys = await cargarBaileys();
    const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    auth = useSingleFileAuthState(env.whatsapp.sessionFile, baileys, logger);
    logger.info(
      auth.existia
        ? `WhatsApp: sesión encontrada en ${auth.ruta}, reconectando sin QR`
        : `WhatsApp: no hay sesión guardada, se generará un código QR (se guardará en ${auth.ruta})`
    );

    const { version } = await fetchLatestBaileysVersion();
    estado = ESTADOS.CONECTANDO;
    ultimoError = null;

    sock = makeWASocket({
      version,
      auth: auth.state,
      browser: ['BingoDGG', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', auth.saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // --- Hay QR para vincular ---
      if (qr) {
        qrTexto = qr;
        qrGeneradoEn = Date.now();
        estado = ESTADOS.ESPERANDO_QR;
        try {
          // Data URL listo para un <img src=...> en el panel del administrador.
          qrBase64 = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        } catch (err) {
          logger.error({ err }, 'WhatsApp: no se pudo generar el QR en base64');
        }
        if (env.whatsapp.printQr) {
          require('qrcode-terminal').generate(qr, { small: true });
        }
        logger.info('WhatsApp: código QR disponible en el panel del administrador (/admin/whatsapp)');
      }

      // --- Conexión establecida ---
      if (connection === 'open') {
        estado = ESTADOS.CONECTADO;
        intentos = 0;
        reconectarEn = null;
        ultimoError = null;
        conectadoDesde = new Date().toISOString();
        telefono = sock.user?.id ? sock.user.id.split(':')[0] : null;
        limpiarQr();
        auth.flush(); // asegura que session.json quede en disco ya vinculado
        logger.info(
          `WhatsApp conectado${telefono ? ` (${telefono})` : ''}. Sesión guardada en ${auth.ruta}`
        );
        procesarPendientes()
          .then((n) => n && logger.info(`WhatsApp: se reenviaron ${n} mensajes pendientes`))
          .catch((err) => logger.error({ err }, 'WhatsApp: error reenviando pendientes'));
      }

      // --- Conexión cerrada ---
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        ultimoError = lastDisconnect?.error?.message || null;
        sock = null;
        iniciando = null;
        estado = ESTADOS.DESCONECTADO;
        conectadoDesde = null;

        if (desvinculando) return; // el logout ya se encarga de limpiar

        // 515: WhatsApp pide reiniciar el socket justo después de vincular.
        if (code === DisconnectReason.restartRequired) {
          logger.info('WhatsApp: vinculación completada, reiniciando la conexión');
          intentos = 0;
          iniciar().catch((err) => logger.error({ err }, 'WhatsApp: falló el reinicio'));
          return;
        }

        // 401: la sesión dejó de ser válida (se cerró desde el teléfono).
        if (code === DisconnectReason.loggedOut) {
          logger.warn(
            'WhatsApp: WhatsApp rechazó las credenciales (401). Suele pasar si el dispositivo ' +
              'se quitó desde el teléfono o si la vinculación quedó a medias. Se borra session.json: ' +
              'vuelva a escanear el QR desde /admin/whatsapp'
          );
          telefono = null;
          auth.clear();
          limpiarQr();
          intentos = 0;
          iniciar().catch((err) => logger.error({ err }, 'WhatsApp: no se pudo reabrir para generar el QR'));
          return;
        }

        logger.warn({ code, motivo: ultimoError }, 'WhatsApp desconectado');
        programarReconexion();
      }
    });

    return sock;
  })();

  try {
    return await iniciando;
  } catch (err) {
    iniciando = null;
    sock = null;
    estado = ESTADOS.DESCONECTADO;
    ultimoError = err.message;
    logger.error({ err }, 'WhatsApp: no se pudo iniciar');
    programarReconexion();
    return null;
  }
}

/**
 * Desvincula el dispositivo: cierra sesión en el teléfono (desaparece de
 * "Dispositivos vinculados") y borra `session.json` del servidor.
 * Después queda listo para generar un QR nuevo con `vincular()`.
 */
async function desvincular({ reconectar = true } = {}) {
  desvinculando = true;
  if (timerReconexion) {
    clearTimeout(timerReconexion);
    timerReconexion = null;
  }
  reconectarEn = null;

  try {
    if (sock) {
      // logout() avisa a WhatsApp: libera el dispositivo en ambos extremos.
      await sock.logout();
      logger.info('WhatsApp: sesión cerrada en el teléfono');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'WhatsApp: el logout remoto falló; se limpia igual el servidor');
  }

  try {
    sock?.end?.(undefined);
  } catch (_) { /* el socket ya podía estar cerrado */ }

  if (auth) auth.clear();
  else fs.rmSync(env.whatsapp.sessionFile, { force: true });

  sock = null;
  auth = null;
  iniciando = null;
  estado = ESTADOS.DESCONECTADO;
  telefono = null;
  conectadoDesde = null;
  intentos = 0;
  ultimoError = null;
  limpiarQr();
  desvinculando = false;

  logger.info(`WhatsApp: desvinculado y ${env.whatsapp.sessionFile} eliminado`);

  // Reabre la conexión para que el panel muestre enseguida un QR nuevo.
  if (reconectar) await iniciar();
  return obtenerEstado();
}

/** Fuerza una conexión nueva (genera QR si no hay sesión guardada). */
async function vincular() {
  if (estado === ESTADOS.CONECTADO) return obtenerEstado();
  if (timerReconexion) {
    clearTimeout(timerReconexion);
    timerReconexion = null;
    reconectarEn = null;
  }
  intentos = 0;
  await iniciar();
  return obtenerEstado();
}

/**
 * Registra y envía un mensaje.
 * @returns {Promise<{enviado: boolean, mensajeId: number}>}
 */
async function enviar({ tipo, destino, contenido, jugadorId = null, cartonId = null }) {
  const [tipoId, pendienteId] = await Promise.all([
    catalogo.tipoMensajeId(tipo),
    catalogo.estadoEnvioId('PENDIENTE'),
  ]);

  const mensajeId = await mensajeModel.crear({
    tipo_mensaje_id: tipoId,
    estado_envio_id: pendienteId,
    jugador_id: jugadorId,
    carton_id: cartonId,
    destino,
    contenido,
  });

  if (!env.whatsapp.enabled) {
    logger.info({ destino, tipo }, 'WhatsApp simulado (no enviado)');
    return { enviado: false, mensajeId };
  }

  try {
    const conexion = await iniciar();
    // El handshake puede estar en curso: se le da un margen antes de rendirse.
    if (!conexion || !(await esperarConexion())) {
      throw new Error(
        estado === ESTADOS.ESPERANDO_QR
          ? 'WhatsApp no está vinculado: escanee el código QR en /admin/whatsapp'
          : `WhatsApp no está conectado (estado: ${estado})`
      );
    }
    await sock.sendMessage(`${destino}@s.whatsapp.net`, { text: contenido });
    await mensajeModel.marcarEnviado(mensajeId);
    logger.info({ destino, tipo }, 'WhatsApp: mensaje enviado');
    return { enviado: true, mensajeId };
  } catch (err) {
    logger.error({ err: err.message, destino, tipo }, 'WhatsApp: falló el envío');
    await mensajeModel.marcarError(mensajeId, err.message);
    return { enviado: false, mensajeId };
  }
}

/** Reintenta los mensajes que quedaron pendientes o con error. */
async function procesarPendientes() {
  if (!env.whatsapp.enabled) return 0;
  if (!(await esperarConexion(5000))) return 0;
  const filas = await mensajeModel.pendientes();
  let enviados = 0;
  for (const m of filas) {
    try {
      await sock.sendMessage(`${m.destino}@s.whatsapp.net`, { text: m.contenido });
      await mensajeModel.marcarEnviado(m.id);
      enviados += 1;
    } catch (err) {
      await mensajeModel.marcarError(m.id, err.message);
    }
  }
  return enviados;
}

module.exports = {
  ESTADOS,
  iniciar, vincular, desvincular,
  enviar, obtenerEstado, procesarPendientes,
};
