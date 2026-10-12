'use strict';
/** Modelo de auditoria de mensajes de WhatsApp. */
const { pool, query } = require('../config/db');

const exec = (conn, sql, params = []) => (conn || pool).execute(sql, params);

async function crear(datos, conn = null) {
  const [res] = await exec(
    conn,
    `INSERT INTO mensajes_whatsapp
       (tipo_mensaje_id, estado_envio_id, jugador_id, carton_id, destino, contenido)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      datos.tipo_mensaje_id,
      datos.estado_envio_id,
      datos.jugador_id ?? null,
      datos.carton_id ?? null,
      datos.destino,
      datos.contenido,
    ]
  );
  return res.insertId;
}

const marcarEnviado = (id) =>
  query(
    'UPDATE mensajes_whatsapp SET estado_envio_id = (SELECT id FROM estados_envio WHERE codigo = \'ENVIADO\'), enviado_en = NOW(), intentos = intentos + 1 WHERE id = ?',
    [id]
  );

const marcarError = (id, detalle) =>
  query(
    'UPDATE mensajes_whatsapp SET estado_envio_id = (SELECT id FROM estados_envio WHERE codigo = \'ERROR\'), error_detalle = ?, intentos = intentos + 1 WHERE id = ?',
    [String(detalle).slice(0, 2000), id]
  );

/** Bandeja de salida para el panel de administracion. */
const listar = (limite = 100) =>
  query(
    `SELECT m.id, tm.codigo AS tipo, ee.codigo AS estado, m.destino, m.contenido,
            m.error_detalle, m.intentos, m.creado_en, m.enviado_en,
            j.apellido AS jugador_apellido, j.nombre AS jugador_nombre, c.codigo AS carton_codigo
       FROM mensajes_whatsapp m
       JOIN tipos_mensaje tm ON tm.id = m.tipo_mensaje_id
       JOIN estados_envio ee ON ee.id = m.estado_envio_id
       LEFT JOIN jugadores j ON j.id = m.jugador_id
       LEFT JOIN cartones  c ON c.id = m.carton_id
      ORDER BY m.id DESC
      LIMIT ?`,
    [String(limite)]
  );

const pendientes = () =>
  query(
    `SELECT m.id, m.destino, m.contenido
       FROM mensajes_whatsapp m
       JOIN estados_envio ee ON ee.id = m.estado_envio_id
      WHERE ee.codigo IN ('PENDIENTE', 'ERROR') AND m.intentos < 3
      ORDER BY m.id ASC
      LIMIT 50`
  );

module.exports = { crear, marcarEnviado, marcarError, listar, pendientes };
