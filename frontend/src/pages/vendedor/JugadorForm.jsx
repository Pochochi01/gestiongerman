/**
 * Alta de jugador con sus datos y (opcionalmente) la eleccion de los numeros
 * del carton. No se piden domicilio ni geolocalizacion: el sistema no usa mapas.
 *
 * Al guardar (POST /api/jugadores/nuevo) el backend crea el usuario con el DNI,
 * vende el carton, genera el PDF con el QR de validacion y devuelve el enlace
 * de WhatsApp. El enlace se abre en el mismo gesto del boton y solo llega si
 * quien carga es un VENDEDOR: el administrador recibe unicamente el PDF.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jugadoresApi, sorteosApi } from '../../api/endpoints';
import SelectorNumeros from '../../components/SelectorNumeros';
import { Alerta, Cargando } from '../../components/ui';

const VACIO = {
  apellido: '',
  nombre: '',
  dni: '',
  whatsapp: '',
};

export default function JugadorForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState(VACIO);
  const [numeros, setNumeros] = useState([]);
  const [sorteo, setSorteo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    sorteosApi
      .vigente()
      .then((v) => setSorteo(v?.sorteo || null))
      .catch((err) => setMensaje({ tipo: 'error', texto: err.message }))
      .finally(() => setCargando(false));
  }, []);

  const campo = (clave) => (e) => setForm((f) => ({ ...f, [clave]: e.target.value }));

  const ventaAbierta = sorteo?.estado === 'EN_VENTA';
  const cantidad = sorteo?.numeros_por_carton || 10;

  const enviar = async (e) => {
    e.preventDefault();
    setMensaje(null);

    if (ventaAbierta && numeros.length > 0 && numeros.length !== cantidad) {
      setMensaje({ tipo: 'error', texto: `Debe elegir exactamente ${cantidad} numeros o ninguno.` });
      return;
    }

    setEnviando(true);
    try {
      const r = await jugadoresApi.nuevo({
        ...form,
        numeros: numeros.length ? numeros : undefined,
      });

      setResultado(r);

      // El WhatsApp se abre acá, en el mismo gesto del botón: si se hiciera en
      // un efecto o tras un await largo, el navegador lo tomaría como popup y
      // lo bloquearía. `window.open` en el handler del submit sí pasa.
      if (r.whatsapp?.habilitado && r.whatsapp.url) {
        window.open(r.whatsapp.url, '_blank', 'noopener');
      }

      const textoCarton = r.carton
        ? `\nCartón ${r.carton.codigo} generado (estado ${r.carton.estado_pago}).` +
          (r.sorteo_iniciado ? '\nCon este cartón se completó la venta: el sorteo ya comenzó.' : '')
        : '';

      setMensaje({
        tipo: r.advertencia ? 'aviso' : 'exito',
        texto:
          `Jugador dado de alta.\nUsuario: ${r.credenciales.usuario} — Clave inicial: ${r.credenciales.clave}` +
          textoCarton +
          (r.whatsapp?.habilitado ? '\nSe abrió WhatsApp con el mensaje listo para enviar.' : '') +
          (r.advertencia ? `\n${r.advertencia}` : ''),
      });
      setForm(VACIO);
      setNumeros([]);
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.detalles ? `${err.message}: ${err.detalles.map((d) => d.mensaje).join(', ')}` : err.message,
      });
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <Cargando />;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Nuevo jugador</h1>

      {!ventaAbierta && (
        <Alerta tipo="aviso">
          {sorteo
            ? `El sorteo N° ${sorteo.numero} esta en estado ${sorteo.estado}: puede cargar el jugador, pero no vender cartones.`
            : 'No hay ningun sorteo con la venta abierta: puede cargar el jugador de todos modos.'}
        </Alerta>
      )}

      {mensaje && <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

      {/* --- Resultado del alta: PDF y reenvío por WhatsApp --- */}
      {resultado?.carton && (
        <div className="card space-y-4 ring-2 ring-emerald-300">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Cartón emitido</p>
              <p className="text-lg font-bold text-slate-900">{resultado.carton.codigo}</p>
              <p className="text-sm text-slate-600">
                {resultado.jugador.apellido}, {resultado.jugador.nombre} — DNI {resultado.jugador.dni}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setResultado(null)}
              title="Cerrar y cargar otro jugador"
            >
              Cerrar
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {resultado.pdf?.url && (
              <>
                <a
                  className="btn-primary"
                  href={resultado.pdf.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver el PDF del cartón
                </a>
                <a className="btn-secondary" href={resultado.pdf.url} download>
                  Descargar PDF
                </a>
              </>
            )}

            {resultado.whatsapp?.habilitado ? (
              <a
                className="btn-success"
                href={resultado.whatsapp.url}
                target="_blank"
                rel="noreferrer"
              >
                Reabrir WhatsApp
              </a>
            ) : (
              <span className="self-center text-sm text-slate-500">
                {resultado.whatsapp?.motivo}
              </span>
            )}
          </div>

          {resultado.pdf?.url_publica && (
            <p className="break-all text-xs text-slate-500">
              Enlace que recibe el jugador: {resultado.pdf.url_publica}
            </p>
          )}

          {resultado.whatsapp?.habilitado && (
            <details className="text-sm">
              <summary className="cursor-pointer text-bingo-600">Ver el mensaje que se envía</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
                {resultado.whatsapp.texto}
              </pre>
            </details>
          )}
        </div>
      )}

      <form onSubmit={enviar} className="card space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Apellido *</label>
            <input className="input" value={form.apellido} onChange={campo('apellido')} required />
          </div>
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={form.nombre} onChange={campo('nombre')} required />
          </div>
          <div>
            <label className="label">DNI *</label>
            <input className="input" value={form.dni} onChange={campo('dni')} required />
            <p className="mt-1 text-xs text-slate-500">Sera su usuario y clave inicial.</p>
          </div>
          <div>
            <label className="label">WhatsApp *</label>
            <input
              className="input"
              placeholder="3764 123456"
              value={form.whatsapp}
              onChange={campo('whatsapp')}
              required
            />
            <p className="mt-1 text-xs text-slate-500">Se normaliza al formato internacional.</p>
          </div>
        </div>

        {ventaAbierta && (
          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-semibold text-slate-700">
              Numeros del carton (elija {cantidad}; puede dejarlo para que el jugador lo haga)
            </legend>
            <SelectorNumeros
              min={sorteo.rango_min}
              max={sorteo.rango_max}
              cantidad={cantidad}
              valor={numeros}
              onChange={setNumeros}
            />
          </fieldset>
        )}

        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Cargando...' : 'Cargar jugador'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/vendedor/jugadores')}>
            Volver
          </button>
        </div>
      </form>
    </div>
  );
}
