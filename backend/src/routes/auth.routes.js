'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/auth.controller');
const { validar } = require('../middlewares/validate.middleware');
const { verificarToken } = require('../middlewares/auth.middleware');

const router = Router();

router.post(
  '/login',
  body('username').trim().notEmpty().withMessage('Indique el usuario (DNI)'),
  body('password').notEmpty().withMessage('Indique la clave'),
  validar,
  ctrl.login
);

router.get('/perfil', verificarToken, ctrl.perfil);

router.put(
  '/password',
  verificarToken,
  body('password_actual').notEmpty(),
  body('password_nueva').isLength({ min: 6 }).withMessage('Minimo 6 caracteres'),
  validar,
  ctrl.cambiarPassword
);

module.exports = router;
