/**
 * Piezas para mostrar el resultado de un sorteo: los ganadores (con jugador,
 * vendedor y cartón) y el ranking de los 20 cartones con más aciertos.
 */
import { GrillaCarton, construirGrilla } from './Carton';
import { EstadoBadge, Vacio } from './ui';

/** Ganadores del sorteo, con el cartón dibujado. */
export function Ganadores({ ganadores = [], numerosSalidos = [], compacto = false }) {
  if (ganadores.length === 0) {
    return <Vacio>Todavía no hay cartones ganadores en este sorteo.</Vacio>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-700">
        {ganadores.length === 1
          ? 'Hubo 1 cartón ganador'
          : `Hubo ${ganadores.length} cartones ganadores (el premio se reparte)`}
      </p>

      {ganadores.map((g) => (
        <div
          key={g.id}
          className="space-y-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-300"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-amber-700">Cartón ganador</p>
              <p className="text-lg font-bold text-slate-900">{g.codigo}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <EstadoBadge estado="GANADOR" />
              <EstadoBadge estado={g.estado_pago} />
            </div>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Jugador</p>
              <p className="font-semibold text-slate-900">
                {g.jugador_apellido}, {g.jugador_nombre}
              </p>
              <p className="text-slate-600">DNI {g.jugador_dni}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Vendedor</p>
              <p className="font-semibold text-slate-900">
                {g.vendedor_apellido}, {g.vendedor_nombre}
              </p>
              <p className="text-slate-600">{g.vendedor_telefono}</p>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Completó el cartón el <span className="font-semibold">{g.gano_en}</span>
            {g.gano_en_loteria && ` · ${g.gano_en_loteria}`}
            {g.gano_en_sorteo && ` · sorteo N° ${g.gano_en_sorteo}`}
          </p>

          {!compacto && (
            <GrillaCarton
              grilla={construirGrilla(
                (g.numeros || []).map((n) => ({ numero: n })),
                numerosSalidos.length ? numerosSalidos : g.numeros
              )}
              compacto
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Ranking de los cartones que más números van acertando. */
export function RankingCartones({ ranking = [], destacarJugadorId = null, limite = 20 }) {
  if (ranking.length === 0) return <Vacio>Todavía no hay cartones en este sorteo.</Vacio>;

  const filas = ranking.slice(0, limite);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="th w-12">#</th>
            <th className="th">Cartón</th>
            <th className="th">Jugador</th>
            <th className="th">Vendedor</th>
            <th className="th">Aciertos</th>
            <th className="th">Falta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((r) => {
            const mio = destacarJugadorId && r.jugador_id === destacarJugadorId;
            return (
              <tr
                key={r.id}
                className={mio ? 'bg-marca-50 font-medium' : r.puesto <= 3 ? 'bg-amber-50/60' : ''}
              >
                <td className="td font-bold text-slate-500">{r.puesto}</td>
                <td className="td font-medium text-slate-900">
                  {r.codigo}
                  {r.estado === 'GANADOR' && (
                    <span className="ml-2 align-middle">
                      <EstadoBadge estado="GANADOR" />
                    </span>
                  )}
                </td>
                <td className="td">
                  {r.jugador_apellido}, {r.jugador_nombre}
                  {mio && <span className="ml-2 text-xs text-marca-700">(vos)</span>}
                </td>
                <td className="td text-slate-600">{r.vendedor_apellido}</td>
                <td className="td">
                  <span className="inline-flex items-center gap-2">
                    <span className="font-bold tabular-nums text-slate-900">
                      {r.aciertos}/{r.cantidad_numeros}
                    </span>
                    <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 sm:block">
                      <span
                        className="block h-full rounded-full bg-emerald-500"
                        style={{ width: `${(r.aciertos / r.cantidad_numeros) * 100}%` }}
                      />
                    </span>
                  </span>
                </td>
                <td className="td tabular-nums text-slate-600">{r.faltan}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
