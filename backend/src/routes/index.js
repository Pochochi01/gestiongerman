'use strict';
/** Montaje de todas las rutas bajo /api. */
const { Router } = require('express');
const { verificarToken, permitir } = require('../middlewares/auth.middleware');

const whatsappCtrl = require('../controllers/whatsapp.controller');
const validacionCtrl = require('../controllers/validacion.controller');
const rateLimit = require('express-rate-limit');

const router = Router();

router.get('/salud', (req, res) => res.json({ ok: true, data: { servicio: 'dgg-gestion-api' } }));

// Indice de la API. Antes entrar a /api devolvia el 404 generico, que no
// distingue "el servicio no esta" de "esta, pero esa ruta no existe".
router.get('/', (req, res) =>
  res.json({
    ok: true,
    data: {
      servicio: 'dgg-gestion-api',
      recursos: {
        salud: 'GET /api/salud',
        autenticacion: '/api/auth',
        administradores: '/api/administradores (solo administrador)',
        vendedores: '/api/vendedores',
        jugadores: '/api/jugadores',
        sorteos: '/api/sorteos',
        cartones: '/api/cartones',
        validacion_publica: 'GET /api/validar/:token',
        whatsapp: '/api/whatsapp (solo administrador)',
      },
    },
  })
);

// Validacion publica del QR del PDF: sin token JWT, acotada por el token del
// carton. Va antes de las rutas autenticadas.
const limitePublico = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
router.get('/validar/:token', limitePublico, validacionCtrl.validar);
// El PDF del carton: es el enlace que viaja en el mensaje de WhatsApp.
router.get('/validar/:token/pdf', limitePublico, validacionCtrl.pdf);

router.use('/auth', require('./auth.routes'));
router.use('/administradores', require('./administrador.routes'));
router.use('/vendedores', require('./vendedor.routes'));
router.use('/jugadores', require('./jugador.routes'));
router.use('/sorteos', require('./sorteo.routes'));
router.use('/cartones', require('./carton.routes'));

// Panel de WhatsApp (solo administrador)
const soloAdmin = [verificarToken, permitir('ADMIN')];
router.get('/whatsapp/estado', soloAdmin, whatsappCtrl.estado);
router.get('/whatsapp/qr', soloAdmin, whatsappCtrl.qr);
router.get('/whatsapp/mensajes', soloAdmin, whatsappCtrl.mensajes);
router.post('/whatsapp/vincular', soloAdmin, whatsappCtrl.vincular);
router.post('/whatsapp/desvincular', soloAdmin, whatsappCtrl.desvincular);
router.post('/whatsapp/reintentar', soloAdmin, whatsappCtrl.reintentar);
router.post('/whatsapp/cartones/:id/reenviar', soloAdmin, whatsappCtrl.reenviarCarton);

module.exports = router;
