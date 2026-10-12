'use strict';
const pino = require('pino');
const env = require('../config/env');

module.exports = pino({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});
