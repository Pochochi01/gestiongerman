'use strict';

/** Envuelve un controlador async para que sus rechazos lleguen a next(). */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Respuesta uniforme de exito. */
const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });

/**
 * Normaliza un telefono argentino a formato E.164 sin '+', apto para Baileys.
 * Acepta: 3764123456, 03764-123456, +54 9 3764 123456, 549376412345
 */
function normalizarWhatsapp(input) {
  let n = String(input || '').replace(/\D/g, '');
  if (!n) return null;
  if (n.startsWith('00')) n = n.slice(2);
  if (!n.startsWith('54')) {
    n = n.replace(/^0/, '');            // quita 0 de larga distancia
    n = n.replace(/^(\d{2,4})15/, '$1'); // quita el 15 posterior al codigo de area
    n = `549${n}`;
  } else if (!n.startsWith('549')) {
    n = `549${n.slice(2)}`;             // agrega el 9 de movil
  }
  return n.length >= 12 && n.length <= 15 ? n : null;
}

/** Codigo legible del carton: S0001-C000123 */
const codigoCarton = (sorteoNumero, cartonId) =>
  `S${String(sorteoNumero).padStart(4, '0')}-C${String(cartonId).padStart(6, '0')}`;

/** YYYY-MM-DD de una fecha (Date o string). */
function aFechaISO(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Numeros unicos, enteros y dentro del rango; lanza si algo no cumple. */
function validarNumeros(numeros, { min, max, cantidad }) {
  const lista = (numeros || []).map(Number);
  if (lista.length !== cantidad) return `Se esperaban ${cantidad} numeros`;
  if (lista.some((n) => !Number.isInteger(n))) return 'Todos los valores deben ser enteros';
  if (lista.some((n) => n < min || n > max)) return `Los numeros deben estar entre ${min} y ${max}`;
  if (new Set(lista).size !== lista.length) return 'No se permiten numeros repetidos';
  return null;
}

/** Nombre de la lotería de la que se toman los números del sorteo diario. */
const LOTERIA_POR_DEFECTO = 'Nocturna';

/** Cifras máximas que admite un número cargado desde la quiniela. */
const CIFRAS_MAX_CARGA = 4;

/**
 * Convierte un valor de la quiniela (hasta 4 cifras) en el número de bingo.
 *
 * El administrador carga el resultado tal como sale —1234, 0078, 7— y el
 * sistema valida los cartones con las DOS ÚLTIMAS cifras: 1234 -> 34,
 * 0078 -> 78, 7 -> 7.
 *
 * @returns {{valor:number, numero:number}|null} null si no es un valor válido.
 */
function dosUltimasCifras(entrada) {
  const texto = String(entrada ?? '').trim();
  if (!/^\d{1,4}$/.test(texto)) return null;
  const valor = Number(texto);
  return { valor, numero: valor % 100 };
}

/**
 * Parsea el campo de texto del formulario: acepta números separados por
 * espacios, comas, punto y coma o saltos de línea.
 * Devuelve los tokens tal como se escribieron, sin validar.
 */
function separarNumeros(texto) {
  return String(texto ?? '')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Mezcla una copia del arreglo (Fisher-Yates). */
function mezclar(arreglo) {
  const a = [...arreglo];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Grilla del cartón, al estilo de los bingos tradicionales. */
const CARTON_FILAS = 3;
const CARTON_COLUMNAS = 10;
const CARTON_CELDAS = CARTON_FILAS * CARTON_COLUMNAS;

/**
 * Reparte los números del cartón en la grilla de 3 x 10.
 *
 * - Las celdas ocupadas se sortean al azar; el resto queda vacío.
 * - Los números quedan en orden ascendente leyendo la grilla de izquierda a
 *   derecha y de arriba hacia abajo.
 * - El reparto entre filas es lo más parejo posible (con 10 números: 4/3/3, y
 *   la fila que lleva una de más se elige al azar), como en un cartón real.
 *
 * La disposición se calcula UNA sola vez, al crear el cartón, y se guarda en
 * `carton_numeros.celda`: si se sorteara en cada consulta, el cartón del
 * jugador cambiaría de forma cada vez que abre la pantalla.
 *
 * @returns {{numero:number, celda:number}[]} celda va de 1 a 30.
 */
function generarDisposicion(numeros, { filas = CARTON_FILAS, columnas = CARTON_COLUMNAS } = {}) {
  const ordenados = [...(numeros || [])].map(Number).sort((a, b) => a - b);
  const total = filas * columnas;
  if (ordenados.length > total) {
    throw new Error(`El cartón admite hasta ${total} números y se recibieron ${ordenados.length}`);
  }

  // Cuántos números caen en cada fila: base parejo + el resto repartido al azar.
  const base = Math.floor(ordenados.length / filas);
  const resto = ordenados.length % filas;
  const porFila = new Array(filas).fill(base);
  mezclar([...Array(filas).keys()])
    .slice(0, resto)
    .forEach((f) => { porFila[f] += 1; });

  // Dentro de cada fila se eligen columnas al azar y se ordenan: así la
  // lectura global (fila 1 -> fila 3, izquierda a derecha) queda ascendente.
  const celdas = [];
  for (let f = 0; f < filas; f += 1) {
    mezclar([...Array(columnas).keys()])
      .slice(0, porFila[f])
      .sort((a, b) => a - b)
      .forEach((c) => celdas.push(f * columnas + c + 1));
  }

  return ordenados.map((numero, i) => ({ numero, celda: celdas[i] }));
}

module.exports = {
  asyncHandler, ok, normalizarWhatsapp, codigoCarton, aFechaISO, validarNumeros,
  mezclar, generarDisposicion, CARTON_FILAS, CARTON_COLUMNAS, CARTON_CELDAS,
  dosUltimasCifras, separarNumeros, LOTERIA_POR_DEFECTO, CIFRAS_MAX_CARGA,
};
