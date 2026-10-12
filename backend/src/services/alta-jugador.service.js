'use strict';
/**
 * Alta de jugador con emisión del cartón: registra, genera el PDF con el QR de
 * validación y devuelve el enlace de WhatsApp para que lo mande el vendedor.
 *
 * Es lo que consume `POST /api/jugadores/nuevo`, el botón "Guardar jugador".
 *
 * El envío por WhatsApp ya NO lo hace el servidor con Baileys: se devuelve una
 * URL `wa.me` con el mensaje armado y la abre el frontend, de modo que el
 * mensaje salga del número del propio vendedor. Para el ADMIN no se devuelve
 * enlace (ver `permiteWhatsapp`).
 */
const bcrypt = require('bcryptjs');
const { withTransaction } = require('../config/db');

const usuarioModel = require('../models/usuario.model');
const jugadorModel = require('../models/jugador.model');
const vendedorModel = require('../models/vendedor.model');
const cartonModel = require('../models/carton.model');
const sorteoModel = require('../models/sorteo.model');
const catalogo = require('../models/catalogo.model');
const mensajeModel = require('../models/mensaje.model');

const cartonService = require('./carton.service');
const pdfService = require('./pdf.service');
const enlaceWa = require('./whatsapp-link.service');

const ApiError = require('../utils/ApiError');
const { normalizarWhatsapp } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * El envío por WhatsApp es sólo para vendedores.
 *
 * El administrador carga jugadores desde el escritorio y no es quien tiene la
 * relación con el jugador: abrirle WhatsApp mandaría el mensaje desde el número
 * del sistema y el jugador le contestaría a quien no lo atiende. Para el admin
 * queda el PDF.
 */
const permiteWhatsapp = (rol) => rol === 'VENDEDOR';

/**
 * Registra el jugador y, si se enviaron números, emite el cartón.
 *
 * @param {object} datos  cuerpo del request
 * @param {object} actor  { rol, usuarioId, perfilId }
 */
async function altaConCarton(datos, actor) {
  const { apellido, nombre, dni, whatsapp, numeros } = datos;

  const vendedorId = actor.rol === 'VENDEDOR' ? actor.perfilId : Number(datos.vendedor_id);
  if (!vendedorId) throw ApiError.badRequest('Falta indicar el vendedor');

  const vendedor = await vendedorModel.buscarPorId(vendedorId);
  if (!vendedor) throw ApiError.notFound('Vendedor inexistente');
  if (!vendedor.habilitado) throw ApiError.forbidden('El vendedor esta inhabilitado');

  const wa = normalizarWhatsapp(whatsapp);
  if (!wa) throw ApiError.badRequest('El numero de WhatsApp no es valido');
  if (await jugadorModel.buscarPorDni(dni)) throw ApiError.conflict('Ya existe un jugador con ese DNI');
  if (await usuarioModel.buscarPorUsername(String(dni))) {
    throw ApiError.conflict('El DNI ya se usa como usuario');
  }

  // ---------- 1. Alta del jugador (crea tambien su usuario) ----------
  const rolId = await catalogo.rolId('JUGADOR');
  const passwordHash = await bcrypt.hash(String(dni), 10);

  const jugadorId = await withTransaction(async (conn) => {
    const usuarioId = await usuarioModel.crear(
      { rolId, username: String(dni), passwordHash },
      conn
    );
    return jugadorModel.crear(
      {
        usuario_id: usuarioId,
        vendedor_id: vendedorId,
        apellido,
        nombre,
        dni: String(dni),
        whatsapp: wa,
      },
      conn
    );
  });

  const jugador = await jugadorModel.buscarPorId(jugadorId);

  const resultado = {
    jugador,
    credenciales: { usuario: jugador.dni, clave: jugador.dni },
    carton: null,
    pdf: null,
    whatsapp: null,
    advertencia: null,
    sorteo_iniciado: null,
  };

  if (!Array.isArray(numeros) || numeros.length === 0) {
    resultado.advertencia = 'El jugador se dio de alta sin cartón: no se enviaron números.';
    return resultado;
  }

  // ---------- 2. Venta del cartón ----------
  // El jugador ya quedó confirmado. Si la venta falla no se devuelve un error:
  // se informa, para que el vendedor no reintente contra un DNI que ya existe.
  let venta;
  try {
    venta = await cartonService.venderCarton({ jugadorId, numeros, vendedorId });
  } catch (err) {
    resultado.advertencia =
      `El jugador se dio de alta, pero el cartón no se pudo generar: ${err.message}. ` +
      'Cargueselo desde la lista de clientes.';
    logger.warn({ jugadorId, err: err.message }, 'Alta de jugador sin carton');
    return resultado;
  }

  resultado.carton = venta.carton;
  resultado.sorteo_iniciado = venta.sorteo_iniciado;

  const [sorteo, disposicion] = await Promise.all([
    sorteoModel.buscarPorId(venta.carton.sorteo_id),
    cartonModel.disposicionDe(venta.carton.id),
  ]);

  // ---------- 3. PDF con el QR de validación ----------
  try {
    const pdf = await pdfService.generarCartonPdf({
      carton: venta.carton,
      sorteo,
      jugador,
      vendedor,
      grilla: pdfService.grillaDesdeDisposicion(disposicion),
    });
    await cartonModel.guardarPdf(venta.carton.id, pdf.archivo);
    resultado.pdf = {
      archivo: pdf.archivo,
      url: pdf.url,
      url_publica: pdf.urlPublica,
      url_validacion: pdf.urlValidacion,
    };
  } catch (err) {
    // El cartón ya está vendido: que falle el PDF no debe tirar la operación.
    resultado.advertencia =
      `El cartón se generó, pero el PDF falló: ${err.message}. ` +
      'Puede volver a emitirlo desde la lista de clientes.';
    logger.error({ err, carton: venta.carton.codigo }, 'Fallo la generacion del PDF');
  }

  // ---------- 4. Enlace de WhatsApp (sólo vendedores) ----------
  if (permiteWhatsapp(actor.rol)) {
    const enlace = enlaceWa.enlaceCarton({
      sorteo,
      jugador,
      vendedor,
      carton: venta.carton,
      numeros: venta.carton.numeros,
      // `wa.me` no adjunta archivos: el PDF viaja como enlace.
      urlPdf: pdfService.urlPdf(venta.carton.token_validacion),
    });

    // Queda registrado como PENDIENTE: el sistema armó el mensaje, pero el
    // envío depende de que el vendedor toque "Enviar" en WhatsApp.
    const [tipoId, estadoId] = await Promise.all([
      catalogo.tipoMensajeId('CARTON_NUEVO'),
      catalogo.estadoEnvioId('PENDIENTE'),
    ]);
    const mensajeId = await mensajeModel.crear({
      tipo_mensaje_id: tipoId,
      estado_envio_id: estadoId,
      jugador_id: jugador.id,
      carton_id: venta.carton.id,
      destino: enlace.destino,
      contenido: enlace.texto,
    });

    resultado.whatsapp = {
      habilitado: true,
      url: enlace.url,
      destino: enlace.destino,
      texto: enlace.texto,
      mensaje_id: mensajeId,
    };
  } else {
    resultado.whatsapp = {
      habilitado: false,
      motivo: 'El envío por WhatsApp está disponible sólo para vendedores.',
    };
  }

  return resultado;
}

/**
 * Vuelve a emitir el PDF de un cartón ya vendido.
 * Útil si el primer intento falló o si se perdió el archivo.
 */
async function reemitirPdf(cartonId, actor = {}) {
  const carton = await cartonModel.buscarPorId(cartonId);
  if (!carton) throw ApiError.notFound('Cartón inexistente');

  if (actor.rol === 'VENDEDOR' && carton.vendedor_id !== actor.perfilId) {
    throw ApiError.forbidden('El cartón pertenece a otro vendedor');
  }

  const [sorteo, jugador, vendedor, disposicion] = await Promise.all([
    sorteoModel.buscarPorId(carton.sorteo_id),
    jugadorModel.buscarPorId(carton.jugador_id),
    vendedorModel.buscarPorId(carton.vendedor_id),
    cartonModel.disposicionDe(carton.id),
  ]);

  const pdf = await pdfService.generarCartonPdf({
    carton,
    sorteo,
    jugador,
    vendedor,
    grilla: pdfService.grillaDesdeDisposicion(disposicion),
  });
  await cartonModel.guardarPdf(carton.id, pdf.archivo);

  const respuesta = {
    carton: carton.codigo,
    pdf: {
      archivo: pdf.archivo,
      url: pdf.url,
      url_publica: pdf.urlPublica,
      url_validacion: pdf.urlValidacion,
    },
    whatsapp: { habilitado: false },
  };

  if (permiteWhatsapp(actor.rol)) {
    const enlace = enlaceWa.enlaceCarton({
      sorteo,
      jugador,
      vendedor,
      carton,
      numeros: carton.numeros,
      urlPdf: pdf.urlPublica,
    });
    respuesta.whatsapp = { habilitado: true, url: enlace.url, destino: enlace.destino, texto: enlace.texto };
  }

  return respuesta;
}

module.exports = { altaConCarton, reemitirPdf, permiteWhatsapp };
