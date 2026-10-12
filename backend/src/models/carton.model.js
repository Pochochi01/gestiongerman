'use strict';
/** Modelo de cartones y sus numeros. */
const { pool, query, queryOne } = require('../config/db');
const { generarDisposicion } = require('../utils/helpers');
const crypto = require('crypto');

const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

const SELECT_BASE = `
  SELECT c.id, c.codigo, c.token_validacion, c.pdf_archivo, c.pdf_generado_en,
         c.sorteo_id, c.jugador_id, c.vendedor_id,
         c.estado_id, ec.codigo AS estado,
         c.estado_pago_id, ep.codigo AS estado_pago, ep.nombre AS estado_pago_nombre,
         c.habilitado, c.cantidad_numeros, c.aciertos, c.creado_en, c.habilitado_en,
         s.numero AS sorteo_numero, s.nombre AS sorteo_nombre, s.color_carton,
         j.apellido AS jugador_apellido, j.nombre AS jugador_nombre, j.dni AS jugador_dni,
         j.whatsapp AS jugador_whatsapp,
         v.apellido AS vendedor_apellido, v.nombre AS vendedor_nombre, v.telefono AS vendedor_telefono
  FROM cartones c
  JOIN estados_carton ec ON ec.id = c.estado_id
  JOIN estados_pago   ep ON ep.id = c.estado_pago_id
  JOIN sorteos s   ON s.id = c.sorteo_id
  JOIN jugadores j ON j.id = c.jugador_id
  JOIN vendedores v ON v.id = c.vendedor_id`;

/** Inserta el carton y sus numeros dentro de la transaccion recibida. */
async function crear(datos, numeros, conn) {
  const [res] = await exec(
    conn,
    `INSERT INTO cartones
       (codigo, token_validacion, sorteo_id, jugador_id, vendedor_id, estado_id,
        estado_pago_id, habilitado, cantidad_numeros)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.codigo,
      // Token del QR: aleatorio, para que el cartón se pueda validar sin login.
      datos.token_validacion || crypto.randomBytes(16).toString('hex'),
      datos.sorteo_id,
      datos.jugador_id,
      datos.vendedor_id,
      datos.estado_id,
      datos.estado_pago_id,
      datos.habilitado ? 1 : 0,
      numeros.length,
    ]
  );
  const cartonId = res.insertId;
  await guardarNumeros(cartonId, numeros, conn);
  return cartonId;
}

/**
 * Guarda los números del cartón junto con su lugar en la grilla de 3 x 10.
 * `posicion` es el orden de lectura (1..N) y `celda` el casillero (1..30).
 */
async function guardarNumeros(cartonId, numeros, conn = null) {
  const disposicion = generarDisposicion(numeros);
  for (let i = 0; i < disposicion.length; i += 1) {
    await exec(
      conn,
      'INSERT INTO carton_numeros (carton_id, numero, posicion, celda) VALUES (?, ?, ?, ?)',
      [cartonId, disposicion[i].numero, i + 1, disposicion[i].celda]
    );
  }
}

const actualizarCodigo = (cartonId, codigo, conn = null) =>
  exec(conn, 'UPDATE cartones SET codigo = ? WHERE id = ?', [codigo, cartonId]);

const numerosDe = async (cartonId) => {
  const filas = await query(
    'SELECT numero, posicion FROM carton_numeros WHERE carton_id = ? ORDER BY posicion',
    [cartonId]
  );
  return filas.map((f) => Number(f.numero));
};

/** Números con su casillero en la grilla, en orden de lectura. */
const disposicionDe = async (cartonId) => {
  const filas = await query(
    'SELECT numero, posicion, celda FROM carton_numeros WHERE carton_id = ? ORDER BY posicion',
    [cartonId]
  );
  return filas.map((f) => ({
    numero: Number(f.numero),
    posicion: Number(f.posicion),
    celda: f.celda === null ? null : Number(f.celda),
  }));
};

async function buscarPorId(id) {
  const carton = await queryOne(`${SELECT_BASE} WHERE c.id = ?`, [id]);
  if (!carton) return null;
  carton.numeros = await numerosDe(id);
  return carton;
}

async function listar({ sorteoId = null, jugadorId = null, vendedorId = null, conNumeros = false } = {}) {
  const where = [];
  const params = [];
  if (sorteoId) { where.push('c.sorteo_id = ?'); params.push(sorteoId); }
  if (jugadorId) { where.push('c.jugador_id = ?'); params.push(jugadorId); }
  if (vendedorId) { where.push('c.vendedor_id = ?'); params.push(vendedorId); }

  const filas = await query(
    `${SELECT_BASE}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY c.id DESC`,
    params
  );
  if (!conNumeros || filas.length === 0) return filas;

  const ids = filas.map((f) => f.id);
  const numeros = await query(
    `SELECT carton_id, numero, celda FROM carton_numeros
      WHERE carton_id IN (${ids.map(() => '?').join(',')})
      ORDER BY carton_id, posicion`,
    ids
  );

  const porCarton = new Map(ids.map((id) => [id, []]));
  numeros.forEach((n) =>
    porCarton.get(n.carton_id).push({
      numero: Number(n.numero),
      celda: n.celda === null ? null : Number(n.celda),
    })
  );

  return filas.map((f) => {
    const disposicion = porCarton.get(f.id) || [];
    return {
      ...f,
      numeros: disposicion.map((d) => d.numero), // compatibilidad con las vistas existentes
      disposicion,                               // para dibujar la grilla 3x10
    };
  });
}

/** Cantidad de cartones no anulados de un sorteo (bloquea filas si hay transaccion). */
async function contarVendidos(sorteoId, conn = null, bloquear = false) {
  const [filas] = await exec(
    conn,
    `SELECT COUNT(*) AS total FROM cartones
      WHERE sorteo_id = ?
        AND estado_id <> (SELECT id FROM estados_carton WHERE codigo = 'ANULADO')
      ${bloquear ? 'FOR UPDATE' : ''}`,
    [sorteoId]
  );
  return Number(filas[0].total);
}

const cambiarEstadoPago = (cartonId, estadoPagoId, habilitado, conn = null) =>
  exec(
    conn,
    `UPDATE cartones
        SET estado_pago_id = ?, habilitado = ?, habilitado_en = ${habilitado ? 'NOW()' : 'habilitado_en'}
      WHERE id = ?`,
    [estadoPagoId, habilitado ? 1 : 0, cartonId]
  );

const marcarEstado = (cartonId, estadoId, conn = null) =>
  exec(conn, 'UPDATE cartones SET estado_id = ? WHERE id = ?', [estadoId, cartonId]);

const actualizarAciertos = (cartonId, aciertos, conn = null) =>
  exec(conn, 'UPDATE cartones SET aciertos = ? WHERE id = ?', [aciertos, cartonId]);

/**
 * Devuelve, para cada carton activo del sorteo, cuantos de sus numeros ya
 * salieron y si esta completo. Es la consulta que dispara la validacion
 * automatica del sorteo.
 */
const progresoDelSorteo = (sorteoId, conn = null) =>
  exec(
    conn,
    `SELECT c.id AS carton_id, c.cantidad_numeros,
            COUNT(ne.numero) AS aciertos,
            (COUNT(ne.numero) = c.cantidad_numeros) AS completo
       FROM cartones c
       JOIN carton_numeros cn ON cn.carton_id = c.id
       LEFT JOIN (
            -- cuenta = 0 son posiciones repetidas o fuera de rango: quedan
            -- registradas en la grilla del sorteo pero no validan cartones.
            SELECT DISTINCT ne.numero
              FROM numeros_extraidos ne
              JOIN jornadas jo ON jo.id = ne.jornada_id
             WHERE jo.sorteo_id = ? AND ne.cuenta = 1
       ) ne ON ne.numero = cn.numero
      WHERE c.sorteo_id = ?
        AND c.estado_id <> (SELECT id FROM estados_carton WHERE codigo = 'ANULADO')
      GROUP BY c.id, c.cantidad_numeros`,
    [sorteoId, sorteoId]
  ).then(([filas]) => filas);

/**
 * Los 20 cartones que más números van acertando en el sorteo.
 *
 * Usa el campo cacheado `aciertos`, que el servicio recalcula para todos los
 * cartones en cada carga de números, así que el ranking queda al día sin
 * recorrer `carton_numeros` por cada fila.
 */
const ranking = (sorteoId, limite = 20) =>
  query(
    `SELECT c.id, c.codigo, c.aciertos, c.cantidad_numeros, c.habilitado,
            ec.codigo AS estado, ep.codigo AS estado_pago,
            j.id AS jugador_id, j.apellido AS jugador_apellido, j.nombre AS jugador_nombre,
            j.dni AS jugador_dni,
            v.id AS vendedor_id, v.apellido AS vendedor_apellido, v.nombre AS vendedor_nombre,
            v.telefono AS vendedor_telefono
       FROM cartones c
       JOIN estados_carton ec ON ec.id = c.estado_id
       JOIN estados_pago   ep ON ep.id = c.estado_pago_id
       JOIN jugadores j  ON j.id = c.jugador_id
       JOIN vendedores v ON v.id = c.vendedor_id
      WHERE c.sorteo_id = ? AND ec.codigo <> 'ANULADO'
      ORDER BY c.aciertos DESC, c.id ASC
      LIMIT ?`,
    [sorteoId, String(limite)]
  ).then((filas) =>
    filas.map((f, i) => ({
      ...f,
      puesto: i + 1,
      aciertos: Number(f.aciertos),
      faltan: Number(f.cantidad_numeros) - Number(f.aciertos),
    }))
  );

/** Cartones ganadores del sorteo, con jugador, vendedor y fecha en que ganaron. */
const ganadoresDe = async (sorteoId) => {
  const filas = await query(
    `SELECT c.id, c.codigo, c.sorteo_id, c.jugador_id, c.vendedor_id, c.cantidad_numeros,
            c.aciertos, c.habilitado,
            ep.codigo AS estado_pago, ec.codigo AS estado,
            s.numero AS sorteo_numero, s.nombre AS sorteo_nombre,
            j.apellido AS jugador_apellido, j.nombre AS jugador_nombre,
            j.dni AS jugador_dni, j.whatsapp AS jugador_whatsapp,
            v.apellido AS vendedor_apellido, v.nombre AS vendedor_nombre,
            v.telefono AS vendedor_telefono,
            g.posicion, jo.fecha AS gano_en, jo.nombre AS gano_en_loteria,
            jo.numero_sorteo AS gano_en_sorteo
       FROM ganadores g
       JOIN cartones c   ON c.id = g.carton_id
       JOIN estados_carton ec ON ec.id = c.estado_id
       JOIN estados_pago   ep ON ep.id = c.estado_pago_id
       JOIN sorteos s    ON s.id = c.sorteo_id
       JOIN jugadores j  ON j.id = c.jugador_id
       JOIN vendedores v ON v.id = c.vendedor_id
       JOIN jornadas jo  ON jo.id = g.jornada_id
      WHERE g.sorteo_id = ?
      ORDER BY g.posicion, g.id`,
    [sorteoId]
  );

  // Se agregan los números del cartón ganador para poder mostrarlo completo.
  for (const f of filas) {
    f.numeros = await numerosDe(f.id);
    f.aciertos = Number(f.aciertos);
  }
  return filas;
};

/** Cantidad de cartones (no anulados) que el jugador tiene en cada sorteo. */
const sorteosDeJugador = (jugadorId, limite = 10) =>
  query(
    `SELECT c.sorteo_id, COUNT(*) AS cartones, MAX(c.aciertos) AS mejor_acierto,
            SUM(ec.codigo = 'GANADOR') AS ganadores
       FROM cartones c
       JOIN estados_carton ec ON ec.id = c.estado_id
      WHERE c.jugador_id = ? AND ec.codigo <> 'ANULADO'
      GROUP BY c.sorteo_id
      ORDER BY c.sorteo_id DESC
      LIMIT ?`,
    [jugadorId, String(limite)]
  );

/** Sorteos en los que el vendedor colocó cartones. */
const sorteosDeVendedor = (vendedorId, limite = 10) =>
  query(
    `SELECT c.sorteo_id, COUNT(*) AS cartones, MAX(c.aciertos) AS mejor_acierto,
            SUM(ec.codigo = 'GANADOR') AS ganadores
       FROM cartones c
       JOIN estados_carton ec ON ec.id = c.estado_id
      WHERE c.vendedor_id = ? AND ec.codigo <> 'ANULADO'
      GROUP BY c.sorteo_id
      ORDER BY c.sorteo_id DESC
      LIMIT ?`,
    [vendedorId, String(limite)]
  );

/**
 * Distribución de estados de pago de un sorteo, opcionalmente de un solo
 * vendedor. Es lo que alimenta el resumen y el gráfico del panel.
 */
async function resumenEstados(sorteoId, vendedorId = null) {
  const params = [sorteoId];
  let filtro = '';
  if (vendedorId) {
    filtro = ' AND c.vendedor_id = ?';
    params.push(vendedorId);
  }

  const fila = await queryOne(
    `SELECT COUNT(*) AS total,
            SUM(ep.codigo = 'IMPAGO')  AS impagos,
            SUM(ep.codigo = 'RENDIDO') AS rendidos,
            SUM(ep.codigo = 'PAGADO')  AS pagados,
            SUM(c.habilitado = 1)      AS habilitados,
            SUM(ec.codigo = 'GANADOR') AS ganadores,
            SUM(ec.codigo = 'ANULADO') AS anulados
       FROM cartones c
       JOIN estados_pago   ep ON ep.id = c.estado_pago_id
       JOIN estados_carton ec ON ec.id = c.estado_id
      WHERE c.sorteo_id = ?${filtro}`,
    params
  );

  const n = (v) => Number(v || 0);
  return {
    total: n(fila.total),
    impagos: n(fila.impagos),
    rendidos: n(fila.rendidos),
    pagados: n(fila.pagados),
    habilitados: n(fila.habilitados),
    ganadores: n(fila.ganadores),
    anulados: n(fila.anulados),
  };
}

/** Vendedores con cartones en el sorteo, con el detalle de sus estados. */
const vendedoresDeSorteo = (sorteoId) =>
  query(
    `SELECT v.id, v.apellido, v.nombre, v.dni, v.telefono, v.habilitado AS vendedor_habilitado,
            COUNT(c.id) AS cartones,
            SUM(ep.codigo = 'IMPAGO')  AS impagos,
            SUM(ep.codigo = 'RENDIDO') AS rendidos,
            SUM(ep.codigo = 'PAGADO')  AS pagados,
            SUM(c.habilitado = 1)      AS habilitados
       FROM cartones c
       JOIN vendedores v   ON v.id = c.vendedor_id
       JOIN estados_pago ep ON ep.id = c.estado_pago_id
      WHERE c.sorteo_id = ?
      GROUP BY v.id, v.apellido, v.nombre, v.dni, v.telefono, v.habilitado
      ORDER BY cartones DESC, v.apellido`,
    [sorteoId]
  ).then((filas) =>
    filas.map((f) => ({
      ...f,
      cartones: Number(f.cartones),
      impagos: Number(f.impagos),
      rendidos: Number(f.rendidos),
      pagados: Number(f.pagados),
      habilitados: Number(f.habilitados),
    }))
  );

/**
 * Resumen de cartones vendidos por un vendedor, agrupado por sorteo.
 * Alimenta la vista `/vendedor/cartones`.
 */
const resumenPorSorteoDeVendedor = (vendedorId) =>
  query(
    `SELECT s.id AS sorteo_id, s.numero AS sorteo_numero, s.nombre AS sorteo_nombre,
            es.codigo AS sorteo_estado, s.precio_carton, s.cartones_objetivo,
            s.creado_en, s.iniciado_en, s.finalizado_en,
            COUNT(c.id) AS cartones,
            SUM(ep.codigo = 'IMPAGO')  AS impagos,
            SUM(ep.codigo = 'RENDIDO') AS rendidos,
            SUM(ep.codigo = 'PAGADO')  AS pagados,
            SUM(c.habilitado = 1)      AS habilitados,
            SUM(ec.codigo = 'GANADOR') AS ganadores,
            MAX(c.aciertos)            AS mejor_acierto
       FROM cartones c
       JOIN sorteos s        ON s.id = c.sorteo_id
       JOIN estados_sorteo es ON es.id = s.estado_id
       JOIN estados_pago   ep ON ep.id = c.estado_pago_id
       JOIN estados_carton ec ON ec.id = c.estado_id
      WHERE c.vendedor_id = ?
      GROUP BY s.id, s.numero, s.nombre, es.codigo, s.precio_carton, s.cartones_objetivo,
               s.creado_en, s.iniciado_en, s.finalizado_en
      ORDER BY s.numero DESC`,
    [vendedorId]
  ).then((filas) =>
    filas.map((f) => {
      const cartones = Number(f.cartones);
      const pagados = Number(f.pagados);
      return {
        ...f,
        cartones,
        impagos: Number(f.impagos),
        rendidos: Number(f.rendidos),
        pagados,
        habilitados: Number(f.habilitados),
        ganadores: Number(f.ganadores),
        mejor_acierto: Number(f.mejor_acierto || 0),
        // Importe estimado de lo que ya está cobrado, para la rendición.
        recaudado: Number(f.precio_carton || 0) * pagados,
        total_a_rendir: Number(f.precio_carton || 0) * cartones,
      };
    })
  );

/** Guarda la referencia del PDF emitido para el cartón. */
const guardarPdf = (cartonId, archivo, conn = null) =>
  exec(conn, 'UPDATE cartones SET pdf_archivo = ?, pdf_generado_en = NOW() WHERE id = ?', [
    archivo,
    cartonId,
  ]);

/**
 * Cartón por su token de validación (el que lleva el QR del PDF).
 *
 * Devuelve sólo lo necesario para validar: NO incluye el DNI ni el WhatsApp del
 * jugador, porque esta consulta se sirve sin autenticación.
 */
async function porToken(token) {
  const carton = await queryOne(
    `SELECT c.id, c.codigo, c.cantidad_numeros, c.aciertos, c.habilitado,
            c.creado_en, c.habilitado_en,
            ec.codigo AS estado, ep.codigo AS estado_pago, ep.nombre AS estado_pago_nombre,
            s.id AS sorteo_id, s.numero AS sorteo_numero, s.nombre AS sorteo_nombre,
            s.color_carton, s.rango_min, s.rango_max,
            es.codigo AS sorteo_estado,
            j.apellido AS jugador_apellido, j.nombre AS jugador_nombre,
            v.apellido AS vendedor_apellido, v.nombre AS vendedor_nombre,
            v.telefono AS vendedor_telefono
       FROM cartones c
       JOIN estados_carton ec  ON ec.id = c.estado_id
       JOIN estados_pago   ep  ON ep.id = c.estado_pago_id
       JOIN sorteos s          ON s.id = c.sorteo_id
       JOIN estados_sorteo es  ON es.id = s.estado_id
       JOIN jugadores j        ON j.id = c.jugador_id
       JOIN vendedores v       ON v.id = c.vendedor_id
      WHERE c.token_validacion = ?`,
    [token]
  );
  if (!carton) return null;
  carton.disposicion = await disposicionDe(carton.id);
  return carton;
}

module.exports = {
  crear, guardarNumeros, actualizarCodigo, numerosDe, disposicionDe, buscarPorId, listar,
  contarVendidos, cambiarEstadoPago, marcarEstado, actualizarAciertos, progresoDelSorteo,
  ranking, ganadoresDe, sorteosDeJugador, sorteosDeVendedor,
  resumenEstados, vendedoresDeSorteo, resumenPorSorteoDeVendedor,
  guardarPdf, porToken,
};
