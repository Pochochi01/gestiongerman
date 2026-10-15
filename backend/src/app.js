'use strict';
/** Configuracion de la aplicacion Express (sin levantar el puerto). */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const rutas = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Detrás de nginx: habilita leer la IP real desde X-Forwarded-For, para que
// los límites por IP (login, validación pública) cuenten por visitante y no
// por el proxy. Ver `env.trustProxy`.
if (env.trustProxy > 0) app.set('trust proxy', env.trustProxy);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.corsOrigin.split(',').map((o) => o.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

// Limite de intentos de login para mitigar fuerza bruta sobre el DNI.
app.use(
  '/api/auth/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false })
);

app.use('/api', rutas);
app.use('/uploads', express.static(env.uploads.dir));

// Raiz del servicio.
//
// En produccion esta ruta casi no se ve: nginx atiende `/` con el frontend
// compilado y solo manda `/api` y `/uploads` a este proceso. Se alcanza al
// entrar directo al puerto de la API (127.0.0.1:5006), que es justo lo que se
// hace al diagnosticar un despliegue; antes caia en el 404 generico y no
// aclaraba si el proceso estaba vivo o si el puerto era el equivocado.
//
// Responde segun lo que pida el cliente: un navegador recibe una pagina
// minima, y curl o cualquier cliente de API reciben JSON.
app.get('/', (req, res) => {
  const datos = {
    servicio: 'dgg-gestion-api',
    estado: 'en linea',
    mensaje: 'API de DGG Gestion. Las rutas de la aplicacion viven bajo /api.',
    api: '/api',
    salud: '/api/salud',
  };

  res.format({
    'text/html': () =>
      res.send(
        `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>DGG Gestion - API</title>` +
          `<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;` +
          `font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#f1f5f9;color:#1e293b}` +
          `main{max-width:32rem;padding:2rem;text-align:center}h1{margin:0 0 .5rem;font-size:1.25rem}` +
          `p{margin:0 0 1.5rem;color:#475569}a{color:#1f40f5;text-underline-offset:.2em}` +
          `code{background:#e2e8f0;padding:.15em .4em;border-radius:.25rem;font-size:.9em}` +
          `@media(prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}p{color:#94a3b8}` +
          `code{background:#1e293b}a{color:#8eb3ff}}</style></head>` +
          `<body><main><h1>DGG Gestion</h1>` +
          `<p>La API esta en linea. Las rutas de la aplicacion viven bajo <code>/api</code>.</p>` +
          `<p><a href="/api">Ver el indice de la API</a> &middot; ` +
          `<a href="/api/salud">Estado del servicio</a></p></main></body></html>`
      ),
    'application/json': () => res.json({ ok: true, data: datos }),
    default: () => res.type('text/plain').send(`${datos.mensaje}\nIndice: /api\nEstado: /api/salud\n`),
  });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
