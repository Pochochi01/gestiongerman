'use strict';
/**
 * Orquesta que se notifica y a quien. Usa plantillas.js para el texto y
 * whatsapp.service.js para el transporte. Los envios son best-effort: un
 * fallo de WhatsApp no revierte la operacion de negocio que los origino.
 */
const whatsapp = require('./whatsapp.service');
const plantillas = require('./plantillas');
const jugadorModel = require('../models/jugador.model');
const vendedorModel = require('../models/vendedor.model');
const cartonModel = require('../models/carton.model');
const usuarioModel = require('../models/usuario.model');
const env = require('../config/env');
const { aFechaISO } = require('../utils/helpers');
const logger = require('../utils/logger');

/** Carton recien vendido -> se envia al jugador con estado IMPAGO. */
async function notificarCartonNuevo({ sorteo, jugador, vendedor, carton, numeros }) {
  return whatsapp.enviar({
    tipo: 'CARTON_NUEVO',
    destino: jugador.whatsapp,
    jugadorId: jugador.id,
    cartonId: carton.id,
    contenido: plantillas.cartonNuevo({ sorteo, jugador, vendedor, carton, numeros }),
  });
}

/**
 * Cartón habilitado -> se le manda la URL del sistema y sus credenciales.
 *
 * La clave inicial es el DNI. Si el jugador ya la cambió
 * (`debe_cambiar_password = 0`) no se envía ninguna clave: sólo se le recuerda
 * que use la suya, porque en la base hay un hash y no se puede recuperar.
 */
async function notificarCartonHabilitado({ sorteo, carton, jugador }) {
  const usuario = await usuarioModel.buscarPorId(jugador.usuario_id);
  const debeCambiar = usuario ? !!usuario.debe_cambiar_password : true;

  return whatsapp.enviar({
    tipo: 'CARTON_HABILITADO',
    destino: jugador.whatsapp,
    jugadorId: jugador.id,
    cartonId: carton.id,
    contenido: plantillas.cartonHabilitado({
      sorteo,
      carton,
      jugador,
      url: env.appUrl,
      usuario: usuario ? usuario.username : jugador.dni,
      claveInicial: debeCambiar ? jugador.dni : null,
    }),
  });
}

/** Aviso masivo al iniciar el sorteo (paso 6 del flujo de datos). */
async function notificarInicioSorteo(sorteo) {
  const jugadores = await jugadorModel.conCartonEnSorteo(sorteo.id);
  let enviados = 0;
  for (const jugador of jugadores) {
    const r = await whatsapp.enviar({
      tipo: 'SORTEO_INICIADO',
      destino: jugador.whatsapp,
      jugadorId: jugador.id,
      contenido: plantillas.sorteoIniciado({ sorteo, jugador }),
    });
    if (r.enviado) enviados += 1;
  }
  logger.info({ sorteo: sorteo.numero, jugadores: jugadores.length, enviados }, 'Aviso de inicio de sorteo');
  return { destinatarios: jugadores.length, enviados };
}

/** Aviso diario con los numeros cargados por el administrador. */
async function notificarNumerosDelDia({ sorteo, fecha, numeros, loteria = null, numeroSorteo = null }) {
  const jugadores = await jugadorModel.conCartonEnSorteo(sorteo.id);
  let enviados = 0;
  for (const jugador of jugadores) {
    const r = await whatsapp.enviar({
      tipo: 'NUMEROS_DIA',
      destino: jugador.whatsapp,
      jugadorId: jugador.id,
      contenido: plantillas.numerosDelDia({ sorteo, fecha, numeros, jugador, loteria, numeroSorteo }),
    });
    if (r.enviado) enviados += 1;
  }
  return { destinatarios: jugadores.length, enviados };
}

/** Aviso a un ganador, informando cuántos ganadores hubo en total. */
async function notificarGanador({ sorteo, carton, jugador, fecha, totalGanadores = 1, vendedor = null }) {
  return whatsapp.enviar({
    tipo: 'GANADOR',
    destino: jugador.whatsapp,
    jugadorId: jugador.id,
    cartonId: carton.id,
    contenido: plantillas.ganador({ sorteo, carton, jugador, fecha, totalGanadores, vendedor }),
  });
}

/**
 * Avisa a TODOS los ganadores de un sorteo. Cada mensaje incluye la cantidad
 * total de ganadores, que recién se conoce cuando están todos detectados.
 *
 * Lo usa el endpoint `POST /api/sorteos/:id/notificar-ganadores` y también el
 * flujo automático al cerrarse el sorteo.
 */
async function notificarGanadoresDeSorteo(sorteo, fecha = null) {
  const ganadores = await cartonModel.ganadoresDe(sorteo.id);
  const total = ganadores.length;
  const resultados = [];

  for (const carton of ganadores) {
    const jugador = await jugadorModel.buscarPorId(carton.jugador_id);
    const vendedor = await vendedorModel.buscarPorId(carton.vendedor_id);
    const r = await notificarGanador({
      sorteo,
      carton,
      jugador,
      vendedor,
      fecha: fecha || carton.gano_en || aFechaISO(new Date()),
      totalGanadores: total,
    });
    resultados.push({
      carton: carton.codigo,
      jugador: `${jugador.apellido}, ${jugador.nombre}`,
      destino: jugador.whatsapp,
      enviado: r.enviado,
      mensaje_id: r.mensajeId,
    });
  }

  logger.info({ sorteo: sorteo.numero, total }, 'Aviso a los ganadores del sorteo');
  return { total_ganadores: total, enviados: resultados.filter((r) => r.enviado).length, detalle: resultados };
}

module.exports = {
  notificarCartonNuevo, notificarCartonHabilitado, notificarInicioSorteo,
  notificarNumerosDelDia, notificarGanador, notificarGanadoresDeSorteo,
};
