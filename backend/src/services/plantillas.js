'use strict';
/**
 * Plantillas de los mensajes de WhatsApp.
 * Centralizadas aqui para que el texto legal/comercial se edite en un solo lugar.
 */

const AVISO_RENDICION =
  'Una vez que el vendedor rinda cuentas en un plazo de 24 hs se habilita el carton. ' +
  'Si no recibe mensaje de habilitado, contacte al vendedor.';

const lista = (numeros) => numeros.join(' - ');

/**
 * Mensaje enviado al crear el carton (plantilla del chatbot de Baileys, hoy
 * desconectado). No informa el estado del carton: es informacion de cobranza
 * entre el vendedor y la administracion.
 */
function cartonNuevo({ sorteo, jugador, vendedor, carton, numeros }) {
  return [
    '*DGG GESTIÓN - TU CARTON*',
    '',
    `*Sorteo N°:* ${sorteo.numero} - ${sorteo.nombre}`,
    `*Carton N°:* ${carton.codigo}`,
    '',
    '*Jugador*',
    `${jugador.apellido}, ${jugador.nombre}`,
    `DNI: ${jugador.dni}`,
    '',
    '*Tus numeros*',
    lista(numeros),
    '',
    '*Vendedor*',
    `${vendedor.apellido}, ${vendedor.nombre}`,
    `Celular: ${vendedor.telefono}`,
    '',
    'Mucha suerte!',
  ].join('\n');
}

/**
 * Mensaje enviado cuando el administrador habilita el carton.
 *
 * Incluye la URL del sistema y las credenciales de acceso. Sobre la clave:
 * solo se conoce la inicial (el DNI), porque lo que se guarda es un hash. Si el
 * jugador ya la cambio, el mensaje no inventa ninguna clave: le recuerda que
 * use la suya.
 */
function cartonHabilitado({ sorteo, carton, jugador, url, usuario, claveInicial = null }) {
  return [
    '*DGG GESTIÓN - CARTON HABILITADO*',
    '',
    `Hola ${jugador.nombre}, tu carton *${carton.codigo}* del sorteo N° ${sorteo.numero} ` +
      'fue *HABILITADO*. El vendedor ya rindio cuentas.',
    '',
    '*Para seguir el sorteo ingresa aca:*',
    url,
    '',
    `*Usuario:* ${usuario}`,
    claveInicial
      ? `*Clave:* ${claveInicial}  (es tu DNI, cambiala al ingresar)`
      : '*Clave:* la que ya definiste al ingresar por primera vez.',
    '',
    'Desde tu cuenta podes ver tu carton con los numeros que van saliendo.',
    'Mucha suerte!',
  ].join('\n');
}

/** Aviso masivo: se completo la venta y arranca el sorteo. */
function sorteoIniciado({ sorteo, jugador }) {
  return [
    '*DGG GESTIÓN - COMIENZA EL SORTEO*',
    '',
    `Hola ${jugador.nombre}: se completo la venta de los ${sorteo.cartones_objetivo} cartones ` +
      `del sorteo N° ${sorteo.numero} - ${sorteo.nombre}.`,
    '',
    'A partir de hoy se cargan los numeros dia por dia. ' +
      'Podes ver tu carton y los numeros que van saliendo desde tu cuenta.',
  ].join('\n');
}

/**
 * Aviso diario con los numeros cargados.
 * `loteria` y `numeroSorteo` identifican de donde salieron los numeros
 * (por ejemplo: Nocturna, sorteo 9876).
 */
function numerosDelDia({ sorteo, fecha, numeros, jugador, loteria, numeroSorteo }) {
  return [
    '*DGG GESTIÓN - NUMEROS DEL DIA*',
    '',
    `*Sorteo N°:* ${sorteo.numero}`,
    `*Fecha:* ${fecha}`,
    ...(loteria ? [`*Quiniela:* ${loteria}`] : []),
    ...(numeroSorteo ? [`*Sorteo N°:* ${numeroSorteo}`] : []),
    '',
    `*Numeros:* ${lista(numeros)}`,
    '',
    `Hola ${jugador.nombre}, revisa tu carton en el sistema para ver tu progreso.`,
  ].join('\n');
}

/**
 * Aviso de carton ganador.
 * `totalGanadores` es la cantidad de cartones ganadores del sorteo: si hay mas
 * de uno, el premio se reparte y el jugador tiene que saberlo.
 */
function ganador({ sorteo, carton, jugador, fecha, totalGanadores = 1, vendedor = null }) {
  const otros = Math.max(0, Number(totalGanadores) - 1);

  return [
    '*DGG GESTIÓN - FELICITACIONES, GANASTE!*',
    '',
    `${jugador.apellido}, ${jugador.nombre}: tu carton *${carton.codigo}* ` +
      `completo todos sus numeros en el sorteo N° ${sorteo.numero}.`,
    `*Fecha del sorteo:* ${fecha}`,
    '',
    totalGanadores === 1
      ? '*Sos el UNICO ganador de este sorteo.*'
      : `*Ganadores en total:* ${totalGanadores} cartones` +
        (otros > 0 ? ` (el tuyo y ${otros} mas)` : ''),
    ...(vendedor
      ? ['', `*Tu vendedor:* ${vendedor.apellido}, ${vendedor.nombre} - ${vendedor.telefono}`]
      : []),
    '',
    'En breve el vendedor se comunica con vos para la entrega del premio.',
  ].join('\n');
}

module.exports = {
  AVISO_RENDICION, cartonNuevo, cartonHabilitado, sorteoIniciado, numerosDelDia, ganador,
};
