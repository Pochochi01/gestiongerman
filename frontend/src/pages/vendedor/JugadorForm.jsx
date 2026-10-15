/**
 * Alta de jugador con sus datos y (opcionalmente) la eleccion de los numeros
 * del carton. No se piden domicilio ni geolocalizacion: el sistema no usa mapas.
 *
 * Al guardar (POST /api/jugadores/nuevo) el backend crea el usuario con el DNI,
 * vende el carton, genera el PDF con el QR de validacion y devuelve el enlace
 * de WhatsApp. El enlace se abre en el mismo gesto del boton y solo llega si
 * quien carga es un VENDEDOR: el administrador recibe unicamente el PDF.
 *
 * La pantalla esta pensada para un vendedor de pie, con una mano, en la calle:
 * campos de 44px de alto, teclado numerico donde corresponde, y los errores
 * junto al campo que los causa en lugar de un cartel arriba que obliga a
 * buscar cual de los cuatro campos esta mal.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jugadoresApi, sorteosApi } from '../../api/endpoints';
import SelectorNumeros from '../../components/SelectorNumeros';
import { Alerta, Campo, Cargando, GrupoCampo, ResumenErrores } from '../../components/ui';
import { dni, erroresDeApi, texto, validar, whatsapp } from '../../utils/validacion';

const VACIO = {
  apellido: '',
  nombre: '',
  dni: '',
  whatsapp: '',
};

const REGLAS = {
  apellido: texto('el apellido'),
  nombre: texto('el nombre'),
  dni,
  whatsapp,
};

// Los id son fijos y no generados: el resumen de errores necesita poder
// enlazar a cada campo, y un id estable ademas sirve para las pruebas.
const CAMPOS = {
  apellido: { id: 'jugador-apellido', etiqueta: 'Apellido' },
  nombre: { id: 'jugador-nombre', etiqueta: 'Nombre' },
  dni: { id: 'jugador-dni', etiqueta: 'DNI' },
  whatsapp: { id: 'jugador-whatsapp', etiqueta: 'WhatsApp' },
};

export default function JugadorForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [numeros, setNumeros] = useState([]);
  const [errorNumeros, setErrorNumeros] = useState('');
  const [sorteo, setSorteo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const formRef = useRef(null);
  const resumenRef = useRef(null);

  useEffect(() => {
    sorteosApi
      .vigente()
      .then((v) => setSorteo(v?.sorteo || null))
      .catch((err) => setMensaje({ tipo: 'error', texto: err.message }))
      .finally(() => setCargando(false));
  }, []);

  const campo = (clave) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [clave]: value }));
    // El error se borra al corregir, no al enviar de nuevo: dejarlo puesto
    // mientras el usuario ya arreglo el campo es ruido que no informa nada.
    setErrores((prev) => (prev[clave] ? { ...prev, [clave]: undefined } : prev));
  };

  /** Valida un campo al salir de el, para avisar antes de llegar al boton. */
  const alSalir = (clave) => () => {
    const mensajeError = REGLAS[clave]?.(form[clave], form);
    setErrores((prev) => ({ ...prev, [clave]: mensajeError || undefined }));
  };

  const ventaAbierta = sorteo?.estado === 'EN_VENTA';
  const cantidad = sorteo?.numeros_por_carton || 10;

  /**
   * Con un solo error, el foco va directo al campo: es lo mas rapido.
   * Con varios va al resumen, porque enfocar uno solo esconde los demas.
   */
  const enfocarError = (mapa) => {
    const conError = Object.keys(REGLAS).filter((c) => mapa[c]);
    if (conError.length === 0) return;
    if (conError.length > 1) {
      resumenRef.current?.focus();
      return;
    }
    document.getElementById(CAMPOS[conError[0]].id)?.focus();
  };

  const enviar = async (e) => {
    e.preventDefault();
    setMensaje(null);

    const mapa = validar(form, REGLAS);
    const faltanNumeros =
      ventaAbierta && numeros.length > 0 && numeros.length !== cantidad
        ? `Eligió ${numeros.length} de ${cantidad} números. Complete los ${cantidad} o no elija ninguno y el jugador los carga después.`
        : '';

    setErrores(mapa);
    setErrorNumeros(faltanNumeros);

    if (Object.keys(mapa).length > 0 || faltanNumeros) {
      enfocarError(mapa);
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
        ? `\nCartón ${r.carton.codigo} generado.` +
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
      setErrores({});
    } catch (err) {
      const { porCampo, general } = erroresDeApi(err);
      setErrores(porCampo);
      setMensaje({ tipo: 'error', texto: general });
      enfocarError(porCampo);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <Cargando texto="Buscando el sorteo en venta..." />;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Nuevo jugador</h1>

      {!ventaAbierta && (
        <Alerta tipo="aviso">
          {sorteo
            ? `El sorteo N° ${sorteo.numero} no tiene la venta abierta: puede cargar el jugador, pero todavía no venderle un cartón.`
            : 'No hay ningún sorteo con la venta abierta: puede cargar el jugador de todos modos.'}
        </Alerta>
      )}

      {mensaje && (
        <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>
          {mensaje.texto}
        </Alerta>
      )}

      {/* --- Resultado del alta: PDF y reenvío por WhatsApp --- */}
      {resultado?.carton && (
        <div className="card space-y-4 ring-2 ring-emerald-300">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-600">Cartón emitido</p>
              <p className="tabular text-lg font-bold text-slate-900">{resultado.carton.codigo}</p>
              <p className="break-words text-sm text-slate-600">
                {resultado.jugador.apellido}, {resultado.jugador.nombre} — DNI{' '}
                <span className="tabular">{resultado.jugador.dni}</span>
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setResultado(null)}>
              Cerrar y cargar otro
            </button>
          </div>

          <div className="btn-fila flex-wrap">
            {resultado.pdf?.url && (
              <>
                <a className="btn-primary" href={resultado.pdf.url} target="_blank" rel="noreferrer">
                  Ver el PDF del cartón
                </a>
                <a className="btn-secondary" href={resultado.pdf.url} download>
                  Descargar PDF
                </a>
              </>
            )}

            {resultado.whatsapp?.habilitado ? (
              <a className="btn-success" href={resultado.whatsapp.url} target="_blank" rel="noreferrer">
                Reabrir WhatsApp
              </a>
            ) : (
              <span className="self-center text-sm text-slate-600">{resultado.whatsapp?.motivo}</span>
            )}
          </div>

          {resultado.pdf?.url_publica && (
            <p className="break-all text-xs text-slate-500">
              Enlace que recibe el jugador: {resultado.pdf.url_publica}
            </p>
          )}

          {resultado.whatsapp?.habilitado && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-marca-700">
                Ver el mensaje que se envía
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
                {resultado.whatsapp.texto}
              </pre>
            </details>
          )}
        </div>
      )}

      <form ref={formRef} onSubmit={enviar} noValidate className="card space-y-5">
        <ResumenErrores
          ref={resumenRef}
          items={Object.keys(CAMPOS)
            .filter((c) => errores[c])
            .map((c) => ({ ...CAMPOS[c], mensaje: errores[c] }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Apellido"
            requerido
            id={CAMPOS.apellido.id}
            name="apellido"
            autoComplete="family-name"
            maxLength={60}
            value={form.apellido}
            onChange={campo('apellido')}
            onBlur={alSalir('apellido')}
            error={errores.apellido}
          />
          <Campo
            etiqueta="Nombre"
            requerido
            id={CAMPOS.nombre.id}
            name="nombre"
            autoComplete="given-name"
            maxLength={60}
            value={form.nombre}
            onChange={campo('nombre')}
            onBlur={alSalir('nombre')}
            error={errores.nombre}
          />
          <Campo
            etiqueta="DNI"
            requerido
            id={CAMPOS.dni.id}
            name="dni"
            /* inputMode numeric abre el teclado de números en el teléfono, que
               es lo que el vendedor necesita, sin bloquear el pegado. */
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={form.dni}
            onChange={campo('dni')}
            onBlur={alSalir('dni')}
            error={errores.dni}
            ayuda="Sin puntos. Será su usuario y su clave inicial."
          />
          <Campo
            etiqueta="WhatsApp"
            requerido
            id={CAMPOS.whatsapp.id}
            name="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            placeholder="3764 123456"
            value={form.whatsapp}
            onChange={campo('whatsapp')}
            onBlur={alSalir('whatsapp')}
            error={errores.whatsapp}
            ayuda="Código de área y número. El sistema le agrega el prefijo del país."
          />
        </div>

        {ventaAbierta && (
          <GrupoCampo
            etiqueta="Números del cartón"
            ayuda={`Elija ${cantidad} números, o deje el cartón sin números para que los cargue el jugador.`}
            error={errorNumeros}
            className="fieldset"
          >
            <SelectorNumeros
              min={sorteo.rango_min}
              max={sorteo.rango_max}
              cantidad={cantidad}
              valor={numeros}
              onChange={(n) => {
                setNumeros(n);
                setErrorNumeros('');
              }}
            />
          </GrupoCampo>
        )}

        <div className="btn-fila border-t border-slate-200 pt-5">
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Cargando...' : 'Cargar jugador'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/vendedor/jugadores')}
          >
            Volver
          </button>
        </div>
      </form>
    </div>
  );
}
