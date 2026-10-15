/**
 * /admin/sorteos/:id — pantalla completa de un sorteo.
 *
 * - Datos del sorteo (fecha, estado, cartones, vendedores asociados).
 * - Filtro por vendedor: muestra los cartones que vendió.
 * - Si el sorteo está vigente (EN_VENTA o EN_CURSO), cada cartón se puede
 *   marcar como habilitado/pagado o volver atrás.
 * - Resumen visual: texto con las cantidades por estado y gráfico de barras.
 *
 * La pantalla se refresca sola cada 15 s y, además, inmediatamente después de
 * cada cambio, para que el resumen y el gráfico acompañen la acción.
 * (Es polling, no push: ver la nota en docs/03-modulos.md.)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cartonesApi, sorteosApi } from '../../api/endpoints';
import ResumenEstados from '../../components/ResumenEstados';
import { Ganadores, RankingCartones } from '../../components/ResultadoSorteo';
import { Alerta, Cargando, EstadoBadge, Progreso, Vacio } from '../../components/ui';

const REFRESCO_MS = 15000;

export default function SorteoDetalle() {
  const { id } = useParams();
  const [datos, setDatos] = useState(null);       // GET /sorteos/:id
  const [cartones, setCartones] = useState(null); // GET /sorteos/:id/cartones
  const [vendedor, setVendedor] = useState('');   // filtro
  const [pestania, setPestania] = useState('cartones');
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const timer = useRef(null);

  /** Trae sorteo + cartones del filtro actual. */
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const [d, c] = await Promise.all([
          sorteosApi.obtener(id),
          sorteosApi.cartones(id, vendedor || null),
        ]);
        setDatos(d);
        setCartones(c);
      } catch (err) {
        setMensaje({ tipo: 'error', texto: err.message });
      } finally {
        setCargando(false);
      }
    },
    [id, vendedor]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Refresco automático: mantiene el resumen al día si otro operador cobra.
  useEffect(() => {
    timer.current = setInterval(() => cargar(true), REFRESCO_MS);
    return () => clearInterval(timer.current);
  }, [cargar]);

  /** Cambia el estado de un cartón y refresca el resumen al instante. */
  const cambiar = async (carton, cambios) => {
    setGuardando(carton.id);
    setMensaje(null);
    try {
      const r = await cartonesApi.actualizarEstado(carton.id, cambios);
      setMensaje({ tipo: 'exito', texto: r.mensaje });
      await cargar(true);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setGuardando(null);
    }
  };

  if (cargando) return <Cargando />;
  if (!datos) return <Alerta tipo="error">{mensaje?.texto || 'Sorteo no encontrado'}</Alerta>;

  const { sorteo } = datos;
  const editable = cartones?.editable;
  const lista = cartones?.cartones || [];

  return (
    <div className="space-y-5">
      {/* --- Encabezado --- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/sorteos" className="text-sm text-marca-600 hover:underline">
            ← Volver a sorteos
          </Link>
          <h1 className="text-xl font-bold text-slate-900">
            Sorteo N° {sorteo.numero} — {sorteo.nombre}
          </h1>
        </div>
        <EstadoBadge estado={sorteo.estado} />
      </div>

      {mensaje && <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

      {/* --- Datos del sorteo --- */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-slate-900">Datos del sorteo</h2>
        <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[
            ['Creado', new Date(sorteo.creado_en).toLocaleDateString()],
            ['Iniciado', sorteo.iniciado_en ? new Date(sorteo.iniciado_en).toLocaleDateString() : '—'],
            ['Finalizado', sorteo.finalizado_en ? new Date(sorteo.finalizado_en).toLocaleDateString() : '—'],
            ['Cartones', `${sorteo.cartones_vendidos} / ${sorteo.cartones_objetivo}`],
            ['Números por cartón', sorteo.numeros_por_carton],
            ['Rango', `${sorteo.rango_min} a ${sorteo.rango_max}`],
            ['Precio del cartón', `$ ${Number(sorteo.precio_carton).toLocaleString()}`],
            ['Vendedores', datos.vendedores.length],
            ['Jornadas jugadas', datos.jornadas.length],
            ['Números salidos', datos.numeros_salidos.length],
            ['Ganadores', datos.total_ganadores],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>

        {sorteo.estado === 'EN_VENTA' && (
          <Progreso vendidos={sorteo.cartones_vendidos} objetivo={sorteo.cartones_objetivo} />
        )}
      </div>

      {/* --- Resumen visual (texto + gráfico) --- */}
      <div className="card">
        <ResumenEstados
          resumen={cartones?.resumen || datos.resumen}
          titulo={
            vendedor
              ? `Estado de los cartones — ${
                  datos.vendedores.find((v) => String(v.id) === String(vendedor))?.apellido || ''
                }`
              : 'Estado de los cartones del sorteo'
          }
        />
      </div>

      {/* --- Pestañas --- */}
      <div className="flex flex-wrap gap-2">
        {[
          ['cartones', `Cartones (${cartones?.total ?? 0})`],
          ['vendedores', `Vendedores (${datos.vendedores.length})`],
          ['ranking', 'Top 20'],
          ['resultado', `Ganadores (${datos.total_ganadores})`],
        ].map(([clave, texto]) => (
          <button
            key={clave}
            type="button"
            onClick={() => setPestania(clave)}
            className={pestania === clave ? 'btn-primary' : 'btn-secondary'}
          >
            {texto}
          </button>
        ))}
      </div>

      {/* --- Cartones, con filtro por vendedor --- */}
      {pestania === 'cartones' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label className="label" htmlFor="filtro-vendedor">Filtrar por vendedor</label>
              <select
                id="filtro-vendedor"
                className="input max-w-sm"
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
              >
                <option value="">Todos los vendedores</option>
                {datos.vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.apellido}, {v.nombre} — {v.cartones} cartones
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">se actualiza cada 15 s</span>
              <button type="button" className="btn-secondary" onClick={() => cargar()}>
                Actualizar
              </button>
            </div>
          </div>

          {!editable && (
            <Alerta tipo="info">
              El sorteo está en estado {sorteo.estado}: los cartones se pueden consultar pero ya no
              se modifican.
            </Alerta>
          )}

          {lista.length === 0 ? (
            <Vacio>No hay cartones para este filtro.</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Cartón</th>
                    <th className="th">Jugador</th>
                    <th className="th">Vendedor</th>
                    <th className="th">Aciertos</th>
                    <th className="th">Pago</th>
                    <th className="th">Habilitado</th>
                    {editable && <th className="th text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lista.map((c) => (
                    <tr key={c.id} className={guardando === c.id ? 'opacity-50' : 'hover:bg-slate-50'}>
                      <td className="td font-medium text-slate-900">
                        {c.codigo}
                        {c.estado === 'GANADOR' && (
                          <span className="ml-2 align-middle">
                            <EstadoBadge estado="GANADOR" />
                          </span>
                        )}
                      </td>
                      <td className="td">
                        {c.jugador_apellido}, {c.jugador_nombre}
                        <span className="block text-xs text-slate-500">DNI {c.jugador_dni}</span>
                      </td>
                      <td className="td text-slate-600">{c.vendedor_apellido}</td>
                      <td className="td tabular-nums">
                        {c.aciertos}/{c.cantidad_numeros}
                      </td>
                      <td className="td"><EstadoBadge estado={c.estado_pago} /></td>
                      <td className="td">
                        <span
                          className={`badge ${
                            c.habilitado
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {c.habilitado ? 'Sí' : 'No'}
                        </span>
                      </td>

                      {editable && (
                        <td className="td">
                          <div className="flex justify-end gap-2">
                            {c.estado_pago !== 'RENDIDO' && !c.habilitado && (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={guardando === c.id}
                                onClick={() => cambiar(c, { estado_pago: 'RENDIDO' })}
                              >
                                Rendido
                              </button>
                            )}
                            {!c.habilitado ? (
                              <button
                                type="button"
                                className="btn-success"
                                disabled={guardando === c.id}
                                title="Marca el cartón como pagado, lo habilita y avisa al jugador"
                                onClick={() => cambiar(c, { habilitado: true })}
                              >
                                Habilitar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={guardando === c.id}
                                title="Quita la habilitación y lo deja como rendido"
                                onClick={() => cambiar(c, { habilitado: false })}
                              >
                                Deshabilitar
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- Vendedores asociados --- */}
      {pestania === 'vendedores' && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Vendedores de este sorteo</h2>
          {datos.vendedores.length === 0 ? (
            <Vacio>Todavía no hay cartones vendidos.</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Vendedor</th>
                    <th className="th">Teléfono</th>
                    <th className="th">Cartones</th>
                    <th className="th">Impagos</th>
                    <th className="th">Rendidos</th>
                    <th className="th">Pagados</th>
                    <th className="th text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {datos.vendedores.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="td font-medium text-slate-900">
                        {v.apellido}, {v.nombre}
                        {!v.vendedor_habilitado && (
                          <span className="ml-2 badge bg-rose-100 text-rose-700">inhabilitado</span>
                        )}
                      </td>
                      <td className="td text-slate-600">{v.telefono}</td>
                      <td className="td font-bold tabular-nums">{v.cartones}</td>
                      <td className="td tabular-nums text-rose-700">{v.impagos}</td>
                      <td className="td tabular-nums text-amber-700">{v.rendidos}</td>
                      <td className="td tabular-nums text-emerald-700">{v.pagados}</td>
                      <td className="td text-right">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setVendedor(String(v.id));
                            setPestania('cartones');
                          }}
                        >
                          Ver cartones
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pestania === 'ranking' && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Top 20 cartones</h2>
          <RankingCartones ranking={datos.ranking} />
        </div>
      )}

      {pestania === 'resultado' && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Ganadores</h2>
          <Ganadores ganadores={datos.ganadores} numerosSalidos={datos.numeros_salidos} />
        </div>
      )}
    </div>
  );
}
