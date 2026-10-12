'use strict';
/** Punto de entrada: valida la base, levanta HTTP y arranca WhatsApp. */
const app = require('./app');
const env = require('./config/env');
const db = require('./config/db');
const logger = require('./utils/logger');
const whatsapp = require('./services/whatsapp.service');

async function main() {
  await db.ping();
  logger.info(`MySQL conectado (${env.db.database}@${env.db.host})`);

  const server = app.listen(env.port, () => {
    logger.info(`API escuchando en http://localhost:${env.port}/api`);
  });

  // Sin este handler, un puerto ocupado termina en un 'error' no capturado y
  // un stack trace de node en vez de un mensaje util.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `El puerto ${env.port} ya esta en uso. Cierre el proceso que lo ocupa ` +
          `o cambie PORT en el archivo .env (y VITE_PROXY_TARGET en el frontend).`
      );
    } else {
      logger.error({ err }, 'Error del servidor HTTP');
    }
    process.exit(1);
  });

  // No bloquea el arranque: si WhatsApp falla, la API sigue operativa.
  whatsapp.iniciar().catch((err) => logger.error({ err }, 'WhatsApp no pudo iniciarse'));

  const cerrar = (senal) => async () => {
    logger.info(`${senal} recibido, cerrando`);
    server.close(() => db.pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', cerrar('SIGINT'));
  process.on('SIGTERM', cerrar('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
