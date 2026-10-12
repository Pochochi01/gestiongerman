'use strict';
/**
 * Enlace `wa.me` para que el VENDEDOR mande el cartón desde su propio WhatsApp.
 *
 * Reemplaza al chatbot: en lugar de que el servidor envíe el mensaje con
 * Baileys, el backend devuelve una URL con el texto ya armado y el frontend la
 * abre. Ventajas: el mensaje sale del número del vendedor (el jugador le
 * contesta a él), no hace falta mantener una sesión vinculada y WhatsApp no
 * puede bloquear al sistema por volumen.
 *
 * Dos límites del esquema `wa.me`, que conviene tener presentes:
 *
 *  1. **No adjunta archivos.** Sólo admite texto. El PDF viaja como un
 *     *enlace* dentro del mensaje; WhatsApp le muestra la vista previa y el
 *     jugador lo abre o lo descarga con un toque.
 *  2. **Requiere la acción del vendedor.** Si no toca "Enviar", el mensaje no
 *     sale. Por eso queda registrado en `mensajes_whatsapp` como PENDIENTE: lo
 *     generó el sistema, pero no se puede confirmar la entrega.
 *
 * `wa.me` abre la app en el teléfono y WhatsApp Web en la computadora, así que
 * sirve para los dos casos sin detectar el dispositivo.
 */
const BASE = 'https://wa.me';

/**
 * Mensaje que el vendedor le manda al jugador.
 *
 * NO incluye el estado del cartón (impago / rendido / habilitado): es
 * información de cobranza entre el vendedor y la administración, no algo que
 * el jugador tenga que leer en el mensaje de bienvenida.
 *
 * @param {string} urlPdf  enlace absoluto al PDF del cartón
 */
function textoCarton({ sorteo, jugador, vendedor, carton, numeros, urlPdf }) {
  const lista = (numeros || []).map((n) => String(n).padStart(2, '0')).join(' - ');

  return [
    '*BINGO DGG - TU CARTÓN*',
    '',
    `*Sorteo N°:* ${sorteo.numero} - ${sorteo.nombre}`,
    `*Cartón N°:* ${carton.codigo}`,
    '',
    '*Jugador*',
    `${jugador.apellido}, ${jugador.nombre}`,
    `DNI: ${jugador.dni}`,
    `Teléfono: ${jugador.whatsapp}`,
    '',
    '*Tus números*',
    lista,
    '',
    '*Vendedor*',
    `${vendedor.apellido}, ${vendedor.nombre}`,
    `Celular: ${vendedor.telefono}`,
    ...(urlPdf ? ['', '*Descargá tu cartón en PDF*', urlPdf] : []),
    '',
    '¡Mucha suerte!',
  ].join('\n');
}

/**
 * Arma el enlace para abrir WhatsApp con el mensaje precargado.
 *
 * @returns {{url:string, destino:string, texto:string}}
 */
function enlaceCarton({ sorteo, jugador, vendedor, carton, numeros, urlPdf }) {
  const texto = textoCarton({ sorteo, jugador, vendedor, carton, numeros, urlPdf });
  const destino = String(jugador.whatsapp || '').replace(/\D/g, '');

  return {
    destino,
    texto,
    // https://wa.me/<telefono>?text=<mensaje>
    url: `${BASE}/${destino}?text=${encodeURIComponent(texto)}`,
  };
}

module.exports = { enlaceCarton, textoCarton };
