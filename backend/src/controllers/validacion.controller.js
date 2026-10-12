'use strict';
/**
 * Validación pública de un cartón a partir del token del QR.
 *
 * Es la única ruta sin autenticación además del login: el QR del PDF lo escanea
 * cualquiera con la cámara del teléfono, sin cuenta en el sistema.
 *
 * Por eso devuelve lo mínimo para verificar que el cartón es auténtico y ver su
 * estado: NO incluye el DNI ni el WhatsApp del jugador. El acceso está acotado
 * por el token, que es aleatorio de 128 bits y no se puede adivinar.
 */
const fs = require('fs');
const path = require('path');

const cartonModel = require('../models/carton.model');
const sorteoModel = require('../models/sorteo.model');
const jugadorModel = require('../models/jugador.model');
const vendedorModel = require('../models/vendedor.model');
const pdfService = require('../services/pdf.service');
const logger = require('../utils/logger');
const { asyncHandler, ok, CARTON_FILAS, CARTON_COLUMNAS, CARTON_CELDAS } = require('../utils/helpers');
const jornadaModel = require('../models/jornada.model');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/validar/:token  (publico)
 *
 * Responde 404 si el token no existe, para no filtrar si un token es valido
 * pero de otro cartón.
 */
const validar = asyncHandler(async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!/^[0-9a-f]{32}$/i.test(token)) throw ApiError.notFound('Carton no encontrado');

  const carton = await cartonModel.porToken(token);
  if (!carton) throw ApiError.notFound('Carton no encontrado');

  // Números que ya salieron, para marcar la grilla.
  const salidos = new Set(await jornadaModel.numerosDelSorteo(carton.sorteo_id));

  const porCelda = new Map();
  carton.disposicion.forEach((d, i) => porCelda.set(d.celda || i + 1, d.numero));
  const grilla = Array.from({ length: CARTON_CELDAS }, (_, i) => {
    const numero = porCelda.get(i + 1) ?? null;
    return {
      celda: i + 1,
      numero,
      salio: numero !== null && salidos.has(numero),
    };
  });

  return ok(res, {
    valido: true,
    carton: {
      codigo: carton.codigo,
      estado: carton.estado,
      estado_pago: carton.estado_pago,
      habilitado: !!carton.habilitado,
      cantidad_numeros: carton.cantidad_numeros,
      aciertos: grilla.filter((c) => c.salio).length,
      emitido_en: carton.creado_en,
      habilitado_en: carton.habilitado_en,
    },
    // Nombre y apellido alcanzan para que el jugador se reconozca; el DNI no
    // se expone en una ruta publica.
    jugador: { apellido: carton.jugador_apellido, nombre: carton.jugador_nombre },
    vendedor: {
      apellido: carton.vendedor_apellido,
      nombre: carton.vendedor_nombre,
      telefono: carton.vendedor_telefono,
    },
    sorteo: {
      numero: carton.sorteo_numero,
      nombre: carton.sorteo_nombre,
      estado: carton.sorteo_estado,
      color: carton.color_carton,
      rango_min: carton.rango_min,
      rango_max: carton.rango_max,
    },
    grilla,
    filas: CARTON_FILAS,
    columnas: CARTON_COLUMNAS,
    numeros_salidos: [...salidos].sort((a, b) => a - b),
  });
});

/**
 * GET /api/validar/:token/pdf  (publico)
 *
 * Sirve el PDF del cartón. Es el enlace que viaja en el mensaje de WhatsApp:
 * `wa.me` no adjunta archivos, así que el PDF va como link.
 *
 * Acceso por capacidad: el token es aleatorio de 128 bits y no se puede
 * adivinar. El PDF contiene el DNI y el teléfono del jugador, los mismos datos
 * que ya lleva el mensaje de WhatsApp al que acompaña.
 *
 * Si el archivo no está en disco (se borró, o falló la emisión original) se
 * regenera al vuelo, para que el enlace no quede roto.
 */
const pdf = asyncHandler(async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!/^[0-9a-f]{32}$/i.test(token)) throw ApiError.notFound('Carton no encontrado');

  const referencia = await cartonModel.porToken(token);
  if (!referencia) throw ApiError.notFound('Carton no encontrado');

  let archivo = referencia.pdf_archivo;
  let ruta = archivo ? path.join(pdfService.DIR_PDF, archivo) : null;

  if (!ruta || !fs.existsSync(ruta)) {
    const carton = await cartonModel.buscarPorId(referencia.id);
    const [sorteo, jugador, vendedor, disposicion] = await Promise.all([
      sorteoModel.buscarPorId(carton.sorteo_id),
      jugadorModel.buscarPorId(carton.jugador_id),
      vendedorModel.buscarPorId(carton.vendedor_id),
      cartonModel.disposicionDe(carton.id),
    ]);
    const generado = await pdfService.generarCartonPdf({
      carton,
      sorteo,
      jugador,
      vendedor,
      grilla: pdfService.grillaDesdeDisposicion(disposicion),
    });
    await cartonModel.guardarPdf(carton.id, generado.archivo);
    archivo = generado.archivo;
    ruta = generado.ruta;
    logger.info({ carton: carton.codigo }, 'PDF regenerado al pedirlo por token');
  }

  res.type('application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="carton-${referencia.codigo}.pdf"`);
  return res.sendFile(ruta);
});

module.exports = { validar, pdf };
