/** Piezas de interfaz reutilizables. */

export function Alerta({ tipo = 'info', children, onCerrar }) {
  if (!children) return null;
  const estilos = {
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
    exito: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    error: 'bg-rose-50 text-rose-800 ring-rose-200',
    aviso: 'bg-amber-50 text-amber-800 ring-amber-200',
  }[tipo];

  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg p-3 text-sm ring-1 ${estilos}`}>
      <div className="whitespace-pre-line">{children}</div>
      {onCerrar && (
        <button type="button" onClick={onCerrar} className="font-bold opacity-60 hover:opacity-100">
          x
        </button>
      )}
    </div>
  );
}

export function Cargando({ texto = 'Cargando...' }) {
  return (
    <div className="flex items-center gap-3 py-8 text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-bingo-600" />
      {texto}
    </div>
  );
}

export function Vacio({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function EstadoBadge({ estado }) {
  const mapa = {
    CONFIGURACION: 'bg-slate-100 text-slate-700',
    EN_VENTA: 'bg-sky-100 text-sky-700',
    EN_CURSO: 'bg-emerald-100 text-emerald-700',
    FINALIZADO: 'bg-violet-100 text-violet-700',
    CANCELADO: 'bg-rose-100 text-rose-700',
    IMPAGO: 'bg-rose-100 text-rose-700',
    RENDIDO: 'bg-amber-100 text-amber-800',
    PAGADO: 'bg-emerald-100 text-emerald-700',
    ACTIVO: 'bg-sky-100 text-sky-700',
    GANADOR: 'bg-amber-100 text-amber-800',
    ANULADO: 'bg-slate-200 text-slate-600',
    ENVIADO: 'bg-emerald-100 text-emerald-700',
    PENDIENTE: 'bg-amber-100 text-amber-800',
    ERROR: 'bg-rose-100 text-rose-700',
  };
  return <span className={`badge ${mapa[estado] || 'bg-slate-100 text-slate-700'}`}>{estado}</span>;
}

/** Barra de progreso de la venta de cartones. */
export function Progreso({ vendidos, objetivo }) {
  const porcentaje = objetivo > 0 ? Math.min(100, Math.round((vendidos / objetivo) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
        <span>
          {vendidos} de {objetivo} cartones
        </span>
        <span>{porcentaje}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-bingo-600 transition-all" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}
