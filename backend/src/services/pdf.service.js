'use strict';
/**
 * Generación del PDF del cartón.
 *
 * Replica el cartón que muestra el sistema: grilla de 3 filas x 10 columnas,
 * casilleros vacíos en gris y números sobre un tinte del color del sorteo.
 * Incluye los datos del jugador, los del vendedor y un QR de validación.
 *
 * Todos los cartones de un mismo sorteo salen del mismo color
 * (`sorteos.color_carton`), así que el color cambia solo al cambiar de sorteo.
 *
 * El archivo queda en UPLOAD_DIR/cartones y la referencia se guarda en
 * `cartones.pdf_archivo`.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const env = require('../config/env');
const logger = require('../utils/logger');
const { CARTON_FILAS, CARTON_COLUMNAS, CARTON_CELDAS } = require('../utils/helpers');
const { textoSobre, aclarar, oscurecer, COLOR_POR_DEFECTO } = require('../utils/colores');

const DIR_PDF = path.join(env.uploads.dir, 'cartones');
fs.mkdirSync(DIR_PDF, { recursive: true });

// --- Medidas de la hoja (A4 en puntos) ---
const MARGEN = 40;
const GRIS_VACIO = '#94a3b8'; // el mismo slate-400 que usa la pantalla
const TINTA = '#111111';
const TINTA_SUAVE = '#64748b';

/**
 * Leyenda del QR. El codigo lo escanea el VENDEDOR para verificar el carton
 * antes de entregarlo o de cobrar: no es una instruccion para el jugador.
 */
const TEXTO_QR =
  'Este codigo QR es de uso exclusivo del vendedor para validar el carton y evitar estafas.';

/** URL que se codifica en el QR: abre la pantalla pública de validación. */
const urlValidacion = (token) => `${env.appUrl}/validar/${token}`;

/**
 * URL pública del PDF, la que viaja en el mensaje de WhatsApp.
 *
 * Va por el token y no por el nombre del archivo: así el enlace no cambia si el
 * PDF se reemite, y no hace falta exponer el directorio de uploads.
 */
const urlPdf = (token) => `${env.appUrl}/api/validar/${token}/pdf`;

/**
 * Dibuja la grilla del cartón, con el estilo del sistema.
 * @param {PDFDocument} doc
 * @param {{numero:number|null}[]} grilla  30 casilleros en orden de lectura
 */
function dibujarCarton(doc, grilla, { x, y, ancho, color }) {
  const gap = 2.5;
  const lado = (ancho - gap * (CARTON_COLUMNAS + 1)) / CARTON_COLUMNAS;
  const alto = lado * CARTON_FILAS + gap * (CARTON_FILAS + 1);

  // Marco
  doc.save();
  doc.roundedRect(x, y, ancho, alto, 6).fillAndStroke('#f1f5f9', oscurecer(color, 0.1));
  doc.restore();

  const tinte = aclarar(color, 0.82);
  const borde = oscurecer(color, 0.2);

  grilla.forEach((celda, i) => {
    const fila = Math.floor(i / CARTON_COLUMNAS);
    const col = i % CARTON_COLUMNAS;
    const cx = x + gap + col * (lado + gap);
    const cy = y + gap + fila * (lado + gap);

    doc.save();
    if (celda.numero === null) {
      // Vacío: gris medio, como en la pantalla.
      doc.roundedRect(cx, cy, lado, lado, 2).fill(GRIS_VACIO);
    } else {
      doc.roundedRect(cx, cy, lado, lado, 2).fillAndStroke(tinte, borde);
      doc
        .fillColor(TINTA)
        .font('Helvetica-Bold')
        .fontSize(lado * 0.46)
        .text(String(celda.numero).padStart(2, '0'), cx, cy + lado * 0.26, {
          width: lado,
          align: 'center',
        });
    }
    doc.restore();
  });

  return alto;
}

/** Fila de "etiqueta: valor". */
function dato(doc, etiqueta, valor, { x, y, ancho }) {
  doc.font('Helvetica').fontSize(7.5).fillColor(TINTA_SUAVE).text(etiqueta.toUpperCase(), x, y, { width: ancho });
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TINTA).text(String(valor ?? '-'), x, y + 10, { width: ancho });
  return 26;
}

/**
 * Genera el PDF de un cartón y devuelve el nombre del archivo.
 *
 * @param {object} datos
 *   - carton: fila de cartones (con `grilla` o `numeros`)
 *   - sorteo, jugador, vendedor
 * @returns {Promise<{archivo:string, ruta:string, url:string, urlValidacion:string}>}
 */
async function generarCartonPdf({ carton, sorteo, jugador, vendedor, grilla, comprimir = true }) {
  const color = sorteo.color_carton || COLOR_POR_DEFECTO;
  const archivo = `carton-${carton.codigo}-${Date.now()}.pdf`;
  const ruta = path.join(DIR_PDF, archivo);

  // El QR se genera como PNG en memoria y se incrusta.
  const qrPng = await QRCode.toBuffer(urlValidacion(carton.token_validacion), {
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
  });

  await new Promise((resolve, reject) => {
    // `comprimir: false` deja el contenido legible en el archivo: lo usa la
    // prueba automática para verificar textos y colores sin un renderizador.
    const doc = new PDFDocument({ size: 'A4', margin: MARGEN, compress: comprimir, info: {
      Title: `Carton ${carton.codigo}`,
      Author: 'Bingo DGG',
      Subject: `Sorteo N° ${sorteo.numero} - ${sorteo.nombre}`,
    } });

    const stream = fs.createWriteStream(ruta);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    const ancho = doc.page.width - MARGEN * 2;
    let y = MARGEN;

    // ---------- Encabezado con el color del sorteo ----------
    const altoCabecera = 58;
    doc.roundedRect(MARGEN, y, ancho, altoCabecera, 8).fill(color);
    const tintaCabecera = textoSobre(color);

    doc
      .fillColor(tintaCabecera)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text('BINGO DGG', MARGEN + 16, y + 12);
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .text(`Sorteo N° ${sorteo.numero} — ${sorteo.nombre}`, MARGEN + 16, y + 36);

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(carton.codigo, MARGEN, y + 20, { width: ancho - 16, align: 'right' });

    y += altoCabecera + 18;

    // ---------- Datos del jugador y del vendedor ----------
    const colAncho = (ancho - 20) / 2;

    doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA).text('JUGADOR', MARGEN, y);
    doc.font('Helvetica-Bold').fontSize(11).text('VENDEDOR', MARGEN + colAncho + 20, y);
    doc.moveTo(MARGEN, y + 15).lineTo(MARGEN + ancho, y + 15).strokeColor('#e2e8f0').stroke();
    y += 24;

    const yDatos = y;
    let yIzq = y;
    yIzq += dato(doc, 'Apellido y nombre', `${jugador.apellido}, ${jugador.nombre}`, { x: MARGEN, y: yIzq, ancho: colAncho });
    yIzq += dato(doc, 'DNI', jugador.dni, { x: MARGEN, y: yIzq, ancho: colAncho });
    yIzq += dato(doc, 'WhatsApp', jugador.whatsapp, { x: MARGEN, y: yIzq, ancho: colAncho });

    const xDer = MARGEN + colAncho + 20;
    let yDer = yDatos;
    yDer += dato(doc, 'Apellido y nombre', `${vendedor.apellido}, ${vendedor.nombre}`, { x: xDer, y: yDer, ancho: colAncho });
    yDer += dato(doc, 'Celular', vendedor.telefono, { x: xDer, y: yDer, ancho: colAncho });
    yDer += dato(doc, 'DNI', vendedor.dni, { x: xDer, y: yDer, ancho: colAncho });

    y = Math.max(yIzq, yDer) + 10;

    // ---------- Fecha de emisión ----------
    // El estado del cartón (IMPAGO / RENDIDO / HABILITADO) NO se imprime: el
    // PDF es el comprobante del cartón, no de la cobranza. El estado vive en
    // el sistema y lo consulta el vendedor escaneando el QR.
    doc
      .fillColor(TINTA_SUAVE)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`Emitido el ${new Date().toLocaleString('es-AR')}`, MARGEN, y, { width: ancho });

    y += 20;

    // ---------- El cartón ----------
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA).text('TU CARTÓN', MARGEN, y);
    y += 16;
    const altoGrilla = dibujarCarton(doc, grilla, { x: MARGEN, y, ancho, color });
    y += altoGrilla + 8;

    // Referencia de colores
    const refY = y;
    const chip = (cx, fill, borde, texto) => {
      doc.save();
      doc.roundedRect(cx, refY, 9, 9, 2).fillAndStroke(fill, borde || fill);
      doc.restore();
      doc.font('Helvetica').fontSize(8).fillColor(TINTA_SUAVE).text(texto, cx + 13, refY + 1);
    };
    chip(MARGEN, aclarar(color, 0.82), oscurecer(color, 0.2), 'Tu número');
    chip(MARGEN + 95, GRIS_VACIO, null, 'Casillero vacío');
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(TINTA_SUAVE)
      .text(
        `Los ${grilla.filter((c) => c.numero !== null).length} números del cartón`,
        MARGEN + 210,
        refY + 1
      );
    y += 22;

    // ---------- QR de validación ----------
    const ladoQr = 108;
    const xQr = doc.page.width - MARGEN - ladoQr;

    doc.roundedRect(MARGEN, y, ancho, ladoQr + 20, 8).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.image(qrPng, xQr - 6, y + 10, { fit: [ladoQr, ladoQr] });

    // Sólo el QR y para qué sirve. La URL no se imprime: el código ya la
    // lleva, y escrita invitaría a tipearla a mano.
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(TINTA)
      .text(TEXTO_QR, MARGEN + 16, y + 38, { width: ancho - ladoQr - 40 });

    // ---------- Pie ----------
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(TINTA_SUAVE)
      .text(
        `Bingo DGG · Sorteo N° ${sorteo.numero} · Cartón ${carton.codigo} · ` +
          `${grilla.filter((c) => c.numero !== null).length} números · ` +
          `rango ${sorteo.rango_min} a ${sorteo.rango_max}`,
        MARGEN,
        doc.page.height - MARGEN - 10,
        { width: ancho, align: 'center' }
      );

    doc.end();
  });

  logger.info({ carton: carton.codigo, archivo }, 'PDF del carton generado');

  return {
    archivo,
    ruta,
    // Ruta local, servida por express.static (la usa el panel del admin)
    url: `/uploads/cartones/${archivo}`,
    // Enlace público por token: el que viaja en el mensaje de WhatsApp
    urlPublica: urlPdf(carton.token_validacion),
    urlValidacion: urlValidacion(carton.token_validacion),
  };
}

/** Arma los 30 casilleros a partir de la disposición guardada. */
function grillaDesdeDisposicion(disposicion = []) {
  const porCelda = new Map();
  disposicion.forEach((d, i) => porCelda.set(Number(d.celda) || i + 1, Number(d.numero)));
  return Array.from({ length: CARTON_CELDAS }, (_, i) => ({
    celda: i + 1,
    numero: porCelda.get(i + 1) ?? null,
  }));
}

module.exports = {
  generarCartonPdf, grillaDesdeDisposicion, urlValidacion, urlPdf, TEXTO_QR, DIR_PDF,
};
