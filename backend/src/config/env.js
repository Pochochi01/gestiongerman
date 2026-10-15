'use strict';
require('dotenv').config();

const path = require('path');

const toBool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'si'].includes(String(v).toLowerCase());

const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // URL publica del frontend: se incluye en los mensajes de WhatsApp para que
  // el jugador sepa donde entrar.
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),

  /**
   * Saltos de proxy en los que confiar para leer la IP real del visitante
   * (cabecera `X-Forwarded-For`). Detrás de nginx vale 1.
   *
   * Sin esto Express ve `127.0.0.1` como IP de TODOS los pedidos y los límites
   * por IP se vuelven globales: el intento de login número 21 de cualquier
   * usuario bloquearía a todos los demás durante 15 minutos.
   */
  trustProxy: Number(
    process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 1 : 0)
  ),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bingodgg',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dgg-gestion-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'Admin1234!',
  },

  whatsapp: {
    // El chatbot de Baileys queda DESCONECTADO por defecto: los cartones los
    // manda el vendedor desde su propio WhatsApp con el enlace wa.me que
    // devuelve `POST /api/jugadores/nuevo`.
    //
    // El código de Baileys sigue entero y la sesión guardada no se borra: para
    // volver a usarlo basta poner WA_ENABLED=true. Con el chatbot apagado los
    // avisos automáticos (cartón habilitado, números del día, ganadores) se
    // registran en `mensajes_whatsapp` pero no se envían.
    enabled: toBool(process.env.WA_ENABLED, false),
    // Archivo único con las credenciales de la sesión vinculada. Mientras
    // exista, el backend reconecta solo y no pide QR.
    sessionFile: path.resolve(process.env.WA_SESSION_FILE || './session.json'),
    printQr: toBool(process.env.WA_PRINT_QR, true),
  },

  uploads: {
    dir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
    maxBytes: Number(process.env.UPLOAD_MAX_MB || 5) * 1024 * 1024,
  },
};

if (env.nodeEnv === 'production' && env.jwt.secret === 'dgg-gestion-dev-secret') {
  throw new Error('JWT_SECRET debe definirse en produccion');
}

module.exports = env;
