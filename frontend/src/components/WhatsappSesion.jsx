/**
 * Estado de la sesión de WhatsApp con el QR de vinculación.
 *
 * - Consulta `GET /api/whatsapp/estado` cada pocos segundos: más seguido
 *   mientras hay un QR en pantalla (WhatsApp lo rota cada ~20 s) y más
 *   espaciado cuando ya está conectado.
 * - Muestra el QR que devuelve el backend en base64, listo para escanear.
 * - Permite desvincular, lo que borra session.json en el servidor.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { whatsappApi } from '../api/endpoints';
import { Alerta, Cargando } from './ui';

const COLORES = {
  conectado: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  esperando_qr: 'bg-amber-100 text-amber-800 ring-amber-200',
  conectando: 'bg-sky-100 text-sky-800 ring-sky-200',
  desconectado: 'bg-rose-100 text-rose-800 ring-rose-200',
  deshabilitado: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const ETIQUETAS = {
  conectado: 'Conectado',
  esperando_qr: 'Esperando escaneo del QR',
  conectando: 'Conectando...',
  desconectado: 'No conectado',
  deshabilitado: 'Deshabilitado',
};

export default function WhatsappSesion({ onCambio }) {
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const timer = useRef(null);

  const consultar = useCallback(async () => {
    try {
      const info = await whatsappApi.estado();
      setEstado(info);
      onCambio?.(info);
      return info;
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message });
      return null;
    } finally {
      setCargando(false);
    }
  }, [onCambio]);

  // Polling adaptativo: 3 s con QR en pantalla, 15 s en el resto de los casos.
  useEffect(() => {
    let vivo = true;

    const ciclo = async () => {
      const info = await consultar();
      if (!vivo) return;
      const intervalo = info?.estado === 'esperando_qr' || info?.estado === 'conectando' ? 3000 : 15000;
      timer.current = setTimeout(ciclo, intervalo);
    };

    ciclo();
    return () => {
      vivo = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [consultar]);

  const accion = async (clave, fn, textoOk) => {
    setOcupado(clave);
    setAviso(null);
    try {
      const info = await fn();
      if (info?.estado) {
        setEstado(info);
        onCambio?.(info);
      }
      setAviso({ tipo: 'exito', texto: info?.mensaje || textoOk });
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message });
    } finally {
      setOcupado(null);
      consultar();
    }
  };

  const desvincular = () => {
    const confirmado = window.confirm(
      'Se cerrará la sesión en el teléfono y se borrará session.json del servidor.\n\n' +
        'Para volver a enviar mensajes habrá que escanear un código QR nuevo. ¿Continuar?'
    );
    if (!confirmado) return;
    accion('desvincular', whatsappApi.desvincular, 'Dispositivo desvinculado.');
  };

  if (cargando) return <Cargando texto="Consultando la sesión de WhatsApp..." />;
  if (!estado) return <Alerta tipo="error">{aviso?.texto || 'Sin datos de la sesión'}</Alerta>;

  const color = COLORES[estado.estado] || COLORES.desconectado;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sesión de WhatsApp</p>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                estado.estado === 'conectado'
                  ? 'bg-emerald-500'
                  : estado.estado === 'esperando_qr' || estado.estado === 'conectando'
                  ? 'animate-pulse bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            <span className={`badge ring-1 ${color}`}>
              {ETIQUETAS[estado.estado] || estado.estado}
            </span>
            {estado.telefono && (
              <span className="text-sm font-medium text-slate-700">{estado.telefono}</span>
            )}
          </div>
          <p className="max-w-xl text-sm text-slate-600">{estado.mensaje}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {estado.habilitado && estado.estado !== 'conectado' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => accion('vincular', whatsappApi.vincular, 'Generando código QR...')}
              disabled={ocupado === 'vincular'}
            >
              {ocupado === 'vincular' ? 'Conectando...' : 'Vincular dispositivo'}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => accion('reintentar', whatsappApi.reintentar, 'Se reintentaron los mensajes pendientes.')}
            disabled={ocupado === 'reintentar'}
          >
            Reintentar pendientes
          </button>
          {estado.sesion_guardada && (
            <button
              type="button"
              className="btn-danger"
              onClick={desvincular}
              disabled={ocupado === 'desvincular'}
            >
              {ocupado === 'desvincular' ? 'Desvinculando...' : 'Desvincular'}
            </button>
          )}
        </div>
      </div>

      {aviso && <Alerta tipo={aviso.tipo} onCerrar={() => setAviso(null)}>{aviso.texto}</Alerta>}

      {/* --- QR de vinculación --- */}
      {estado.qr && (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200 sm:flex-row sm:items-start">
          <img
            src={estado.qr}
            alt="Código QR para vincular WhatsApp"
            className="h-52 w-52 shrink-0 rounded-lg bg-white p-2 ring-1 ring-slate-300"
          />
          <div className="space-y-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Cómo vincular el dispositivo</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Abra WhatsApp en el teléfono desde el que se enviarán los cartones.</li>
              <li>Toque <span className="font-medium">Menú → Dispositivos vinculados</span>.</li>
              <li>Toque <span className="font-medium">Vincular un dispositivo</span>.</li>
              <li>Escanee este código.</li>
            </ol>
            <p className="text-xs text-slate-500">
              El código se renueva solo cada pocos segundos. Una vez vinculado, la sesión queda
              guardada en el servidor y no hay que repetir este paso en los próximos reinicios.
            </p>
          </div>
        </div>
      )}

      {/* --- Datos técnicos --- */}
      <dl className="grid gap-3 border-t border-slate-200 pt-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Sesión guardada</dt>
          <dd className={estado.sesion_guardada ? 'text-emerald-700' : 'text-slate-500'}>
            {estado.sesion_guardada ? 'Sí — reconecta sin QR' : 'No — requiere escanear el QR'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Conectado desde</dt>
          <dd className="text-slate-700">
            {estado.conectado_desde ? new Date(estado.conectado_desde).toLocaleString() : '-'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Reintentos</dt>
          <dd className="text-slate-700">{estado.intentos_reconexion ?? 0}</dd>
        </div>
      </dl>

      {estado.ultimo_error && (
        <p className="text-xs text-rose-600">Último error: {estado.ultimo_error}</p>
      )}
    </div>
  );
}
