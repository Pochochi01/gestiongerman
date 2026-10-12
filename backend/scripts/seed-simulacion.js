'use strict';
/**
 * Simulación completa de un bingo, para dejar datos reales en la base.
 *
 *   · 5 vendedores (con domicilio)
 *   · 500 cartones repartidos entre jugadores, con 1, 2 o 3 cartones cada uno
 *   · números de cartón al azar dentro del rango del sorteo
 *   · sorteos "Nocturna" en fechas correlativas, 20 valores de 4 cifras por
 *     día, todos al azar, hasta que aparece el primer ganador
 *
 * Todo pasa por los servicios reales (venta, carga de números, validación de
 * cartones), así que lo que queda en la base es lo mismo que produciría el uso
 * normal del sistema.
 *
 * Uso:   npm run seed:simulacion
 * Limpiar después:  npm run seed:limpiar
 */
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const usuarioModel = require('../src/models/usuario.model');
const vendedorModel = require('../src/models/vendedor.model');
const jugadorModel = require('../src/models/jugador.model');
const cartonModel = require('../src/models/carton.model');
const domicilioModel = require('../src/models/domicilio.model');
const catalogo = require('../src/models/catalogo.model');
const sorteoService = require('../src/services/sorteo.service');
const cartonService = require('../src/services/carton.service');
const notificacion = require('../src/services/notificacion.service');
const { mezclar } = require('../src/utils/helpers');
const env = require('../src/config/env');

// --- Parámetros de la simulación ---
const CARTONES = Number(process.env.SIM_CARTONES || 500);
const VENDEDORES = 5;
const NUMEROS_POR_CARTON = 10;
const RANGO_MIN = 0;
const RANGO_MAX = 99;
const POSICIONES_POR_SORTEO = 20; // la quiniela publica 20 posiciones
const INICIO_DIAS_ATRAS = 10;     // la primera jornada arranca hace 10 dias
const MAX_JORNADAS = 30;          // tope de seguridad
const MARCA = 'SIM';              // prefijo para poder limpiar después

const APELLIDOS = ['Gimenez', 'Romero', 'Sosa', 'Benitez', 'Quiroga', 'Ferreyra', 'Acosta',
  'Ojeda', 'Villalba', 'Cabrera', 'Maidana', 'Escobar', 'Rolon', 'Zarate', 'Alegre',
  'Bogado', 'Correa', 'Duarte', 'Espinola', 'Fretes'];
const NOMBRES = ['Ana', 'Luis', 'Marta', 'Jorge', 'Sofia', 'Diego', 'Carla', 'Pablo',
  'Lucia', 'Martin', 'Elena', 'Raul', 'Nadia', 'Hugo', 'Paola', 'Ivan', 'Rocio',
  'Omar', 'Vera', 'Tomas'];

const alAzar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const entero = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/** `cantidad` números distintos del rango, al azar. */
function numerosAlAzar(cantidad, min = RANGO_MIN, max = RANGO_MAX) {
  const universo = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return mezclar(universo).slice(0, cantidad).sort((a, b) => a - b);
}

/** Un valor de 4 cifras al azar (como un resultado de quiniela). */
const valorQuiniela = () => String(entero(0, 9999)).padStart(4, '0');

/**
 * Fecha de la jornada `n` (0 = la primera). Las jornadas son correlativas, de
 * día en día, arrancando hace `INICIO_DIAS_ATRAS`. Nunca pasa de hoy: si la
 * simulación necesitara más días que los disponibles, las últimas cargas caen
 * en la jornada de hoy.
 */
function fechaDeJornada(n) {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(INICIO_DIAS_ATRAS - n, 0));
  return d.toISOString().slice(0, 10);
}

let dniSeq = Date.now() % 1000000;
const proximoDni = () => String(90000000 + (dniSeq++ % 9000000));

async function main() {
  const t0 = Date.now();
  console.log(`\n=== Simulacion: ${CARTONES} cartones, ${VENDEDORES} vendedores ===\n`);

  // Los números de WhatsApp de la simulación son inventados. Se trabaja en
  // modo simulado para que los mensajes queden REGISTRADOS en
  // mensajes_whatsapp pero no se intente enviarlos: si no, cada envío esperaría
  // hasta 20 s la conexión con WhatsApp y la simulación no terminaría nunca.
  env.whatsapp.enabled = false;

  // Los avisos masivos (inicio de sorteo y números del día) irían a cientos de
  // jugadores por jornada y llenarían la bandeja con miles de filas sin aportar
  // nada. Se silencian sólo acá. Los avisos de cartón nuevo y a los ganadores
  // sí se registran, que es lo que interesa revisar.
  notificacion.notificarInicioSorteo = async () => ({ destinatarios: 0, enviados: 0 });
  notificacion.notificarNumerosDelDia = async () => ({ destinatarios: 0, enviados: 0 });

  const admin = await usuarioModel.buscarPorUsername(process.env.ADMIN_USERNAME || 'admin');
  if (!admin) throw new Error('No existe el usuario administrador. Ejecute npm run seed:admin');

  // ---------------- 1. Sorteo ----------------
  const sorteo = await sorteoService.crearSorteo(
    {
      nombre: `${MARCA} Bingo Nocturna`,
      cartones_objetivo: CARTONES,
      numeros_por_carton: NUMEROS_POR_CARTON,
      rango_min: RANGO_MIN,
      rango_max: RANGO_MAX,
      precio_carton: 5000,
    },
    admin.id
  );
  await sorteoService.abrirVenta(sorteo.id);
  console.log(`Sorteo N° ${sorteo.numero} creado y abierto (objetivo ${CARTONES} cartones)`);

  // ---------------- 2. Vendedores ----------------
  const rolVendedor = await catalogo.rolId('VENDEDOR');
  const vendedores = [];
  for (let i = 1; i <= VENDEDORES; i += 1) {
    const dni = proximoDni();
    const id = await db.withTransaction(async (conn) => {
      const usuarioId = await usuarioModel.crear(
        { rolId: rolVendedor, username: dni, passwordHash: await bcrypt.hash(dni, 10) },
        conn
      );
      const domicilioId = await domicilioModel.crear(
        { calle: `Calle ${MARCA} ${i}`, numero: String(100 * i) },
        conn
      );
      return vendedorModel.crear(
        {
          usuario_id: usuarioId,
          apellido: `${MARCA}${alAzar(APELLIDOS)}`,
          nombre: alAzar(NOMBRES),
          dni,
          telefono: `376${entero(4000000, 4999999)}`,
          domicilio_id: domicilioId,
          habilitado: true,
        },
        conn
      );
    });
    vendedores.push(await vendedorModel.buscarPorId(id));
  }
  console.log(`${vendedores.length} vendedores creados: ${vendedores.map((v) => v.dni).join(', ')}`);

  // ---------------- 3. Jugadores y cartones ----------------
  const rolJugador = await catalogo.rolId('JUGADOR');
  let vendidos = 0;
  let jugadores = 0;

  while (vendidos < CARTONES) {
    // 1, 2 o 3 cartones por jugador, sin pasarse del objetivo.
    const cuantos = Math.min(entero(1, 3), CARTONES - vendidos);
    const vendedor = alAzar(vendedores);
    const dni = proximoDni();

    const jugadorId = await db.withTransaction(async (conn) => {
      const usuarioId = await usuarioModel.crear(
        { rolId: rolJugador, username: dni, passwordHash: await bcrypt.hash(dni, 10) },
        conn
      );
      return jugadorModel.crear(
        {
          usuario_id: usuarioId,
          vendedor_id: vendedor.id,
          apellido: `${MARCA}${alAzar(APELLIDOS)}`,
          nombre: alAzar(NOMBRES),
          dni,
          whatsapp: `549376${entero(4000000, 4999999)}`,
        },
        conn
      );
    });
    jugadores += 1;

    for (let k = 0; k < cuantos; k += 1) {
      await cartonService.venderCarton({
        jugadorId,
        numeros: numerosAlAzar(NUMEROS_POR_CARTON),
        vendedorId: vendedor.id,
      });
      vendidos += 1;
    }

    if (vendidos % 100 === 0) console.log(`  ${vendidos}/${CARTONES} cartones vendidos...`);
  }
  console.log(`${vendidos} cartones vendidos a ${jugadores} jugadores (1 a 3 cada uno)`);

  // ---------------- 4. Rendición y habilitación de una parte ----------------
  // Para que los estados de pago no queden todos en IMPAGO.
  const todos = await cartonModel.listar({ sorteoId: sorteo.id });
  const aHabilitar = mezclar(todos).slice(0, Math.floor(todos.length * 0.6));
  for (const c of aHabilitar) {
    await cartonModel.cambiarEstadoPago(c.id, await catalogo.estadoPagoId('PAGADO'), true);
  }
  const aRendir = mezclar(todos.filter((c) => !aHabilitar.includes(c))).slice(0, 60);
  for (const c of aRendir) {
    await cartonModel.cambiarEstadoPago(c.id, await catalogo.estadoPagoId('RENDIDO'), false);
  }
  console.log(`${aHabilitar.length} cartones habilitados y ${aRendir.length} rendidos`);

  // ---------------- 5. Sorteos Nocturna en fechas correlativas ----------------
  console.log('\n--- Sorteos diarios (Nocturna) ---');

  // `cargarNumeros` avisa a los ganadores sin esperar la respuesta (para no
  // demorar el request). En un script eso corre el riesgo de quedar a medias
  // cuando se cierra el pool, así que se silencia acá y al final se llama al
  // aviso de forma explícita y esperada.
  const avisarGanadores = notificacion.notificarGanadoresDeSorteo;
  notificacion.notificarGanadoresDeSorteo = async () => ({ total_ganadores: 0, enviados: 0 });

  let jornada = 0;
  let resultado = null;
  let numeroSorteoQuiniela = entero(9000, 9500);

  while (jornada < MAX_JORNADAS) {
    const fecha = fechaDeJornada(jornada); // correlativas, de dia en dia
    const valores = Array.from({ length: POSICIONES_POR_SORTEO }, valorQuiniela);

    resultado = await sorteoService.cargarNumeros(
      sorteo.id,
      { fecha, numeros: valores, numero_sorteo: numeroSorteoQuiniela },
      admin.id
    );

    const top = (await cartonModel.ranking(sorteo.id, 1))[0];
    console.log(
      `  ${fecha}  sorteo ${numeroSorteoQuiniela}` +
        `  nuevos: ${String(resultado.cargados.length).padStart(2)}` +
        `  repetidos: ${String(resultado.ignorados.length).padStart(2)}` +
        `  mejor carton: ${top.aciertos}/${top.cantidad_numeros}`
    );

    jornada += 1;
    numeroSorteoQuiniela += 1;
    if (resultado.finalizado) break;
  }

  // ---------------- 6. Aviso a los ganadores ----------------
  notificacion.notificarGanadoresDeSorteo = avisarGanadores;
  const aviso = await sorteoService.notificarGanadores(sorteo.id).catch((err) => {
    console.log(`  (sin ganadores para avisar: ${err.message})`);
    return null;
  });
  if (aviso) {
    console.log(
      `\nAviso a ganadores: ${aviso.total_ganadores} mensaje(s) generado(s) ` +
        '(modo simulado: quedan registrados en mensajes_whatsapp)'
    );
  }

  // ---------------- 7. Resultado ----------------
  const detalle = await sorteoService.resumen(sorteo.id);
  console.log(`\n--- Resultado del sorteo N° ${sorteo.numero} ---`);
  console.log(`Estado: ${detalle.sorteo.estado}`);
  console.log(`Jornadas jugadas: ${detalle.jornadas.length}`);
  console.log(`Numeros salidos: ${detalle.numeros_salidos.length}`);
  console.log(`Ganadores: ${detalle.total_ganadores}`);

  for (const g of detalle.ganadores) {
    console.log(
      `  * ${g.codigo} - ${g.jugador_apellido}, ${g.jugador_nombre} (DNI ${g.jugador_dni})` +
        `\n    vendedor: ${g.vendedor_apellido}, ${g.vendedor_nombre} - ${g.vendedor_telefono}` +
        `\n    numeros: ${g.numeros.join(' ')}  |  gano el ${g.gano_en}`
    );
  }

  console.log('\nTop 5 del ranking:');
  detalle.ranking.slice(0, 5).forEach((r) => {
    console.log(
      `  ${String(r.puesto).padStart(2)}. ${r.codigo}  ${r.aciertos}/${r.cantidad_numeros}  ` +
        `${r.jugador_apellido}, ${r.jugador_nombre}  (vend. ${r.vendedor_apellido})`
    );
  });

  console.log(`\nListo en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  console.log(`Para borrar esta simulacion: npm run seed:limpiar`);
  await db.pool.end();
}

main().catch(async (err) => {
  console.error('\nError en la simulacion:', err.message);
  console.error(err.stack);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
