'use strict';
/** Rutas del modulo Vendedores -> jugadores. */
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/jugador.controller');
const { validar } = require('../middlewares/validate.middleware');
const { verificarToken, permitir } = require('../middlewares/auth.middleware');

const router = Router();
router.use(verificarToken);

router.get('/', permitir('ADMIN', 'VENDEDOR'), ctrl.listar);
router.get('/:id', permitir('ADMIN', 'VENDEDOR', 'JUGADOR'), ctrl.obtener);

router.post(
  '/',
  permitir('ADMIN', 'VENDEDOR'),
  body('apellido').trim().notEmpty(),
  body('nombre').trim().notEmpty(),
  body('dni').trim().isLength({ min: 6, max: 15 }).withMessage('DNI invalido'),
  body('whatsapp').trim().notEmpty().withMessage('Indique el WhatsApp'),
  body('numeros').optional().isArray({ max: 10 }).withMessage('Maximo 10 numeros'),
  validar,
  ctrl.crear
);

// Alta completa: jugador + carton + PDF con QR + enlace de WhatsApp.
// Es el endpoint del boton "Guardar jugador".
router.post(
  '/nuevo',
  permitir('ADMIN', 'VENDEDOR'),
  body('apellido').trim().notEmpty(),
  body('nombre').trim().notEmpty(),
  body('dni').trim().isLength({ min: 6, max: 15 }).withMessage('DNI invalido'),
  body('whatsapp').trim().notEmpty().withMessage('Indique el WhatsApp'),
  body('numeros').optional().isArray({ max: 10 }).withMessage('Maximo 10 numeros'),
  validar,
  ctrl.nuevo
);

// Reemitir el PDF de un carton ya vendido.
router.post('/cartones/:id/pdf', permitir('ADMIN', 'VENDEDOR'), ctrl.reemitirPdf);

router.put('/:id', permitir('ADMIN', 'VENDEDOR'), ctrl.actualizar);

module.exports = router;
