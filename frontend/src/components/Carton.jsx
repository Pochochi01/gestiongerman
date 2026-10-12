/**
 * Cartón del jugador dibujado como un cartón de bingo tradicional:
 * grilla de 3 filas x 10 columnas.
 *
 * - Los casilleros con número llevan un fondo suave (crema) y texto oscuro,
 *   para que el número se lea sin esfuerzo.
 * - Los casilleros sin número quedan en blanco.
 * - Los números que ya salieron se marcan en verde.
 *
 * La ubicación de cada número la decide el backend al crear el cartón y queda
 * guardada en `carton_numeros.celda`, así el cartón siempre se ve igual.
 */
import { EstadoBadge } from './ui';

export const FILAS = 3;
export const COLUMNAS = 10;
export const CELDAS = FILAS * COLUMNAS;

/**
 * Arma la grilla a partir de `[{ numero, celda }]`.
 * Si un cartón viejo no tiene `celda`, se ubica correlativo.
 */
export function construirGrilla(disposicion = [], numerosSalidos = [], celdas = CELDAS) {
  const salidos = new Set(numerosSalidos.map(Number));
  const porCelda = new Map();
  disposicion.forEach((d, i) => porCelda.set(Number(d.celda) || i + 1, Number(d.numero)));

  return Array.from({ length: celdas }, (_, i) => {
    const numero = porCelda.get(i + 1) ?? null;
    return { celda: i + 1, numero, salio: numero !== null && salidos.has(numero) };
  });
}

/** Grilla sola, reutilizable (detalle, listados, impresión). */
export function GrillaCarton({ grilla = [], columnas = COLUMNAS, compacto = false }) {
  return (
    <div className="overflow-x-auto">
      <div
        // Marco claro: los casilleros vacíos van en gris medio, así resaltan
        // como bloque macizo y los números quedan como islas claras.
        className={`grid gap-1 rounded-lg bg-slate-100 p-1 ring-1 ring-slate-300 ${
          compacto ? 'min-w-[340px]' : 'min-w-[420px]'
        }`}
        style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Cartón de bingo"
      >
        {grilla.map(({ celda, numero, salio }) => (
          <div
            key={celda}
            role="gridcell"
            aria-label={numero === null ? 'Casillero vacío' : `Número ${numero}${salio ? ', salió' : ''}`}
            className={`flex aspect-square items-center justify-center rounded font-bold tabular-nums
              ${compacto ? 'text-[11px] sm:text-xs' : 'text-sm sm:text-base'}
              ${
                numero === null
                  ? // Vacío: gris medio, bien marcado. No lleva texto, así que
                    // no hay problema de legibilidad y ordena la lectura.
                    'bg-slate-400'
                  : salio
                  ? // Remarcado pero legible: fondo verde claro y número en
                    // verde oscuro, con borde grueso. Mucho más contraste que
                    // texto blanco sobre verde saturado.
                    'bg-emerald-200 text-emerald-900 ring-2 ring-emerald-600 font-extrabold'
                  : 'bg-amber-50 text-slate-900'
              }`}
          >
            {numero ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Carton({ carton, sorteo, numerosSalidos, compacto = false }) {
  // El detalle ya trae la grilla armada del backend; en los listados se arma
  // acá a partir de la disposición.
  const grilla =
    carton.grilla ||
    construirGrilla(
      carton.disposicion || (carton.numeros || []).map((n) => (typeof n === 'object' ? n : { numero: n })),
      numerosSalidos || (carton.numeros || []).filter((n) => n?.salio).map((n) => n.numero)
    );

  const conNumero = grilla.filter((c) => c.numero !== null);
  const aciertos = conNumero.filter((c) => c.salio).length;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Cartón</p>
          <p className="text-lg font-bold text-slate-900">{carton.codigo}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <EstadoBadge estado={carton.estado_pago} />
          {carton.estado === 'GANADOR' && <EstadoBadge estado="GANADOR" />}
          {!carton.habilitado && carton.estado_pago === 'IMPAGO' && (
            <span className="text-xs text-rose-600">Pendiente de habilitación</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Sorteo</p>
          <p className="font-medium">
            N° {carton.sorteo_numero} - {carton.sorteo_nombre}
          </p>
          {sorteo && <p className="text-slate-500">Estado: {sorteo.estado}</p>}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Jugador</p>
          <p className="font-medium">
            {carton.jugador_apellido}, {carton.jugador_nombre}
          </p>
          <p className="text-slate-500">DNI {carton.jugador_dni}</p>
        </div>
      </div>

      {/* --- El cartón --- */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-500">Tu cartón</p>
          <p className="text-sm font-semibold text-slate-700">
            {aciertos} / {conNumero.length} aciertos
          </p>
        </div>

        <GrillaCarton grilla={grilla} compacto={compacto} />

        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-slate-300 bg-amber-50" /> Tu número
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-200 ring-1 ring-emerald-600" /> Ya salió
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-slate-400" /> Vacío
          </span>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-3 text-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Vendedor</p>
        <p className="font-medium">
          {carton.vendedor_apellido}, {carton.vendedor_nombre}
        </p>
        <p className="text-slate-500">Celular: {carton.vendedor_telefono}</p>
      </div>

      {!carton.habilitado && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
          Una vez que el vendedor rinda cuentas en un plazo de 24 hs se habilita el cartón.
          Si no recibe mensaje de habilitado, contacte al vendedor.
        </p>
      )}
    </div>
  );
}
