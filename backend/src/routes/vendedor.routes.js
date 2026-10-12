'use strict';
/** Rutas del modulo Administrador -> vendedores. Todas exigen rol ADMIN. */
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/vendedor.controller');
const { validar } = require('../middlewares/validate.middleware');
const { verificarToken, permitir } = require('../middlewares/auth.middleware');

const router = Router();
router.use(verificarToken);

const reglasAlta = [
  body('apellido').trim().notEmpty().withMessage('El apellido es obligatorio'),
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('dni').trim().isLength({ min: 6, max: 15 }).withMessage('DNI invalido'),
  body('telefono').trim().notEmpty().withMessage('El telefono es obligatorio'),
];

// El vendedor autenticado puede ver la lista (para elegir jugadores); el resto solo ADMIN.
router.get('/', permitir('ADMIN'), ctrl.listar);
router.get('/:id', permitir('ADMIN', 'VENDEDOR'), ctrl.obtener);
// Resumen de cartones vendidos por sorteo (vista /vendedor/cartones).
router.get('/:id/cartones', permitir('ADMIN', 'VENDEDOR'), ctrl.cartonesPorSorteo);

router.post('/', permitir('ADMIN'), reglasAlta, validar, ctrl.crear);
router.put('/:id', permitir('ADMIN'), ctrl.actualizar);
router.patch(
  '/:id/habilitacion',
  permitir('ADMIN'),
  body('habilitado').isBoolean().withMessage('habilitado debe ser booleano'),
  validar,
  ctrl.cambiarHabilitacion
);
router.delete('/:id', permitir('ADMIN'), ctrl.eliminar);

module.exports = router;
