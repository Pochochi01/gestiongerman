'use strict';
/** Rutas del modulo Sorteo. La carga de numeros es exclusiva del ADMIN. */
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/sorteo.controller');
const { validar } = require('../middlewares/validate.middleware');
const { verificarToken, permitir } = require('../middlewares/auth.middleware');

const router = Router();
router.use(verificarToken);

// Consulta: los tres roles ven el progreso (cartones faltantes, numeros del dia).
// `/historial` va antes de `/:id` para que no lo capture la ruta con parametro.
router.get('/historial', ctrl.historial);
router.get('/vigente', ctrl.vigente);
router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.get('/:id/jornadas', ctrl.jornadas);
router.get('/:id/cartones', ctrl.cartonesDelSorteo);
router.get('/:id/ranking', ctrl.ranking);
router.get('/:id/ganadores', ctrl.ganadores);

router.post(
  '/',
  permitir('ADMIN'),
  body('cartones_objetivo').isInt({ min: 1 }).withMessage('Cantidad de cartones invalida'),
  body('numeros_por_carton').optional().isInt({ min: 1, max: 10 }).withMessage('Entre 1 y 10'),
  validar,
  ctrl.crear
);

router.put('/:id', permitir('ADMIN'), ctrl.actualizar);
router.post('/:id/abrir-venta', permitir('ADMIN'), ctrl.abrirVenta);
router.post('/:id/iniciar', permitir('ADMIN'), ctrl.iniciar);
router.post('/:id/notificar-ganadores', permitir('ADMIN'), ctrl.notificarGanadores);

// Los numeros se cargan como salen en la quiniela: hasta 4 cifras (0 a 9999).
// El servicio toma las dos ultimas para validar los cartones.
router.post(
  '/:id/numeros',
  permitir('ADMIN'),
  body('numeros').isArray({ min: 1 }).withMessage('Indique al menos un numero'),
  body('numeros.*')
    .customSanitizer((v) => String(v).trim())
    .matches(/^\d{1,4}$/)
    .withMessage('Cada numero admite hasta 4 cifras'),
  body('numero_sorteo')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 99999999 })
    .withMessage('El numero de sorteo debe ser un entero positivo'),
  body('fecha').optional().isISO8601().withMessage('Fecha invalida (YYYY-MM-DD)'),
  validar,
  ctrl.cargarNumeros
);

module.exports = router;
