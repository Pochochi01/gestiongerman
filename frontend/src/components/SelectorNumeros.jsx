/**
 * Grilla para elegir los numeros del carton.
 * Limita la seleccion a `cantidad` (hasta 10, definido por el administrador).
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">
          Seleccionados: <span className={completo ? 'text-emerald-600' : 'text-bingo-600'}>{valor.length}</span>{' '}
          de {cantidad}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={aleatorio}>
            Al azar
          </button>
          <button type="button" className="btn-secondary" onClick={() => onChange([])}>
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
              className={`aspect-square rounded-lg text-sm font-semibold ring-1 transition
                ${
                  elegido
                    ? 'bg-bingo-600 text-white ring-bingo-700'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-bingo-50 disabled:opacity-40 disabled:hover:bg-white'
                }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {valor.length > 0 && (
        <p className="text-sm text-slate-600">
          Tu carton: <span className="font-semibold">{[...valor].sort((a, b) => a - b).join(' - ')}</span>
        </p>
      )}
    </div>
  );
}
