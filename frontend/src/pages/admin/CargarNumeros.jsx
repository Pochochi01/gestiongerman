/**
 * Carga de los números del sorteo diario.
 *
 * El administrador los ingresa tal como salen en la quiniela (hasta 4 cifras)
 * y el sistema valida los cartones con las DOS ÚLTIMAS cifras: 1234 -> 34.
 *
 * Cada carga queda registrada como una jornada con la fecha, el nombre de la
 * lotería ('Nocturna') y el número de sorteo.
 */
import { useCallback, useEffect, useState } from 'react';
import { sorteosApi } from '../../api/endpoints';
import { Ganadores, RankingCartones } from '../../components/ResultadoSorteo';
import { Alerta, Cargando, EstadoBadge, Vacio } from '../../components/ui';

const LOTERIA = 'Nocturna';
const hoy = () => new Date().toISOString().slice(0, 10);

/** Separa el texto y traduce cada valor a su número de bingo. */
function interpretar(texto) {
  return String(texto || '')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((valor) => ({
      valor,
      numero: /^\d{1,4}$/.test(valor) ? Number(valor) % 100 : null,
      valido: /^\d{1,4}$/.test(valor),
    }));
}

export default function CargarNumeros() {
  const [datos, setDatos] = useState(null);
  const [fecha, setFecha] = useState(hoy());
  const [numeroSorteo, setNumeroSorteo] = useState('');
  const [entrada, setEntrada] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [avisando, setAvisando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await sorteosApi.vigente());
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const interpretados = interpretar(entrada);
  const invalidos = interpretados.filter((x) => !x.valido);
  const sorteo = datos?.sorteo;

  const enviar = async (e) => {
    e.preventDefault();
    setMensaje(null);
    setResultado(null);
    setEnviando(true);
    try {
      const r = await sorteosApi.cargarNumeros(
        sorteo.id,
        fecha,
        interpretados.map((x) => x.valor),
        numeroSorteo
      );
      setResultado(r);
      setEntrada('');
      setMensaje({
        tipo: r.finalizado ? 'exito' : r.cargados.length ? 'info' : 'aviso',
        texto: r.finalizado
          ? `Cartones completos: ${r.ganadores.map((g) => g.codigo).join(', ')}. El sorteo quedó FINALIZADO y se avisó a los ganadores.`
          : r.cargados.length
          ? `Se cargaron ${r.cargados.length} número(s) en la jornada del ${r.fecha} (${r.jornada.nombre}${
              r.jornada.numero_sorteo ? ` · sorteo N° ${r.jornada.numero_sorteo}` : ''
            }). Ningún cartón se completó todavía.`
          : 'No se cargó ningún número nuevo: todos quedaron ignorados (ver el detalle).',
      });
      cargar();
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.detalles
          ? `${err.message}: ${err.detalles.map((d) => d.mensaje).join(', ')}`
          : err.message,
      });
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <Cargando />;
  if (!sorteo) return <Vacio>No hay ningún sorteo vigente.</Vacio>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">
          Cargar números — sorteo N° {sorteo.numero}
        </h1>
        <EstadoBadge estado={sorteo.estado} />
      </div>

      {mensaje && <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

      {sorteo.estado !== 'EN_CURSO' ? (
        <Alerta tipo="aviso">
          {sorteo.estado === 'EN_VENTA'
            ? `El sorteo todavía está en venta: faltan ${sorteo.cartones_faltantes} cartones para poder cargar números.`
            : `El sorteo está en estado ${sorteo.estado}: no admite carga de números.`}
        </Alerta>
      ) : (
        <form onSubmit={enviar} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="fecha">Fecha del sorteo *</label>
              <input
                id="fecha"
                type="date"
                className="input"
                value={fecha}
                max={hoy()}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </div>
            {/* No es un campo: el valor es fijo. Un input de solo lectura
                prometia que se podia editar, y sacarlo del orden de tabulacion
                para desmentirlo escondia el dato del teclado. */}
            <div>
              <p className="label" id="etiqueta-quiniela">
                Quiniela
              </p>
              <p
                className="flex min-h-touch items-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200"
                aria-labelledby="etiqueta-quiniela"
              >
                {LOTERIA}
              </p>
              <p className="hint">Siempre se registra como {LOTERIA}.</p>
            </div>
            <div>
              <label className="label" htmlFor="numero_sorteo">N° de sorteo</label>
              <input
                id="numero_sorteo"
                type="text"
                inputMode="numeric"
                className="input"
                placeholder="9876"
                value={numeroSorteo}
                onChange={(e) => setNumeroSorteo(e.target.value.replace(/\D/g, '').slice(0, 8))}
              />
              <p className="hint">El de la quiniela de esa fecha.</p>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="numeros">
              Números de la quiniela — hasta 4 cifras cada uno *
            </label>
            <textarea
              id="numeros"
              rows={2}
              className="textarea font-mono"
              placeholder="1234 0078 5607 9041"
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              required
            />
            <p className="hint">
              Separados por espacio, coma o salto de línea. El sistema toma las{' '}
              <span className="font-semibold">dos últimas cifras</span> de cada uno para validar los
              cartones.
            </p>
          </div>

          {/* Vista previa: qué número de bingo sale de cada valor cargado */}
          {interpretados.length > 0 && (
            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Se va a cargar
              </p>
              <div className="flex flex-wrap gap-2">
                {interpretados.map((x, i) => (
                  <span
                    key={`${x.valor}-${i}`}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm ring-1 ${
                      x.valido
                        ? 'bg-white text-slate-700 ring-slate-300'
                        : 'bg-rose-50 text-rose-700 ring-rose-300'
                    }`}
                  >
                    <span className="font-mono">{x.valor}</span>
                    {x.valido ? (
                      <>
                        <span className="text-slate-500" aria-hidden="true">→</span>
                        <span className="sr-only">da el número</span>
                        <span className="font-bold text-marca-700">
                          {String(x.numero).padStart(2, '0')}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs">no válido</span>
                    )}
                  </span>
                ))}
              </div>
              {invalidos.length > 0 && (
                <p className="mt-2 text-xs font-medium text-rose-700">
                  Corrija los valores marcados: se admite de 1 a 4 cifras.
                </p>
              )}
            </div>
          )}

          <div className="btn-fila border-t border-slate-200 pt-4">
            <button
              type="submit"
              className="btn-primary"
              disabled={enviando || interpretados.length === 0 || invalidos.length > 0}
            >
              {enviando ? 'Guardando...' : 'Cargar y validar cartones'}
            </button>
          </div>
        </form>
      )}

      {/* Detalle de la última carga */}
      {resultado && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-900">Última carga</h2>
          <p className="text-sm text-slate-600">
            {resultado.jornada.nombre} · {resultado.jornada.fecha}
            {resultado.jornada.numero_sorteo && ` · sorteo N° ${resultado.jornada.numero_sorteo}`}
          </p>

          {resultado.cargados.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cargados ({resultado.cargados.length})
              </p>
              <div className="mt-1 flex flex-wrap gap-2 text-sm">
                {resultado.cargados.map((c) => (
                  <span key={c.numero} className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-800">
                    <span className="font-mono text-xs text-emerald-700">{c.valor}</span> →{' '}
                    <span className="font-bold">{String(c.numero).padStart(2, '0')}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {resultado.ignorados.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ignorados ({resultado.ignorados.length})
              </p>
              <ul className="mt-1 space-y-1 text-sm text-slate-600">
                {resultado.ignorados.map((g, i) => (
                  <li key={`${g.valor}-${i}`}>
                    <span className="font-mono text-xs">{g.valor}</span> →{' '}
                    <span className="font-bold">{String(g.numero).padStart(2, '0')}</span>
                    <span className="text-slate-500"> — {g.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Historial */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-900">Jornadas cargadas</h2>
        {datos.jornadas.length === 0 ? (
          <Vacio>Todavía no se cargó ningún número.</Vacio>
        ) : (
          <ul className="divide-y divide-slate-100">
            {datos.jornadas.map((j) => (
              <li key={j.jornada_id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-800">{j.fecha}</span>
                  <span className="badge bg-slate-100 text-slate-700">{j.nombre}</span>
                  {j.numero_sorteo && (
                    <span className="text-xs text-slate-500">sorteo N° {j.numero_sorteo}</span>
                  )}
                  {j.cerrada && <span className="badge bg-violet-100 text-violet-700">cerrada</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(j.extracciones?.length ? j.extracciones : j.numeros.map((n) => ({ numero: n }))).map(
                    (x, i) => (
                      <span
                        key={`${x.numero}-${i}`}
                        className="rounded bg-emerald-100 px-1.5 py-0.5 text-sm text-emerald-800"
                        title={x.valor_cargado != null ? `Cargado: ${x.valor_cargado}` : undefined}
                      >
                        {String(x.numero).padStart(2, '0')}
                        {x.valor_cargado != null && x.valor_cargado !== x.numero && (
                          <span className="ml-1 font-mono text-[10px] text-emerald-600">
                            ({x.valor_cargado})
                          </span>
                        )}
                      </span>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ganadores: quién ganó, con su vendedor y su cartón */}
      {datos.ganadores?.length > 0 && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Ganadores</h2>
            <button
              type="button"
              className="btn-secondary"
              disabled={avisando}
              onClick={async () => {
                setAvisando(true);
                setMensaje(null);
                try {
                  const r = await sorteosApi.notificarGanadores(sorteo.id);
                  setMensaje({
                    tipo: 'exito',
                    texto: `Se generaron ${r.total_ganadores} aviso(s); enviados: ${r.enviados}.`,
                  });
                } catch (err) {
                  setMensaje({ tipo: 'error', texto: err.message });
                } finally {
                  setAvisando(false);
                }
              }}
            >
              {avisando ? 'Enviando...' : 'Reenviar aviso a los ganadores'}
            </button>
          </div>
          <Ganadores ganadores={datos.ganadores} numerosSalidos={datos.numeros_salidos} />
        </div>
      )}

      {/* Los 20 cartones que más números van acertando */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-900">Top 20 cartones</h2>
        <p className="text-sm text-slate-600">
          Los cartones que más números van acertando en este sorteo.
        </p>
        <RankingCartones ranking={datos.ranking || []} />
      </div>
    </div>
  );
}
