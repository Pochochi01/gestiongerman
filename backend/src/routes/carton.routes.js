'use strict';
/** Rutas de cartones. */
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/carton.controller');
const { validar } = require('../middlewares/validate.middleware');
const { verificarToken, permitir } = require('../middlewares/auth.middleware');
const { subirComprobante } = require('../middlewares/upload.middleware');

const router = Router();
router.use(verificarToken);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);

router.post(
  '/',
  permitir('ADMIN', 'VENDEDOR', 'JUGADOR'),
  body('numeros').isArray({ min: 1, max: 10 }).withMessage('Entre 1 y 10 numeros'),
  body('numeros.*').isInt({ min: 1 }).withMessage('Los numeros deben ser enteros positivos'),
  validar,
  ctrl.vender
);

// Cambio de estado unificado, el que usa la tabla del panel del administrador.
router.patch(
  '/:id',
  permitir('ADMIN'),
  body('estado_pago').optional().isIn(['IMPAGO', 'RENDIDO', 'PAGADO', 'impago', 'rendido', 'pagado'])
    .withMessage('estado_pago debe ser IMPAGO, RENDIDO o PAGADO'),
  body('habilitado').optional().isBoolean().withMessage('habilitado debe ser booleano'),
  validar,
  ctrl.actualizarEstado
);

router.patch('/:id/habilitar', permitir('ADMIN'), ctrl.habilitar);
router.post('/:id/notificar-habilitado', permitir('ADMIN'), ctrl.notificarHabilitado);
router.patch('/:id/rendir', permitir('ADMIN', 'VENDEDOR'), ctrl.rendir);
router.patch('/:id/anular', permitir('ADMIN'), ctrl.anular);

router.post(
  '/:id/comprobante',
  permitir('ADMIN', 'VENDEDOR'),
  subirComprobante,
  ctrl.subirComprobante
);

module.exports = router;
