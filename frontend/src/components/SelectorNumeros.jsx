/**
 * Grilla para elegir los numeros del carton.
 * Limita la seleccion a `cantidad` (hasta 10, definido por el administrador).
 *
 * Cada numero es un boton de dos estados, no un boton de accion: lleva
 * `aria-pressed` para que el lector de pantalla diga si esta elegido o no. El
 * contador vive en una region `aria-live`, de modo que al tocar un numero se
 * anuncia "7 de 10 elegidos" sin tener que recorrer la grilla para contarlos.
 */
export default function SelectorNumeros({ min = 1, max = 90, cantidad = 10, valor = [], onChange }) {
  const numeros = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const completo = valor.length >= cantidad;

  const alternar = (n) => {
    if (valor.includes(n)) onChange(valor.filter((x) => x !== n));
    else if (!completo) onChange([...valor, n]);
  };

  const aleatorio = () => {
    const disponibles = [...numeros];
    const elegidos = [];
    while (elegidos.length < cantidad && disponibles.length) {
      elegidos.push(...disponibles.splice(Math.floor(Math.random() * disponibles.length), 1));
    }
    onChange(elegidos.sort((a, b) => a - b));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* aria-live polite: avisa el cambio al terminar la frase en curso. */}
        <p className="text-sm font-medium text-slate-700" aria-live="polite">
          Elegidos:{' '}
          <span className={`tabular font-bold ${completo ? 'text-emerald-700' : 'text-marca-700'}`}>
            {valor.length}
          </span>{' '}
          de <span className="tabular">{cantidad}</span>
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={aleatorio}>
            Al azar
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onChange([])}
            disabled={valor.length === 0}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {numeros.map((n) => {
          const elegido = valor.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => alternar(n)}
              disabled={!elegido && completo}
              aria-pressed={elegido}
              aria-label={`Número ${n}`}
              className={`tabular grid aspect-square min-h-touch place-items-center rounded-lg text-sm font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-1 ${
                elegido
                  ? 'bg-marca-600 text-white ring-marca-700'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-marca-50 disabled:opacity-40 disabled:hover:bg-white'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {valor.length > 0 && (
        <p className="text-sm text-slate-600">
          Su cartón:{' '}
          <span className="tabular font-semibold text-slate-900">
            {[...valor].sort((a, b) => a - b).join(' · ')}
          </span>
        </p>
      )}

      {completo && (
        <p className="text-sm text-emerald-800">
          Ya eligió los {cantidad} números. Para cambiar uno, tóquelo para quitarlo y elija otro.
        </p>
      )}
    </div>
  );
}
