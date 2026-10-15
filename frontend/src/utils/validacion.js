/**
 * Reglas de validacion de los formularios.
 *
 * Son funciones puras que devuelven el mensaje de error o `null`. Viven
 * separadas de las pantallas por dos razones: la misma regla se usa en varios
 * formularios (el DNI se pide al cargar un jugador y al crear un vendedor), y
 * un mensaje que hay que corregir se corrige en un solo lugar.
 *
 * El criterio de los mensajes: nombran el problema y como salir de el. Un
 * "Campo invalido" obliga al usuario a adivinar; "El DNI lleva 7 u 8 numeros,
 * sin puntos" le dice exactamente que escribir.
 *
 * Esto NO reemplaza la validacion del backend, que sigue siendo la unica
 * autoridad: lo de aca solo evita el viaje al servidor y da el aviso temprano.
 */

/** Cuenta solo los digitos de un texto. */
const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

export const texto = (etiqueta, { min = 2, max = 60 } = {}) => (valor) => {
  const v = String(valor ?? '').trim();
  if (!v) return `Falta ${etiqueta}.`;
  if (v.length < min) return `${etiqueta} necesita al menos ${min} letras.`;
  if (v.length > max) return `${etiqueta} no puede pasar de ${max} caracteres.`;
  return null;
};

export const dni = (valor) => {
  const v = String(valor ?? '').trim();
  if (!v) return 'Falta el DNI.';
  const d = soloDigitos(v);
  if (d.length !== v.length) return 'El DNI se escribe sin puntos ni espacios.';
  if (d.length < 7 || d.length > 8) return 'El DNI lleva 7 u 8 números.';
  return null;
};

export const whatsapp = (valor) => {
  const v = String(valor ?? '').trim();
  if (!v) return 'Falta el número de WhatsApp.';
  const d = soloDigitos(v);
  if (d.length < 10) return 'Faltan números: se necesita el código de área y el número, por ejemplo 3764 123456.';
  if (d.length > 15) return 'Ese número tiene demasiados dígitos.';
  return null;
};

export const telefono = (valor) => {
  const v = String(valor ?? '').trim();
  if (!v) return 'Falta el teléfono.';
  if (soloDigitos(v).length < 8) return 'Faltan números: se necesita el código de área y el número.';
  return null;
};

export const clave = (valor) => {
  const v = String(valor ?? '');
  if (!v) return 'Falta la clave.';
  if (v.length < 6) return 'La clave necesita al menos 6 caracteres.';
  return null;
};

/**
 * Aplica un conjunto de reglas a un formulario.
 *
 *   const errores = validar(form, { apellido: texto('el apellido'), dni });
 *
 * Devuelve un objeto con un mensaje por campo con error. Vacio si esta todo
 * bien, de modo que `Object.keys(errores).length === 0` es la condicion de
 * formulario valido.
 */
export function validar(valores, reglas) {
  const errores = {};
  for (const [campo, regla] of Object.entries(reglas)) {
    if (!regla) continue;
    const mensaje = regla(valores[campo], valores);
    if (mensaje) errores[campo] = mensaje;
  }
  return errores;
}

/**
 * Convierte el error que devuelve la API en algo legible.
 *
 * El backend responde `{ ok:false, error, detalles:[{campo,mensaje}] }`. Los
 * `detalles` se reparten por campo para mostrarlos junto al input que los
 * causo, en lugar de apilarlos todos en un cartel arriba.
 */
export function erroresDeApi(err) {
  const porCampo = {};
  if (Array.isArray(err?.detalles)) {
    for (const d of err.detalles) {
      if (d?.campo) porCampo[d.campo] = d.mensaje;
    }
  }
  const sobrantes = (err?.detalles || [])
    .filter((d) => !d?.campo)
    .map((d) => d.mensaje)
    .filter(Boolean);

  return {
    porCampo,
    general: [err?.message, ...sobrantes].filter(Boolean).join(' '),
  };
}
