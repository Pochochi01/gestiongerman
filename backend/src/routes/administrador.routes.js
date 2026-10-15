'use strict';
/**
 * Rutas del modulo Administrador -> administradores. Todas exigen rol ADMIN.
 *
 * La cuenta raiz no es alcanzable por ninguna de estas rutas: el modelo solo
 * ve las fichas de `administradores`, y la raiz no tiene ficha. Ver el
 * encabezado del controlador.
 */
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/administrador.controller');
const { validar } = require('../middlewares/validate.middleware');
const { verificarToken, permitir } = require('../middlewares/auth.middleware');

const router = Router();
router.use(verificarToken, permitir('ADMIN'));

const reglasAlta = [
  body('apellido').trim().notEmpty().withMessage('El apellido es obligatorio'),
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('dni')
    .trim()
    .matches(/^\d{7,8}$/)
    .withMessage('El DNI lleva 7 u 8 numeros, sin puntos'),
];

const reglasEdicion = [
  body('apellido').trim().notEmpty().withMessage('El apellido es obligatorio'),
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
];

// Va antes de '/:id' para que la palabra "yo" no se tome como un id.
router.get('/yo', ctrl.yo);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);

router.post('/', reglasAlta, validar, ctrl.crear);
router.put('/:id', reglasEdicion, validar, ctrl.actualizar);

router.patch(
  '/:id/activacion',
  body('activo').isBoolean().withMessage('activo debe ser booleano'),
  validar,
  ctrl.cambiarActivacion
);

router.post('/:id/blanqueo', ctrl.blanquear);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
