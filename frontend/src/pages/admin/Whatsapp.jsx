/**
 * Panel de WhatsApp: sesión (estado + QR + desvinculación), prueba de envío de
 * un cartón y bandeja de salida con los mensajes enviados o fallidos.
 */
import { useCallback, useEffect, useState } from 'react';
import { cartonesApi, whatsappApi } from '../../api/endpoints';
import WhatsappSesion from '../../components/WhatsappSesion';
import { Alerta, Cargando, EstadoBadge, Vacio } from '../../components/ui';

export default function Whatsapp() {
  const [mensajes, setMensajes] = useState([]);
  const [cartones, setCartones] = useState([]);
  const [cartonId, setCartonId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [ms, cs] = await Promise.all([
        whatsappApi.mensajes(50),
        cartonesApi.listar().catch(() => []),
      ]);
      setMensajes(ms);
      setCartones(cs);
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const reenviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    try {
      const r = await whatsappApi.reenviarCarton(cartonId);
      setAviso({ tipo: r.enviado ? 'exito' : 'aviso', texto: r.mensaje });
      cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">WhatsApp</h1>

      {/* Estado de la sesión, QR y desvinculación */}
      <WhatsappSesion onCambio={() => {}} />

      {aviso && <Alerta tipo={aviso.tipo} onCerrar={() => setAviso(null)}>{aviso.texto}</Alerta>}

      {/* Prueba de envío: reenvía a un jugador el mensaje con su cartón */}
      <form onSubmit={reenviar} className="card space-y-3">
        <h2 className="font-semibold text-slate-900">Reenviar un cartón por WhatsApp</h2>
        <p className="text-sm text-slate-600">
          Vuelve a enviar al jugador el mensaje con los datos de su cartón. Sirve para probar la
          vinculación o para reenviar un mensaje que falló.
        </p>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="carton-reenvio" className="sr-only">
            Cartón al que reenviar el mensaje
          </label>
          <select
            id="carton-reenvio"
            className="select max-w-md"
            value={cartonId}
            onChange={(e) => setCartonId(e.target.value)}
            required
          >
            <option value="">Seleccione un cartón</option>
            {cartones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.jugador_apellido}, {c.jugador_nombre} ({c.jugador_whatsapp})
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={!cartonId || enviando}>
            {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </form>

      {/* Bandeja de salida */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Bandeja de salida</h2>
          <button type="button" className="btn-secondary" onClick={cargar}>
            Actualizar
          </button>
        </div>

        {cargando ? (
          <Cargando />
        ) : mensajes.length === 0 ? (
          <Vacio>Todavía no se generó ningún mensaje.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Tipo</th>
                  <th className="th">Destino</th>
                  <th className="th">Jugador</th>
                  <th className="th">Cartón</th>
                  <th className="th">Estado</th>
                  <th className="th">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mensajes.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="td text-xs">{m.tipo}</td>
                    <td className="td">{m.destino}</td>
                    <td className="td">
                      {m.jugador_apellido ? `${m.jugador_apellido}, ${m.jugador_nombre}` : '-'}
                    </td>
                    <td className="td">{m.carton_codigo || '-'}</td>
                    <td className="td">
                      <EstadoBadge estado={m.estado} />
                      {m.error_detalle && (
                        <span
                          className="block max-w-xs truncate text-xs text-rose-600"
                          title={m.error_detalle}
                        >
                          {m.error_detalle}
                        </span>
                      )}
                    </td>
                    <td className="td text-xs">{new Date(m.creado_en).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
