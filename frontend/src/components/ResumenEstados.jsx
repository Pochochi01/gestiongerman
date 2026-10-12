/**
 * Resumen visual de la distribución de estados de pago de los cartones.
 *
 * Forma elegida: **barra apilada horizontal** (parte-de-todo). Una torta queda
 * descartada porque los tres valores suelen estar cerca y los sectores pasan a
 * ser imposibles de comparar.
 *
 * Colores: paleta de ESTADO (no categórica), que es fija y reservada:
 *   impago -> critical, rendido -> warning, pagado -> good.
 * Son sub-3:1 de contraste sobre blanco en el caso del amarillo, así que
 * ningún color lleva significado solo: cada uno va acompañado de su etiqueta y
 * su número, y abajo está la tabla con los mismos datos.
 */

/** Paleta de estado, fija. No se reutiliza para series. */
const ESTADOS = [
  { clave: 'impagos', etiqueta: 'Impagos', color: '#d03b3b', ayuda: 'El vendedor todavía no rindió' },
  { clave: 'rendidos', etiqueta: 'Rendidos', color: '#fab219', ayuda: 'Rindió, falta que el admin habilite' },
  { clave: 'pagados', etiqueta: 'Pagados', color: '#0ca30c', ayuda: 'Cobrado y habilitado' },
];

const pct = (parte, total) => (total > 0 ? (parte / total) * 100 : 0);

export default function ResumenEstados({ resumen, titulo = 'Estado de los cartones' }) {
  const total = Number(resumen?.total || 0);
  const datos = ESTADOS.map((e) => ({ ...e, valor: Number(resumen?.[e.clave] || 0) }));
  const conValor = datos.filter((d) => d.valor > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{titulo}</h3>
        <p className="text-sm text-slate-500">
          <span className="text-2xl font-bold tabular-nums text-slate-900">{total}</span> cartones
        </p>
      </div>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Todavía no hay cartones vendidos.
        </p>
      ) : (
        <>
          {/* --- Barra apilada: distribución --- */}
          <div
            className="flex h-7 w-full overflow-hidden rounded-lg bg-slate-100"
            role="img"
            aria-label={`Distribución: ${datos.map((d) => `${d.valor} ${d.etiqueta}`).join(', ')}`}
          >
            {conValor.map((d, i) => (
              <div
                key={d.clave}
                className="relative h-full"
                style={{
                  width: `${pct(d.valor, total)}%`,
                  background: d.color,
                  // 2px de separación entre segmentos, con el color de la superficie.
                  marginLeft: i === 0 ? 0 : 2,
                }}
                title={`${d.etiqueta}: ${d.valor} (${pct(d.valor, total).toFixed(0)}%)`}
              >
                {/* Etiqueta directa sólo si el segmento da el ancho */}
                {pct(d.valor, total) >= 12 && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-sm">
                    {d.valor}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* --- Texto: cantidad por estado (el color nunca va solo) --- */}
          <dl className="grid gap-3 sm:grid-cols-3">
            {datos.map((d) => (
              <div key={d.clave} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <span
                    className="h-3 w-3 shrink-0 rounded ring-1 ring-black/10"
                    style={{ background: d.color }}
                  />
                  {d.etiqueta}
                </dt>
                <dd className="mt-1">
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{d.valor}</span>
                  <span className="ml-2 text-sm text-slate-500">
                    {pct(d.valor, total).toFixed(0)}%
                  </span>
                </dd>
                <dd className="mt-0.5 text-xs text-slate-500">{d.ayuda}</dd>
              </div>
            ))}
          </dl>

          {/* --- Barras por estado: magnitudes comparables --- */}
          <div className="space-y-2">
            {datos.map((d) => (
              <div key={d.clave} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-medium text-slate-600">{d.etiqueta}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-r bg-slate-100">
                  <div
                    className="h-full rounded-r"
                    style={{ width: `${pct(d.valor, total)}%`, background: d.color }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-slate-700">
                  {d.valor}
                </span>
              </div>
            ))}
          </div>

          {/* --- Datos secundarios --- */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-200 pt-3 text-sm text-slate-600">
            <span>
              Habilitados: <span className="font-semibold text-slate-900">{resumen.habilitados}</span>
            </span>
            {resumen.ganadores > 0 && (
              <span>
                Ganadores: <span className="font-semibold text-slate-900">{resumen.ganadores}</span>
              </span>
            )}
            {resumen.anulados > 0 && (
              <span>
                Anulados: <span className="font-semibold text-slate-900">{resumen.anulados}</span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
