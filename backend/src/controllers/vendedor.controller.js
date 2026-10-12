'use strict';
/**
 * Modulo 1 - Administrador: CRUD de vendedores y habilitacion/inhabilitacion.
 * El alta crea tambien el usuario (username = DNI, clave inicial = DNI).
 */
const bcrypt = require('bcryptjs');
const { withTransaction, query } = require('../config/db');
const vendedorModel = require('../models/vendedor.model');
const usuarioModel = require('../models/usuario.model');
const domicilioModel = require('../models/domicilio.model');
const catalogo = require('../models/catalogo.model');
const cartonModel = require('../models/carton.model');
const { asyncHandler, ok } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

/** GET /api/vendedores */
const listar = asyncHandler(async (req, res) =>
  ok(res, await vendedorModel.listar({ busqueda: req.query.q, habilitado: req.query.habilitado }))
);

/** GET /api/vendedores/:id */
const obtener = asyncHandler(async (req, res) => {
  const vendedor = await vendedorModel.buscarPorId(req.params.id);
  if (!vendedor) throw ApiError.notFound('Vendedor inexistente');
  return ok(res, vendedor);
});

/**
 * GET /api/vendedores/:id/cartones
 *
 * Resumen de los cartones que vendio, agrupado por sorteo: cuantos vendio y
 * como estan (impagos / rendidos / pagados / habilitados), mas el importe
 * recaudado. Es la vista `/vendedor/cartones`.
 *
 * Un VENDEDOR solo puede consultar el suyo.
 */
const cartonesPorSorteo = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (req.auth.rol === 'VENDEDOR' && req.auth.perfilId !== id) {
    throw ApiError.forbidden('Solo puede consultar sus propios cartones');
  }

  const vendedor = await vendedorModel.buscarPorId(id);
  if (!vendedor) throw ApiError.notFound('Vendedor inexistente');

  const sorteos = await cartonModel.resumenPorSorteoDeVendedor(id);

  // Totales de todos los sorteos, para el encabezado de la vista.
  const totales = sorteos.reduce(
    (acc, s) => ({
      cartones: acc.cartones + s.cartones,
      impagos: acc.impagos + s.impagos,
      rendidos: acc.rendidos + s.rendidos,
      pagados: acc.pagados + s.pagados,
      habilitados: acc.habilitados + s.habilitados,
      ganadores: acc.ganadores + s.ganadores,
      recaudado: acc.recaudado + s.recaudado,
    }),
    { cartones: 0, impagos: 0, rendidos: 0, pagados: 0, habilitados: 0, ganadores: 0, recaudado: 0 }
  );

  return ok(res, {
    vendedor: {
      id: vendedor.id,
      apellido: vendedor.apellido,
      nombre: vendedor.nombre,
      dni: vendedor.dni,
      telefono: vendedor.telefono,
      habilitado: !!vendedor.habilitado,
    },
    totales,
    sorteos,
  });
});

/** POST /api/vendedores */
const crear = asyncHandler(async (req, res) => {
  const { apellido, nombre, dni, telefono, domicilio, habilitado = true } = req.body;

  if (await vendedorModel.buscarPorDni(dni)) throw ApiError.conflict('Ya existe un vendedor con ese DNI');
  if (await usuarioModel.buscarPorUsername(dni)) throw ApiError.conflict('El DNI ya se usa como usuario');

  const rolId = await catalogo.rolId('VENDEDOR');
  const passwordHash = await bcrypt.hash(String(dni), 10);

  const id = await withTransaction(async (conn) => {
    const usuarioId = await usuarioModel.crear(
      { rolId, username: String(dni), passwordHash, activo: habilitado ? 1 : 0 },
      conn
    );
    const domicilioId = await domicilioModel.crear(domicilio, conn);
    return vendedorModel.crear(
      {
        usuario_id: usuarioId,
        apellido,
        nombre,
        dni: String(dni),
        telefono,
        domicilio_id: domicilioId,
        habilitado,
      },
      conn
    );
  });

  return ok(res, await vendedorModel.buscarPorId(id), 201);
});

/** PUT /api/vendedores/:id */
const actualizar = asyncHandler(async (req, res) => {
  const vendedor = await vendedorModel.buscarPorId(req.params.id);
  if (!vendedor) throw ApiError.notFound('Vendedor inexistente');
  const { apellido, nombre, telefono, domicilio } = req.body;

  await withTransaction(async (conn) => {
    const domicilioId = await domicilioModel.guardar(vendedor.domicilio_id, domicilio, conn);
    await vendedorModel.actualizar(
      vendedor.id,
      {
        apellido: apellido ?? vendedor.apellido,
        nombre: nombre ?? vendedor.nombre,
        telefono: telefono ?? vendedor.telefono,
        domicilio_id: domicilioId,
      },
      conn
    );
  });

  return ok(res, await vendedorModel.buscarPorId(vendedor.id));
});

/** PATCH /api/vendedores/:id/habilitacion */
const cambiarHabilitacion = asyncHandler(async (req, res) => {
  const vendedor = await vendedorModel.buscarPorId(req.params.id);
  if (!vendedor) throw ApiError.notFound('Vendedor inexistente');
  const habilitado = !!req.body.habilitado;

  await withTransaction(async (conn) => {
    await vendedorModel.cambiarHabilitacion(vendedor.id, habilitado, conn);
    await usuarioModel.actualizarEstado(vendedor.usuario_id, habilitado, conn);
  });

  return ok(res, await vendedorModel.buscarPorId(vendedor.id));
});

/**
 * DELETE /api/vendedores/:id
 *
 * Sin jugadores cargados, borra directo. Con jugadores, exige `?forzar=true`
 * y arrastra sus jugadores y cartones.
 *
 * Resguardo: NO se puede forzar si el vendedor tiene cartones en un sorteo en
 * venta o en curso. Borrarlos liberaría cupos y alteraría un sorteo vivo.
 */
const eliminar = asyncHandler(async (req, res) => {
  const vendedor = await vendedorModel.buscarPorId(req.params.id);
  if (!vendedor) throw ApiError.notFound('Vendedor inexistente');

  const conJugadores = Number(vendedor.jugadores_cargados) > 0;
  const forzar = ['1', 'true', 'si'].includes(String(req.query.forzar || '').toLowerCase());

  if (conJugadores && !forzar) {
    throw ApiError.conflict(
      `El vendedor tiene ${vendedor.jugadores_cargados} jugador(es) cargado(s). ` +
        'Inhabilitelo, o repita con ?forzar=true para eliminarlo junto con sus jugadores y cartones.'
    );
  }

  if (conJugadores) {
    const activos = await query(
      `SELECT COUNT(*) AS n
         FROM cartones c
         JOIN sorteos s        ON s.id = c.sorteo_id
         JOIN estados_sorteo es ON es.id = s.estado_id
        WHERE c.vendedor_id = ? AND es.codigo IN ('EN_VENTA', 'EN_CURSO')`,
      [vendedor.id]
    );
    if (Number(activos[0].n) > 0) {
      throw ApiError.conflict(
        `No se puede eliminar: tiene ${activos[0].n} carton(es) en un sorteo en venta o en curso. ` +
          'Espere a que el sorteo finalice o anule esos cartones.'
      );
    }
  }

  const borrado = await withTransaction(async (conn) => {
    const [jugadores] = await conn.execute(
      'SELECT id, usuario_id FROM jugadores WHERE vendedor_id = ?',
      [vendedor.id]
    );

    let cartones = 0;
    for (const j of jugadores) {
      const [r] = await conn.execute('DELETE FROM cartones WHERE jugador_id = ?', [j.id]);
      cartones += r.affectedRows;
    }
    // Al borrar el usuario, el jugador cae por ON DELETE CASCADE.
    for (const j of jugadores) {
      await conn.execute('DELETE FROM usuarios WHERE id = ?', [j.usuario_id]);
    }
    // Idem con el vendedor.
    await conn.execute('DELETE FROM usuarios WHERE id = ?', [vendedor.usuario_id]);

    return { jugadores: jugadores.length, cartones };
  });

  return ok(res, {
    mensaje:
      `Vendedor ${vendedor.apellido}, ${vendedor.nombre} eliminado` +
      (borrado.jugadores
        ? ` junto con ${borrado.jugadores} jugador(es) y ${borrado.cartones} carton(es)`
        : ''),
    ...borrado,
  });
});

module.exports = {
  listar, obtener, crear, actualizar, cambiarHabilitacion, eliminar, cartonesPorSorteo,
};
