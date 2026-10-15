/**
 * Piezas de interfaz reutilizables de DGG Gestion.
 *
 * `Campo` es la pieza central: cablea la etiqueta, el texto de ayuda, el
 * mensaje de error y los atributos aria de un campo en un unico lugar. Los
 * formularios la usan en lugar de repetir label + input sueltos, que es de
 * donde venian las etiquetas sin asociar y los errores que no se anunciaban.
 */
import { forwardRef, useId } from 'react';

/* ==========================================================================
   Iconos
   Dibujados como SVG y no con glifos de texto: un caracter "x" o un emoji no
   escala con el tipo, no hereda el grosor de trazo y el lector de pantalla lo
   lee en voz alta como palabra.
   ========================================================================== */

function IconoCerrar(props) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M5.5 5.5l9 9m0-9l-9 9" />
    </svg>
  );
}

function IconoError(props) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a.9.9 0 01.9.9v3.7a.9.9 0 01-1.8 0V6.9A.9.9 0 0110 6zm0 7.3a1 1 0 110 2 1 1 0 010-2z"
      />
    </svg>
  );
}

/* ==========================================================================
   Avisos
   ========================================================================== */

/**
 * Mensaje de estado.
 *
 * role="alert" en los errores y avisos: interrumpe al lector de pantalla para
 * anunciarlos. Los mensajes de exito e informacion usan role="status", que
 * espera a que el lector termine la frase en curso en lugar de cortarla.
 */
export function Alerta({ tipo = 'info', children, onCerrar, className = '' }) {
  if (!children) return null;

  const estilos = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    exito: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    error: 'bg-rose-50 text-rose-900 ring-rose-200',
    aviso: 'bg-amber-50 text-amber-900 ring-amber-200',
  }[tipo];

  const urgente = tipo === 'error' || tipo === 'aviso';

  return (
    <div
      role={urgente ? 'alert' : 'status'}
      aria-live={urgente ? 'assertive' : 'polite'}
      className={`flex items-start gap-3 rounded-lg p-3 text-sm ring-1 ${estilos} ${className}`}
    >
      <div className="min-w-0 flex-1 whitespace-pre-line break-words">{children}</div>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el mensaje"
          className="-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <IconoCerrar className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Indicador de carga. role="status" para que se anuncie sin interrumpir. */
export function Cargando({ texto = 'Cargando...' }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-slate-600">
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-marca-600"
      />
      {texto}
    </div>
  );
}

/** Estado vacio. Recibe una accion para que no sea un callejon sin salida. */
export function Vacio({ children, accion }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 p-8 text-center">
      <p className="text-sm text-slate-600">{children}</p>
      {accion && <div className="mt-4 flex justify-center">{accion}</div>}
    </div>
  );
}

/* ==========================================================================
   Campos de formulario
   ========================================================================== */

/**
 * Resumen de los errores del formulario, arriba de todo.
 *
 * No reemplaza a los mensajes que van junto a cada campo: los dos conviven. El
 * resumen existe porque llevar el foco al primer campo invalido solo informa de
 * uno, y quien usa un lector de pantalla no se entera de que hay otros tres mas
 * abajo. Cada renglon es un enlace al campo que lo causa.
 *
 * El contenedor es enfocable (`tabIndex={-1}`) para que el formulario pueda
 * mandarle el foco despues de un envio fallido.
 */
export const ResumenErrores = forwardRef(function ResumenErrores({ items = [] }, ref) {
  if (items.length === 0) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="resumen-errores-titulo"
      className="rounded-lg bg-rose-50 p-4 ring-1 ring-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
    >
      <h2
        id="resumen-errores-titulo"
        className="flex items-center gap-2 text-sm font-semibold text-rose-900"
      >
        <IconoError className="h-4 w-4 shrink-0" />
        {items.length === 1
          ? 'Hay un dato para corregir'
          : `Hay ${items.length} datos para corregir`}
      </h2>
      <ul className="mt-2 space-y-1 text-sm text-rose-900">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className="font-medium underline decoration-rose-400 hover:decoration-rose-700"
              onClick={(e) => {
                // El ancla sola deja el foco en el enlace; para corregir hay
                // que estar dentro del campo.
                e.preventDefault();
                document.getElementById(it.id)?.focus();
              }}
            >
              {it.etiqueta}
            </a>
            : {it.mensaje}
          </li>
        ))}
      </ul>
    </div>
  );
});

/**
 * Un campo completo: etiqueta asociada, control, ayuda y error.
 *
 * Genera los id con useId, de modo que el htmlFor de la etiqueta y el
 * aria-describedby del control siempre coinciden sin tener que inventar
 * nombres a mano. El error llega por la prop `error` y el campo queda marcado
 * con aria-invalid, que es lo que lee el lector de pantalla; el borde rojo es
 * el refuerzo visual, no la unica señal.
 *
 *   <Campo etiqueta="Apellido" requerido value={...} onChange={...} />
 *   <Campo etiqueta="Sorteo" as="select" error={e}><option /></Campo>
 */
export function Campo({
  etiqueta,
  requerido = false,
  error,
  ayuda,
  as = 'input',
  className = '',
  contenedorClassName = '',
  children,
  id: idExterno,
  ...resto
}) {
  const generado = useId();
  const id = idExterno || `campo-${generado}`;
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;

  const descripto = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ');
  const Control = as;
  const claseBase = as === 'select' ? 'select' : as === 'textarea' ? 'textarea' : 'input';

  return (
    <div className={contenedorClassName}>
      <label className="label" htmlFor={id}>
        {etiqueta}
        {requerido && (
          <>
            {' '}
            <span className="text-rose-600" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(obligatorio)</span>
          </>
        )}
      </label>

      <Control
        id={id}
        className={`${claseBase} ${className}`}
        required={requerido}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={descripto || undefined}
        {...resto}
      >
        {children}
      </Control>

      {ayuda && (
        <p className="hint" id={idAyuda}>
          {ayuda}
        </p>
      )}
      {error && (
        <p className="error-texto" id={idError}>
          <IconoError className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Envoltura para un control propio (por ejemplo el selector de numeros), que
 * no es un input y por lo tanto no puede recibir una etiqueta con htmlFor.
 * Usa fieldset/legend, que es la forma correcta de etiquetar un grupo.
 */
export function GrupoCampo({ etiqueta, ayuda, error, children, className = '' }) {
  const generado = useId();
  const idAyuda = `grupo-${generado}-ayuda`;
  const idError = `grupo-${generado}-error`;
  const descripto = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ');

  return (
    <fieldset className={className} aria-describedby={descripto || undefined}>
      <legend className="legend">{etiqueta}</legend>
      {ayuda && (
        <p className="hint mb-3" id={idAyuda}>
          {ayuda}
        </p>
      )}
      {children}
      {error && (
        <p className="error-texto" id={idError} role="alert">
          <IconoError className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}

/** Casilla de verificacion con su etiqueta clicable. */
export function Casilla({ etiqueta, ayuda, id: idExterno, ...resto }) {
  const generado = useId();
  const id = idExterno || `casilla-${generado}`;
  const idAyuda = `${id}-ayuda`;

  return (
    <div>
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          id={id}
          className="checkbox mt-0.5"
          aria-describedby={ayuda ? idAyuda : undefined}
          {...resto}
        />
        <label htmlFor={id} className="text-sm text-slate-700">
          {etiqueta}
        </label>
      </div>
      {ayuda && (
        <p className="hint ml-7" id={idAyuda}>
          {ayuda}
        </p>
      )}
    </div>
  );
}

/* ==========================================================================
   Datos
   ========================================================================== */

/**
 * Etiqueta de estado.
 *
 * El sistema guarda los estados como constantes (EN_VENTA, CONFIGURACION),
 * pero eso no es lo que tiene que leer un vendedor en la pantalla: se traduce
 * a lenguaje llano y la constante queda en title por si hace falta rastrearla.
 */
const TEXTO_ESTADO = {
  CONFIGURACION: 'En configuración',
  EN_VENTA: 'En venta',
  EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
  IMPAGO: 'Impago',
  RENDIDO: 'Rendido',
  PAGADO: 'Pagado',
  ACTIVO: 'Activo',
  GANADOR: 'Ganador',
  ANULADO: 'Anulado',
  ENVIADO: 'Enviado',
  PENDIENTE: 'Pendiente',
  ERROR: 'Con error',
};

const ESTILO_ESTADO = {
  CONFIGURACION: 'bg-slate-100 text-slate-700',
  EN_VENTA: 'bg-sky-100 text-sky-800',
  EN_CURSO: 'bg-emerald-100 text-emerald-800',
  FINALIZADO: 'bg-violet-100 text-violet-800',
  CANCELADO: 'bg-rose-100 text-rose-800',
  IMPAGO: 'bg-rose-100 text-rose-800',
  RENDIDO: 'bg-amber-100 text-amber-900',
  PAGADO: 'bg-emerald-100 text-emerald-800',
  ACTIVO: 'bg-sky-100 text-sky-800',
  GANADOR: 'bg-amber-100 text-amber-900',
  ANULADO: 'bg-slate-200 text-slate-700',
  ENVIADO: 'bg-emerald-100 text-emerald-800',
  PENDIENTE: 'bg-amber-100 text-amber-900',
  ERROR: 'bg-rose-100 text-rose-800',
};

export function EstadoBadge({ estado }) {
  if (!estado) return null;
  const estilo = ESTILO_ESTADO[estado] || 'bg-slate-100 text-slate-700';
  const texto = TEXTO_ESTADO[estado] || estado;
  return (
    <span className={`badge ${estilo}`} title={estado}>
      {texto}
    </span>
  );
}

/** Barra de progreso de la venta de cartones. */
export function Progreso({ vendidos, objetivo }) {
  const porcentaje = objetivo > 0 ? Math.min(100, Math.round((vendidos / objetivo) * 100)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap justify-between gap-x-3 text-xs font-medium text-slate-600">
        <span className="tabular">
          {vendidos} de {objetivo} cartones
        </span>
        <span className="tabular">{porcentaje}%</span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Venta de cartones: ${vendidos} de ${objetivo}`}
      >
        <div
          className="h-full rounded-full bg-marca-600 transition-all"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}
