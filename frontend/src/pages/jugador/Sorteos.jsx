/**
 * Historial del jugador: los últimos 10 sorteos en los que participó, con
 * todos sus datos — ganadores (jugador, vendedor y cartón), el ranking de los
 * 20 cartones con más aciertos, sus propios cartones y la grilla de posiciones
 * de cada sorteo diario.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sorteosApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { GrillaCarton, construirGrilla } from '../../components/Carton';
import ListaSorteos from '../../components/ListaSorteos';
import { Ganadores, RankingCartones } from '../../components/ResultadoSorteo';
import { Alerta, Cargando, EstadoBadge, Progreso, Vacio } from '../../components/ui';

const LIMITE = 10;

export default function Sorteos() {
  const { perfil } = useAuth();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null); // sorteo_id del detalle desplegado
  const [pestania, setPestania] = useState('resultado');

  useEffect(() => {
    sorteosApi
      .historial(LIMITE)
      .then((d) => {
        setDatos(d);
        if (d.sorteos.length) setAbierto(d.sorteos[0].sorteo.id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <Cargando />;
  if (error) return <Alerta tipo="error">{error}</Alerta>;
  if (!datos?.sorteos?.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Mis sorteos</h1>
        <Vacio>
          Todavía no participaste de ningún sorteo.{' '}
          <Link to="/jugador/elegir" className="text-bingo-600 hover:underline">
            Elegir mis números
          </Link>
        </Vacio>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Mis sorteos</h1>
        <p className="text-sm text-slate-600">
          Los últimos {LIMITE} sorteos en los que participaste ({datos.total} en total).
        </p>
      </div>

      {datos.sorteos.map((s) => {
        const sorteo = s.sorteo;
        const esteAbierto = abierto === sorteo.id;
        const gane = s.ganadores.some((g) => g.jugador_id === perfil?.id);

        return (
          <div key={sorteo.id} className="card space-y-3">
            {/* Cabecera del sorteo */}
            <button
              type="button"
              onClick={() => setAbierto(esteAbierto ? null : sorteo.id)}
              className="flex w-full flex-wrap items-center gap-3 text-left"
            >
              <span className="text-slate-400">{esteAbierto ? '▼' : '▶'}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900">
                  Sorteo N° {sorteo.numero} — {sorteo.nombre}
                </p>
                <p className="text-sm text-slate-500">
                  {s.participacion.cartones} cartón(es) tuyo(s) · mejor acierto{' '}
                  {s.participacion.mejor_acierto ?? 0}/{sorteo.numeros_por_carton} ·{' '}
                  {s.jornadas.length} jornada(s)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gane && (
                  <span className="badge bg-amber-200 font-bold text-amber-900 ring-1 ring-amber-500">
                    ¡Ganaste!
                  </span>
                )}
                <span className="badge bg-slate-100 text-slate-700">
                  {s.total_ganadores} ganador(es)
                </span>
                <EstadoBadge estado={sorteo.estado} />
              </div>
            </button>

            {esteAbierto && (
              <div className="space-y-4 border-t border-slate-200 pt-3">
                {/* Datos del sorteo */}
                <dl className="grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Cartones</dt>
                    <dd className="font-medium">
                      {sorteo.cartones_vendidos} / {sorteo.cartones_objetivo}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Números por cartón</dt>
                    <dd className="font-medium">{sorteo.numeros_por_carton}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Rango</dt>
                    <dd className="font-medium">
                      {sorteo.rango_min} a {sorteo.rango_max}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Números salidos</dt>
                    <dd className="font-medium">{s.numeros_salidos.length}</dd>
                  </div>
                </dl>

                {sorteo.estado === 'EN_VENTA' && (
                  <Progreso vendidos={sorteo.cartones_vendidos} objetivo={sorteo.cartones_objetivo} />
                )}

                {/* Pestañas */}
                <div className="flex flex-wrap gap-2">
                  {[
                    ['resultado', 'Resultado'],
                    ['ranking', 'Top 20 cartones'],
                    ['mis', `Mis cartones (${s.mis_cartones.length})`],
                    ['sorteos', 'Sorteos diarios'],
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

                {pestania === 'resultado' && (
                  <Ganadores ganadores={s.ganadores} numerosSalidos={s.numeros_salidos} />
                )}

                {pestania === 'ranking' && (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">
                      Los 20 cartones que más números van acertando en este sorteo.
                    </p>
                    <RankingCartones ranking={s.ranking} destacarJugadorId={perfil?.id} />
                  </div>
                )}

                {pestania === 'mis' && (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {s.mis_cartones.length === 0 ? (
                      <Vacio>No tenés cartones en este sorteo.</Vacio>
                    ) : (
                      s.mis_cartones.map((c) => (
                        <Link
                          key={c.id}
                          to={`/jugador/cartones/${c.id}`}
                          className="space-y-2 rounded-lg p-3 ring-1 ring-slate-200 hover:ring-bingo-300"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">{c.codigo}</span>
                            <span className="text-sm text-slate-500">
                              {c.aciertos}/{c.cantidad_numeros}
                            </span>
                          </div>
                          <GrillaCarton
                            grilla={construirGrilla(
                              c.disposicion || (c.numeros || []).map((n) => ({ numero: n })),
                              s.numeros_salidos
                            )}
                            compacto
                          />
                        </Link>
                      ))
                    )}
                  </div>
                )}

                {pestania === 'sorteos' && (
                  <ListaSorteos
                    jornadas={s.jornadas}
                    misNumeros={s.mis_cartones.flatMap((c) => c.numeros || [])}
                    titulo="Sorteos de este bingo"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
