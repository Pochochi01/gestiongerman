'use strict';
/**
 * Color de los cartones por sorteo.
 *
 * Cada sorteo tiene UN color y todos sus cartones se dibujan con ese color.
 * El color se asigna al crear el sorteo (`sorteos.color_carton`) tomando un
 * slot de una paleta categórica fija, indexado por el número de sorteo: así
 * cambia solo al pasar de un sorteo al siguiente y nunca queda al azar.
 *
 * La paleta es la de identidad (categórica), en orden fijo. Está validada:
 * dentro de la banda de luminosidad, con separación para daltonismo (peor par
 * adyacente ΔE 9.1 en protanopía, sobre el objetivo de 8) y sin colores
 * grisáceos. Tres de los ocho slots quedan bajo 3:1 de contraste sobre blanco,
 * así que el color NUNCA lleva significado solo: el PDF imprime siempre el
 * número y el nombre del sorteo, y el texto sobre el color se elige por
 * luminancia (ver `textoSobre`).
 *
 * Con más de ocho sorteos la paleta se recicla. Es deliberado: el color
 * distingue sorteos cercanos en el tiempo, no es un identificador.
 */

/** Paleta categórica en orden fijo. No reordenar: el orden es la garantía CVD. */
const PALETA = [
  '#2a78d6', // azul
  '#eb6834', // naranja
  '#1baf7a', // aqua
  '#eda100', // amarillo
  '#e87ba4', // magenta
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // rojo
];

const COLOR_POR_DEFECTO = PALETA[0];

/** Color que le corresponde al sorteo `numero` (1-based). */
function colorDeSorteo(numero) {
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1) return COLOR_POR_DEFECTO;
  return PALETA[(n - 1) % PALETA.length];
}

/** '#rrggbb' -> { r, g, b } en 0..255. */
function aRgb(hex) {
  const limpio = String(hex || COLOR_POR_DEFECTO).replace('#', '');
  const completo = limpio.length === 3 ? limpio.replace(/./g, (c) => c + c) : limpio;
  return {
    r: parseInt(completo.slice(0, 2), 16),
    g: parseInt(completo.slice(2, 4), 16),
    b: parseInt(completo.slice(4, 6), 16),
  };
}

const aHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** Luminancia relativa (WCAG). */
function luminancia(hex) {
  const { r, g, b } = aRgb(hex);
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Color de texto legible sobre `fondo`: negro o blanco, el que dé más
 * contraste. Evita el caso de texto blanco sobre amarillo.
 */
function textoSobre(fondo) {
  const l = luminancia(fondo);
  const contrasteBlanco = 1.05 / (l + 0.05);
  const contrasteNegro = (l + 0.05) / 0.05;
  return contrasteNegro >= contrasteBlanco ? '#111111' : '#ffffff';
}

/**
 * Mezcla el color con blanco. `factor` 0 = el color puro, 1 = blanco.
 * Se usa para el fondo de los casilleros: un tinte suave sobre el que el
 * número se lee con contraste de sobra.
 */
function aclarar(hex, factor = 0.85) {
  const { r, g, b } = aRgb(hex);
  const f = Math.max(0, Math.min(1, factor));
  return aHex({
    r: r + (255 - r) * f,
    g: g + (255 - g) * f,
    b: b + (255 - b) * f,
  });
}

/** Oscurece el color (para bordes y acentos). */
function oscurecer(hex, factor = 0.25) {
  const { r, g, b } = aRgb(hex);
  const f = Math.max(0, Math.min(1, factor));
  return aHex({ r: r * (1 - f), g: g * (1 - f), b: b * (1 - f) });
}

module.exports = {
  PALETA, COLOR_POR_DEFECTO,
  colorDeSorteo, textoSobre, aclarar, oscurecer, luminancia, aRgb, aHex,
};
