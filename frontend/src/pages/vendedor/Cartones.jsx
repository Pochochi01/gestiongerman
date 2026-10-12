/**
 * /vendedor/cartones — lo que vendió el vendedor.
 *
 * Arriba: resumen de cantidad de cartones vendidos **por cada sorteo**, con el
 * detalle de estados. Abajo: el listado de cartones, filtrable por sorteo, con
 * la rendición y la carga del comprobante.
 *
 * Se refresca solo cada 15 s: así, cuando el administrador habilita o marca un
 * cartón como pagado, el vendedor lo ve sin recargar la página.
 * (Es polling, no push: ver la nota en docs/03-modulos.md.)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cartonesApi, vendedoresApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import ResumenEstados from '../../components/ResumenEstados';
import { Alerta, Cargando, EstadoBadge, Vacio } from '../../components/ui';

const REFRESCO_MS = 15000;

export default function Cartones() {
  const { perfil } = useAuth();
  const [resumen, setResumen] = useState(null);
  const [lista, setLista] = useState([]);
  const [sorteoFiltro, setSorteoFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [subiendo, setSubiendo] = useState(null);
  const [actualizado, setActualizado] = useState(null);
  const archivoRef = useRef(null);
  const cartonSeleccionado = useRef(null);
  const timer = useRef(null);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const [r, cs] = await Promise.all([
          perfil?.id ? vendedoresApi.cartonesPorSorteo(perfil.id) : Promise.resolve(null),
          cartonesApi.listar(),
        ]);
        setResumen(r);
        setLista(cs);
        setActualizado(new Date());
      } catch (err) {
        setMensaje({ tipo: 'error', texto: err.message });
      } finally {
        setCargando(false);
      }
    },
    [perfil?.id]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Refresco automático: refleja los cambios que hace el administrador.
  useEffect(() => {
    timer.current = setInterval(() => cargar(true), REFRESCO_MS);
    return () => clearInterval(timer.current);
  }, [cargar]);

  const rendir = async (carton) => {
    try {
      await cartonesApi.rendir(carton.id);
      setMensaje({
        tipo: 'exito',
        texto: `Cartón ${carton.codigo} marcado como rendido. El administrador debe habilitarlo.`,
      });
      cargar(true);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    }
  };

  const pedirArchivo = (carton) => {
    cartonSeleccionado.current = carton;
    archivoRef.current?.click();
  };

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    const carton = cartonSeleccionado.current;
    e.target.value = '';
    if (!archivo || !carton) return;

    setSubiendo(carton.id);
    try {
      await cartonesApi.subirComprobante(carton.id, archivo);
      setMensaje({ tipo: 'exito', texto: `Comprobante cargado para ${carton.codigo}.` });
      cargar(true);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setSubiendo(null);
    }
  };

  if (cargando) return <Cargando />;

  const sorteos = resumen?.sorteos || [];
  const visibles = sorteoFiltro
    ? lista.filter((c) => String(c.sorteo_id) === String(sorteoFiltro))
    : lista;

  // El sorteo elegido manda sobre toda la estadística de la pantalla.
  const elegido = sorteoFiltro
    ? sorteos.find((s) => String(s.sorteo_id) === String(sorteoFiltro))
    : null;

  /**
   * Números que alimentan las tarjetas y el gráfico: los del sorteo elegido,
   * o la suma de todos si se elige "Todos los sorteos".
   */
  const estadistica = elegido
    ? {
        titulo: `Sorteo N° ${elegido.sorteo_numero} — ${elegido.sorteo_nombre}`,
        total: elegido.cartones,
        impagos: elegido.impagos,
        rendidos: elegido.rendidos,
        pagados: elegido.pagados,
        habilitados: elegido.habilitados,
        ganadores: elegido.ganadores,
        anulados: 0,
        recaudado: elegido.recaudado,
        total_a_rendir: elegido.total_a_rendir,
      }
    : {
        titulo: `Todos mis sorteos (${sorteos.length})`,
        total: resumen?.totales?.cartones || 0,
        impagos: resumen?.totales?.impagos || 0,
        rendidos: resumen?.totales?.rendidos || 0,
        pagados: resumen?.totales?.pagados || 0,
        habilitados: resumen?.totales?.habilitados || 0,
        ganadores: resumen?.totales?.ganadores || 0,
        anulados: 0,
        recaudado: resumen?.totales?.recaudado || 0,
        total_a_rendir: sorteos.reduce((a, s) => a + s.total_a_rendir, 0),
      };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cartones vendidos</h1>
          <p className="text-sm text-slate-500">
            Estadística de: <span className="font-medium text-slate-700">{estadistica.titulo}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {actualizado && <span>actualizado {actualizado.toLocaleTimeString()}</span>}
          <button type="button" className="btn-secondary" onClick={() => cargar()}>
            Actualizar
          </button>
        </div>
      </div>

      {/* --- Selector de sorteo: gobierna toda la estadistica de la pantalla --- */}
      {sorteos.length > 0 && (
        <div className="card flex flex-wrap items-end gap-4">
          <div className="min-w-[16rem] flex-1">
            <label className="label" htmlFor="sorteo">Ver estadística del sorteo</label>
            <select
              id="sorteo"
              className="input"
              value={sorteoFiltro}
              onChange={(e) => setSorteoFiltro(e.target.value)}
            >
              <option value="">Todos los sorteos ({resumen?.totales?.cartones || 0} cartones)</option>
              {sorteos.map((s) => (
                <option key={s.sorteo_id} value={s.sorteo_id}>
                  N° {s.sorteo_numero} — {s.sorteo_nombre} ({s.cartones} cartones)
                </option>
              ))}
            </select>
          </div>

          {elegido && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>
                <span className="block text-xs uppercase tracking-wide text-slate-500">Estado</span>
                <EstadoBadge estado={elegido.sorteo_estado} />
              </span>
              <span>
                <span className="block text-xs uppercase tracking-wide text-slate-500">Mejor acierto</span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {elegido.mejor_acierto}
                </span>
              </span>
              {elegido.ganadores > 0 && (
                <span>
                  <span className="block text-xs uppercase tracking-wide text-slate-500">Ganadores</span>
                  <span className="font-semibold tabular-nums text-amber-700">
                    {elegido.ganadores}
                  </span>
                </span>
              )}
              <button type="button" className="btn-secondary" onClick={() => setSorteoFiltro('')}>
                Ver todos
              </button>
            </div>
          )}
        </div>
      )}

      {mensaje && <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

      <input
        ref={archivoRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={subir}
      />

      {/* --- Tarjetas: siempre del sorteo elegido --- */}
      {resumen && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Cartones vendidos', estadistica.total, 'text-slate-900'],
            ['Impagos', estadistica.impagos, 'text-rose-700'],
            ['Rendidos', estadistica.rendidos, 'text-amber-700'],
            ['Pagados', estadistica.pagados, 'text-emerald-700'],
          ].map(([k, v, color]) => (
            <div key={k} className="card">
              <p className="text-xs uppercase tracking-wide text-slate-500">{k}</p>
              <p className={`text-3xl font-bold tabular-nums ${color}`}>{v}</p>
            </div>
          ))}
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-slate-500">Recaudado</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              $ {Number(estadistica.recaudado).toLocaleString()}
            </p>
            <p className="text-xs text-slate-500">
              de $ {Number(estadistica.total_a_rendir).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* --- Resumen por sorteo --- */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-900">Cartones por sorteo</h2>
        {sorteos.length === 0 ? (
          <Vacio>Todavía no vendió cartones.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Sorteo</th>
                  <th className="th">Estado</th>
                  <th className="th">Cartones</th>
                  <th className="th">Impagos</th>
                  <th className="th">Rendidos</th>
                  <th className="th">Pagados</th>
                  <th className="th">Recaudado</th>
                  <th className="th text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorteos.map((s) => (
                  <tr
                    key={s.sorteo_id}
                    className={
                      String(s.sorteo_id) === String(sorteoFiltro)
                        ? "bg-bingo-50 ring-1 ring-inset ring-bingo-200"
                        : "hover:bg-slate-50 cursor-pointer"
                    }
                    onClick={() => setSorteoFiltro(String(s.sorteo_id))}
                  >
                    <td className="td font-medium text-slate-900">
                      N° {s.sorteo_numero} — {s.sorteo_nombre}
                      {s.ganadores > 0 && (
                        <span className="ml-2 badge bg-amber-200 text-amber-900">
                          {s.ganadores} ganador(es)
                        </span>
                      )}
                    </td>
                    <td className="td"><EstadoBadge estado={s.sorteo_estado} /></td>
                    <td className="td text-lg font-bold tabular-nums text-slate-900">{s.cartones}</td>
                    <td className="td tabular-nums text-rose-700">{s.impagos}</td>
                    <td className="td tabular-nums text-amber-700">{s.rendidos}</td>
                    <td className="td tabular-nums text-emerald-700">{s.pagados}</td>
                    <td className="td tabular-nums text-slate-700">
                      $ {Number(s.recaudado).toLocaleString()}
                      <span className="block text-xs text-slate-400">
                        de $ {Number(s.total_a_rendir).toLocaleString()}
                      </span>
                    </td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSorteoFiltro(
                            String(s.sorteo_id) === String(sorteoFiltro) ? '' : String(s.sorteo_id)
                          );
                        }}
                      >
                        {String(s.sorteo_id) === String(sorteoFiltro) ? 'Quitar filtro' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Gráfico: también del sorteo elegido --- */}
      {estadistica.total > 0 && (
        <div className="card">
          <ResumenEstados resumen={estadistica} titulo={`Estado de los cartones · ${estadistica.titulo}`} />
        </div>
      )}

      {/* --- Listado de cartones --- */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {/* El filtro es el selector de arriba: acá sólo se refleja. */}
          <h2 className="font-semibold text-slate-900">
            Detalle de cartones
            <span className="ml-2 text-sm font-normal text-slate-500">
              {elegido ? `· sorteo N° ${elegido.sorteo_numero}` : '· todos los sorteos'}
            </span>
          </h2>
          <span className="text-sm text-slate-500">{visibles.length} cartones</span>
        </div>

        {visibles.length === 0 ? (
          <Vacio>No hay cartones para este filtro.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Cartón</th>
                  <th className="th">Sorteo</th>
                  <th className="th">Jugador</th>
                  <th className="th">Aciertos</th>
                  <th className="th">Pago</th>
                  <th className="th text-right">Rendición</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td font-medium text-slate-900">
                      {c.codigo}
                      {c.estado === 'GANADOR' && (
                        <span className="ml-2 align-middle">
                          <EstadoBadge estado="GANADOR" />
                        </span>
                      )}
                    </td>
                    <td className="td text-slate-600">N° {c.sorteo_numero}</td>
                    <td className="td">
                      {c.jugador_apellido}, {c.jugador_nombre}
                    </td>
                    <td className="td tabular-nums">
                      {c.aciertos}/{c.cantidad_numeros}
                    </td>
                    <td className="td">
                      <EstadoBadge estado={c.estado_pago} />
                      {c.habilitado && (
                        <span className="ml-1 badge bg-emerald-100 text-emerald-700">habilitado</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-2">
                        {c.estado_pago === 'IMPAGO' && (
                          <button type="button" className="btn-secondary" onClick={() => rendir(c)}>
                            Marcar rendido
                          </button>
                        )}
                        {!c.habilitado && (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => pedirArchivo(c)}
                            disabled={subiendo === c.id}
                          >
                            {subiendo === c.id ? 'Subiendo...' : 'Subir comprobante'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
