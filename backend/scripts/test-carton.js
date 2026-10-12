'use strict';
/**
 * Prueba de la disposición gráfica del cartón (grilla 3 x 10).
 * No toca la base ni WhatsApp.
 *
 * Uso: npm run test:carton
 */
const {
  generarDisposicion, CARTON_FILAS, CARTON_COLUMNAS, CARTON_CELDAS,
} = require('../src/utils/helpers');

let fallos = 0;
const ok = (cond, texto) => {
  console.log(`  ${cond ? 'OK  ' : 'FALLA'} ${texto}`);
  if (!cond) fallos += 1;
};

/** Números distintos al azar dentro del rango. */
function numerosAlAzar(cantidad, min = 1, max = 90) {
  const elegidos = new Set();
  while (elegidos.size < cantidad) elegidos.add(min + Math.floor(Math.random() * (max - min + 1)));
  return [...elegidos];
}

function dibujar(disposicion) {
  for (let f = 0; f < CARTON_FILAS; f += 1) {
    let fila = '';
    for (let c = 1; c <= CARTON_COLUMNAS; c += 1) {
      const celda = f * CARTON_COLUMNAS + c;
      const hit = disposicion.find((d) => d.celda === celda);
      fila += hit ? String(hit.numero).padStart(3, ' ') : '  .';
    }
    console.log(`    |${fila} |`);
  }
}

console.log('\n=== Invariantes sobre 2000 cartones al azar ===');
const fallas = { celdasRepetidas: 0, fueraDeRango: 0, numerosDesordenados: 0, filasDesparejas: 0 };

for (let i = 0; i < 2000; i += 1) {
  const cantidad = 1 + Math.floor(Math.random() * 10); // el sorteo admite hasta 10
  const disposicion = generarDisposicion(numerosAlAzar(cantidad));
  const celdas = disposicion.map((d) => d.celda);
  const numeros = disposicion.map((d) => d.numero);

  if (new Set(celdas).size !== cantidad) fallas.celdasRepetidas += 1;
  if (celdas.some((c) => c < 1 || c > CARTON_CELDAS)) fallas.fueraDeRango += 1;
  // Orden de lectura ascendente: números y celdas crecen a la par.
  if (numeros.join() !== [...numeros].sort((a, b) => a - b).join()) fallas.numerosDesordenados += 1;
  if (celdas.join() !== [...celdas].sort((a, b) => a - b).join()) fallas.numerosDesordenados += 1;

  const porFila = new Array(CARTON_FILAS).fill(0);
  celdas.forEach((c) => { porFila[Math.floor((c - 1) / CARTON_COLUMNAS)] += 1; });
  if (Math.max(...porFila) - Math.min(...porFila) > 1) fallas.filasDesparejas += 1;
}

ok(fallas.celdasRepetidas === 0, 'ningún número comparte casillero');
ok(fallas.fueraDeRango === 0, `todos los casilleros caen entre 1 y ${CARTON_CELDAS}`);
ok(fallas.numerosDesordenados === 0, 'los números quedan en orden ascendente de lectura');
ok(fallas.filasDesparejas === 0, 'el reparto entre filas nunca difiere en más de uno');

console.log('\n=== La ubicación es realmente aleatoria ===');
const mismosNumeros = [2, 13, 23, 37, 41, 53, 65, 78, 84, 90];
const disposiciones = new Set(
  Array.from({ length: 50 }, () => generarDisposicion(mismosNumeros).map((d) => d.celda).join(','))
);
ok(disposiciones.size > 1, `con los mismos números salieron ${disposiciones.size} disposiciones distintas`);

console.log('\n=== Cartón de ejemplo ===');
const ejemplo = generarDisposicion(mismosNumeros);
dibujar(ejemplo);

console.log('\n=== Casos borde ===');
ok(generarDisposicion([]).length === 0, 'un cartón sin números no rompe');
const uno = generarDisposicion([7]);
ok(uno.length === 1 && uno[0].celda >= 1 && uno[0].celda <= CARTON_CELDAS, 'un cartón de un solo número');
const lleno = generarDisposicion(numerosAlAzar(CARTON_CELDAS));
ok(new Set(lleno.map((d) => d.celda)).size === CARTON_CELDAS, 'un cartón lleno usa los 30 casilleros');

let excedio = false;
try {
  generarDisposicion(numerosAlAzar(CARTON_CELDAS + 1, 1, 99));
} catch (_) {
  excedio = true;
}
ok(excedio, 'rechaza más números que casilleros');

console.log(`\n${fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBAS FALLARON`}\n`);
process.exit(fallos === 0 ? 0 : 1);
