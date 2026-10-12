'use strict';
/**
 * Subida de comprobantes de rendicion con multer.
 * Guarda en disco (UPLOAD_DIR/comprobantes) con nombre aleatorio y acepta
 * solo imagenes y PDF.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const destino = path.join(env.uploads.dir, 'comprobantes');
fs.mkdirSync(destino, { recursive: true });

const PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, destino),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const subirComprobante = multer({
  storage,
  limits: { fileSize: env.uploads.maxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!PERMITIDOS.includes(file.mimetype)) {
      return cb(ApiError.badRequest('Formato no permitido: use JPG, PNG, WEBP o PDF'));
    }
    return cb(null, true);
  },
}).single('comprobante');

module.exports = { subirComprobante, destinoComprobantes: destino };
