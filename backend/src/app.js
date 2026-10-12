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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
