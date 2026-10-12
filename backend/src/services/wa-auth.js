'use strict';
/**
 * Persistencia de la sesion de Baileys en UN solo archivo JSON.
 *
 * Baileys 6.x sólo trae `useMultiFileAuthState` (una carpeta con un archivo por
 * clave). Acá se implementa el equivalente de un archivo único, que es lo que
 * pide el panel del administrador: `backend/session.json`.
 *
 * Qué se guarda:
 *   - `creds`: identidad del dispositivo vinculado (claves Noise/Signal, el
 *     usuario de WhatsApp, el token de registro). Es lo que evita volver a
 *     escanear el QR.
 *   - `keys`: claves de sesión de Signal y de sincronización de estado.
 *
 * Los valores son Buffers, que JSON no representa: se serializan con
 * `BufferJSON.replacer` / `reviver`, los helpers que expone la propia Baileys.
 *
 * La escritura es atómica (archivo temporal + rename) y está agrupada con un
 * pequeño debounce, porque durante el arranque Baileys guarda claves muchas
 * veces seguidas.
 */
const fs = require('fs');
const path = require('path');

const DEMORA_ESCRITURA_MS = 150;

/**
 * @param {string} archivo Ruta del JSON de sesión.
 * @param {object} baileys Módulo de Baileys ya importado (initAuthCreds, BufferJSON, proto).
 * @param {object} logger
 */
function useSingleFileAuthState(archivo, baileys, logger) {
  const { initAuthCreds, BufferJSON, proto } = baileys;
  const ruta = path.resolve(archivo);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });

  let creds;
  let keys = {};
  let existia = false;

  if (fs.existsSync(ruta)) {
    try {
      const guardado = JSON.parse(fs.readFileSync(ruta, 'utf8'), BufferJSON.reviver);
      creds = guardado.creds;
      keys = guardado.keys || {};
      existia = Boolean(creds);
    } catch (err) {
      // Un JSON corrupto no debe dejar el sistema sin WhatsApp: se respalda y
      // se arranca de cero (el administrador tendrá que escanear el QR).
      const respaldo = `${ruta}.corrupto-${Date.now()}`;
      fs.renameSync(ruta, respaldo);
      logger.error({ err, respaldo }, 'session.json ilegible: se respaldó y se empieza una sesión nueva');
    }
  }

  if (!creds) creds = initAuthCreds();

  let pendiente = null;

  const escribir = () => {
    const tmp = `${ruta}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ creds, keys }, BufferJSON.replacer, 2));
    fs.renameSync(tmp, ruta); // atómico: nunca queda un JSON a medio escribir
  };

  const guardar = () =>
    new Promise((resolve) => {
      if (pendiente) clearTimeout(pendiente);
      pendiente = setTimeout(() => {
        pendiente = null;
        try {
          escribir();
        } catch (err) {
          logger.error({ err, ruta }, 'No se pudo guardar la sesión de WhatsApp');
        }
        resolve();
      }, DEMORA_ESCRITURA_MS);
    });

  return {
    /** true si se leyeron credenciales desde disco. */
    existia,
    ruta,

    /**
     * true sólo si la sesión llegó a vincularse con un teléfono.
     * Un archivo con credenciales a medio registrar (el QR nunca se escaneó)
     * no cuenta como sesión guardada.
     */
    estaRegistrada: () => Boolean(creds?.registered || creds?.me?.id),

    state: {
      creds,
      keys: {
        get: (tipo, ids) => {
          const datos = {};
          for (const id of ids) {
            let valor = keys[`${tipo}-${id}`];
            if (tipo === 'app-state-sync-key' && valor) {
              valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
            }
            datos[id] = valor;
          }
          return datos;
        },
        set: (datos) => {
          for (const tipo of Object.keys(datos)) {
            for (const id of Object.keys(datos[tipo])) {
              const valor = datos[tipo][id];
              const clave = `${tipo}-${id}`;
              if (valor) keys[clave] = valor;
              else delete keys[clave];
            }
          }
          return guardar();
        },
      },
    },

    /** Vuelca credenciales y claves a disco (lo llama el evento creds.update). */
    saveCreds: guardar,

    /** Fuerza la escritura inmediata, sin esperar el debounce. */
    flush: () => {
      if (pendiente) {
        clearTimeout(pendiente);
        pendiente = null;
      }
      try {
        escribir();
      } catch (err) {
        logger.error({ err, ruta }, 'No se pudo guardar la sesión de WhatsApp');
      }
    },

    /** Borra el archivo de sesión (desvinculación). */
    clear: () => {
      if (pendiente) {
        clearTimeout(pendiente);
        pendiente = null;
      }
      fs.rmSync(ruta, { force: true });
      fs.rmSync(`${ruta}.tmp`, { force: true });
      keys = {};
      creds = initAuthCreds();
    },
  };
}

module.exports = { useSingleFileAuthState };
