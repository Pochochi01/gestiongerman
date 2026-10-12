/**
 * Lista desplegable de sorteos diarios, para que el jugador controle la
 * quiniela contra su cartón.
 *
 * Cada sorteo se abre en un acordeón (`<details>`) y muestra la grilla de
 * posiciones: una columna con los puestos 1 a 20 y, al lado, el número que
 * salió en cada uno. Las posiciones cuyo número está en el cartón del jugador
 * quedan remarcadas.
 */
import { useMemo } from 'react';

export const POSICIONES = 20;

/** Dos últimas cifras formateadas a dos dígitos. */
const dosCifras = (n) => String(n).padStart(2, '0');

/**
 * Arma las 20 filas del sorteo. Las posiciones sin cargar quedan vacías, así
 * se ve de un vistazo cuánto falta cargar.
 */
function filasDe(jornada, posiciones = POSICIONES) {
  const porPosicion = new Map();
  (jornada.extracciones || []).forEach((e, i) => porPosicion.set(e.posicion || i + 1, e));

  const total = Math.max(posiciones, ...[...porPosicion.keys(), 0]);
  return Array.from({ length: total }, (_, i) => {
    const posicion = i + 1;
    const e = porPosicion.get(posicion);
    return {
      posicion,
      valor: e?.valor_cargado ?? null,
      numero: e ? e.numero : null,
      cuenta: e ? e.cuenta !== false : true,
    };
  });
}

/** Un sorteo: cabecera con el resumen y la grilla al desplegarlo. */
function Sorteo({ jornada, misNumeros, abierto }) {
  const filas = useMemo(() => filasDe(jornada), [jornada]);
  const enMiCarton = useMemo(() => new Set((misNumeros || []).map(Number)), [misNumeros]);

  const cargadas = filas.filter((f) => f.numero !== null);
  const aciertos = cargadas.filter((f) => f.cuenta && enMiCarton.has(f.numero)).length;

  return (
    <details
      open={abierto}
      className="group rounded-lg border border-slate-200 bg-white open:ring-1 open:ring-bingo-200"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3 hover:bg-slate-50">
        <span className="text-slate-400 transition group-open:rotate-90" aria-hidden="true">
          ▶
        </span>
        <span className="font-semibold text-slate-900">{jornada.fecha}</span>
        {jornada.nombre && (
          <span className="badge bg-slate-100 text-slate-700">{jornada.nombre}</span>
        )}
        {jornada.numero_sorteo && (
          <span className="text-xs text-slate-500">sorteo N° {jornada.numero_sorteo}</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-slate-500">
            {cargadas.length}/{filas.length} cargados
          </span>
          {aciertos > 0 && (
            <span className="badge bg-emerald-200 font-bold text-emerald-900 ring-1 ring-emerald-600">
              {aciertos} {aciertos === 1 ? 'acierto' : 'aciertos'}
            </span>
          )}
        </span>
      </summary>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 grid grid-cols-[3rem_1fr] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Pos.</span>
          <span>Número</span>
        </div>

        <ol className="divide-y divide-slate-100">
          {filas.map((f) => {
            const esMio = f.numero !== null && f.cuenta && enMiCarton.has(f.numero);
            return (
              <li
                key={f.posicion}
                className={`grid grid-cols-[3rem_1fr] items-center gap-2 px-1 py-1.5 ${
                  esMio ? 'bg-emerald-50' : ''
                }`}
              >
                <span className="text-center text-sm font-semibold tabular-nums text-slate-500">
                  {f.posicion}
                </span>

                {f.numero === null ? (
                  <span className="text-sm text-slate-300">— sin cargar —</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    {/* Valor completo de la quiniela, con las dos últimas cifras destacadas */}
                    <span className="font-mono text-base tabular-nums text-slate-500">
                      {f.valor !== null && f.valor >= 100
                        ? String(f.valor).padStart(4, '0').slice(0, -2)
                        : ''}
                      <span
                        className={`rounded px-1 font-bold ${
                          esMio
                            ? 'bg-emerald-200 text-emerald-900 ring-2 ring-emerald-600'
                            : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        {dosCifras(f.numero)}
                      </span>
                    </span>

                    {esMio && (
                      <span className="text-xs font-semibold text-emerald-700">en tu cartón</span>
                    )}
                    {!f.cuenta && (
                      <span className="text-xs text-slate-400">(ya había salido)</span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}

export default function ListaSorteos({ jornadas = [], misNumeros = [], titulo = 'Sorteos' }) {
  if (jornadas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        Todavía no se cargó ningún sorteo.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {titulo && (
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {titulo} — toque uno para ver la grilla de posiciones
        </p>
      )}
      {/* El más reciente viene primero y se abre solo. */}
      {jornadas.map((j, i) => (
        <Sorteo key={j.jornada_id} jornada={j} misNumeros={misNumeros} abierto={i === 0} />
      ))}
    </div>
  );
}
