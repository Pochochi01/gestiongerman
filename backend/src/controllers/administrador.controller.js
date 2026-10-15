'use strict';
/**
 * Modulo 1 - Administrador: CRUD de administradores y blanqueo de clave.
 *
 * El alta crea tambien el usuario, igual que con los vendedores: el username y
 * la clave inicial son el DNI, y queda marcado para que lo cambie al entrar.
 *
 * --- La cuenta raiz ---------------------------------------------------------
 * El administrador fundador (`usuarios.es_raiz = 1`) no tiene ficha en
 * `administradores`, y el modelo ademas filtra `es_raiz = 0` en cada consulta.
 * Por eso no aparece en la lista, no se puede obtener por id, ni editar, ni
 * inhabilitar, ni blanquear, ni eliminar: no hay id con el que pedirlo. La
 * invisibilidad no es un filtro de la interfaz.
 *
 * Los administradores creados aca tienen las mismas facultades que el raiz
 * sobre todo lo demas, incluida la de crear otros administradores.
 *
 * --- Resguardos contra el bloqueo ------------------------------------------
 * Nadie puede inhabilitarse ni eliminarse a si mismo, y ninguna operacion
 * puede dejar el sistema con cero administradores activos.
 */
const bcrypt = require('bcryptjs');
const { withTransaction } = require('../config/db');
const administradorModel = require('../models/administrador.model');
const usuarioModel = require('../models/usuario.model');
const catalogo = require('../models/catalogo.model');
const { asyncHandler, ok } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

/** Lo que se devuelve al frontend. Nunca incluye el hash de la clave. */
const aSalida = (a) => ({
  id: a.id,
  usuario_id: a.usuario_id,
  apellido: a.apellido,
  nombre: a.nombre,
  dni: a.dni,
  username: a.username,
  activo: !!a.activo,
  debe_cambiar_password: !!a.debe_cambiar_password,
  ultimo_acceso: a.ultimo_acceso,
  creado_en: a.creado_en,
  creado_por_username: a.creado_por_username,
});

/**
 * Busca el administrador del :id o corta con 404.
 *
 * El 404 es deliberado tambien para la cuenta raiz: un 403 confirmaria que ese
 * id existe y que hay una cuenta por encima. Para un administrador nuevo, la
 * cuenta raiz es indistinguible de un id que nunca existio.
 */
async function exigir(id) {
  const admin = await administradorModel.buscarPorId(id);
  if (!admin) throw ApiError.notFound('Administrador inexistente');
  return admin;
}

/** GET /api/administradores */
const listar = asyncHandler(async (req, res) => {
  const lista = await administradorModel.listar({
    busqueda: req.query.q,
    activo: req.query.activo,
  });
  return ok(res, lista.map(aSalida));
});

/** GET /api/administradores/:id */
const obtener = asyncHandler(async (req, res) => ok(res, aSalida(await exigir(req.params.id))));

/**
 * GET /api/administradores/yo
 *
 * Quien soy en este modulo. El frontend lo usa para no ofrecerse a si mismo
 * los botones de inhabilitar o eliminar, que el backend igual rechaza.
 */
const yo = asyncHandler(async (req, res) => {
  const usuario = await usuarioModel.buscarPorId(req.auth.usuarioId);
  const ficha = await administradorModel.buscarPorUsuarioId(req.auth.usuarioId);
  return ok(res, {
    usuario_id: req.auth.usuarioId,
    username: req.auth.username,
    es_raiz: !!usuario?.es_raiz,
    // `id` de la ficha, o null si es el raiz (que no tiene ficha).
    administrador_id: ficha ? ficha.id : null,
  });
});

/** POST /api/administradores */
const crear = asyncHandler(async (req, res) => {
  const { apellido, nombre, dni, activo = true } = req.body;
  const dniTexto = String(dni).trim();

  if (await administradorModel.buscarPorDni(dniTexto)) {
    throw ApiError.conflict('Ya existe un administrador con ese DNI');
  }
  // El username es el DNI, y lo comparten los tres roles: si ese DNI ya es de
  // un vendedor o de un jugador, el alta choca contra la clave unica de
  // `usuarios.username`. Conviene decirlo antes y con claridad.
  if (await usuarioModel.buscarPorUsername(dniTexto)) {
    throw ApiError.conflict(
      'Ese DNI ya se usa como usuario del sistema (puede ser de un vendedor o de un jugador). ' +
        'Un mismo DNI no puede tener dos cuentas.'
    );
  }

  const rolId = await catalogo.rolId('ADMIN');
  const passwordHash = await bcrypt.hash(dniTexto, 10);

  const id = await withTransaction(async (conn) => {
    const usuarioId = await usuarioModel.crear(
      {
        rolId,
        username: dniTexto,
        passwordHash,
        // Entra con el DNI y el sistema le pide cambiarla.
        debeCambiarPassword: 1,
        activo: activo ? 1 : 0,
      },
      conn
    );
    return administradorModel.crear(
      {
        usuario_id: usuarioId,
        apellido,
        nombre,
        dni: dniTexto,
        creado_por: req.auth.usuarioId,
      },
      conn
    );
  });

  return ok(
    res,
    {
      ...aSalida(await administradorModel.buscarPorId(id)),
      credenciales: { usuario: dniTexto, clave: dniTexto },
    },
    201
  );
});

/**
 * PUT /api/administradores/:id
 *
 * Solo apellido y nombre. El DNI no se edita porque es el username con el que
 * la cuenta entra: cambiarlo seria crear otra cuenta.
 */
const actualizar = asyncHandler(async (req, res) => {
  const admin = await exigir(req.params.id);
  const { apellido, nombre } = req.body;

  await administradorModel.actualizar(admin.id, {
    apellido: apellido ?? admin.apellido,
    nombre: nombre ?? admin.nombre,
  });

  return ok(res, aSalida(await administradorModel.buscarPorId(admin.id)));
});

/** PATCH /api/administradores/:id/activacion */
const cambiarActivacion = asyncHandler(async (req, res) => {
  const admin = await exigir(req.params.id);
  const activo = !!req.body.activo;

  if (admin.usuario_id === req.auth.usuarioId && !activo) {
    throw ApiError.conflict(
      'No puede inhabilitar su propia cuenta: quedaria sin poder entrar al sistema.'
    );
  }

  // Inhabilitar al ultimo administrador activo deja el sistema sin dueño.
  if (!activo && admin.activo) {
    const activosAhora = await administradorModel.activos();
    if (activosAhora <= 1) {
      throw ApiError.conflict(
        'Es el unico administrador activo. Habilite otro antes de inhabilitar este.'
      );
    }
  }

  await usuarioModel.actualizarEstado(admin.usuario_id, activo);
  return ok(res, aSalida(await administradorModel.buscarPorId(admin.id)));
});

/**
 * POST /api/administradores/:id/blanqueo
 *
 * Deja la clave igual al DNI y marca `debe_cambiar_password`, de modo que la
 * clave provisoria (que quien blanquea conoce) sirva una sola vez.
 */
const blanquear = asyncHandler(async (req, res) => {
  const admin = await exigir(req.params.id);

  if (admin.usuario_id === req.auth.usuarioId) {
    throw ApiError.conflict(
      'Para cambiar su propia clave use "Cambiar clave", que pide la clave actual.'
    );
  }

  const passwordHash = await bcrypt.hash(String(admin.dni), 10);
  await usuarioModel.blanquearPassword(admin.usuario_id, passwordHash);

  return ok(res, {
    mensaje:
      `Clave de ${admin.apellido}, ${admin.nombre} blanqueada. ` +
      'Entra con su DNI y el sistema le pide una clave nueva.',
    credenciales: { usuario: admin.username, clave: admin.dni },
  });
});

/**
 * DELETE /api/administradores/:id
 *
 * Borra el usuario; la ficha cae por ON DELETE CASCADE. No arrastra datos del
 * sorteo: un administrador no es dueño de cartones ni de jugadores.
 */
const eliminar = asyncHandler(async (req, res) => {
  const admin = await exigir(req.params.id);

  if (admin.usuario_id === req.auth.usuarioId) {
    throw ApiError.conflict('No puede eliminar su propia cuenta.');
  }

  if (admin.activo) {
    const activosAhora = await administradorModel.activos();
    if (activosAhora <= 1) {
      throw ApiError.conflict(
        'Es el unico administrador activo. Cree o habilite otro antes de eliminar este.'
      );
    }
  }

  await withTransaction(async (conn) => {
    await conn.execute('DELETE FROM usuarios WHERE id = ? AND es_raiz = 0', [admin.usuario_id]);
  });

  return ok(res, {
    mensaje: `Administrador ${admin.apellido}, ${admin.nombre} eliminado.`,
  });
});

module.exports = {
  listar, obtener, yo, crear, actualizar, cambiarActivacion, blanquear, eliminar,
};
