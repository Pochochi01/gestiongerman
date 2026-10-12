/** Listado de cartones vendidos y habilitacion tras la rendicion del vendedor. */
import { useCallback, useEffect, useState } from 'react';
import { cartonesApi, jugadoresApi } from '../../api/endpoints';
import { Alerta, Cargando, EstadoBadge, Vacio } from '../../components/ui';

export default function Cartones() {
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState('TODOS');
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [pdfDe, setPdfDe] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setLista(await cartonesApi.listar());
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (fn, texto) => {
    setMensaje(null);
    try {
      await fn();
      setMensaje({ tipo: 'exito', texto });
      cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    }
  };

  /**
   * Emite el PDF del cartón y lo abre.
   *
   * El administrador sólo obtiene el PDF: el backend no le devuelve enlace de
   * WhatsApp, porque el mensaje tiene que salir del número del vendedor.
   */
  const emitirPdf = async (carton) => {
    setPdfDe(carton.id);
    setMensaje(null);
    try {
      const r = await jugadoresApi.reemitirPdf(carton.id);
      window.open(r.pdf.url, '_blank', 'noopener');
      setMensaje({ tipo: 'exito', texto: `PDF del cartón ${carton.codigo} generado.` });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setPdfDe(null);
    }
  };

  const visibles = lista.filter((c) => filtro === 'TODOS' || c.estado_pago === filtro);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Cartones</h1>
      {mensaje && <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

      <div className="flex flex-wrap gap-2">
        {['TODOS', 'IMPAGO', 'RENDIDO', 'PAGADO'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={filtro === f ? 'btn-primary' : 'btn-secondary'}
          >
            {f}
          </button>
        ))}
      </div>

      {cargando ? (
        <Cargando />
      ) : visibles.length === 0 ? (
        <Vacio>No hay cartones con ese estado.</Vacio>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Carton</th>
                <th className="th">Sorteo</th>
                <th className="th">Jugador</th>
                <th className="th">Vendedor</th>
                <th className="th">Numeros</th>
                <th className="th">Aciertos</th>
                <th className="th">Pago</th>
                <th className="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td font-medium text-slate-900">{c.codigo}</td>
                  <td className="td">N° {c.sorteo_numero}</td>
                  <td className="td">
                    {c.jugador_apellido}, {c.jugador_nombre}
                    <span className="block text-xs text-slate-500">DNI {c.jugador_dni}</span>
                  </td>
                  <td className="td">{c.vendedor_apellido}</td>
                  <td className="td text-xs">{(c.numeros || []).join(' - ')}</td>
                  <td className="td">
                    {c.aciertos}/{c.cantidad_numeros}
                    {c.estado === 'GANADOR' && <EstadoBadge estado="GANADOR" />}
                  </td>
                  <td className="td"><EstadoBadge estado={c.estado_pago} /></td>
                  <td className="td">
                    <div className="flex justify-end gap-2">
                      {!c.habilitado && (
                        <button
                          type="button"
                          className="btn-success"
                          onClick={() =>
                            accion(
                              () => cartonesApi.habilitar(c.id),
                              `Carton ${c.codigo} habilitado: se aviso al jugador.`
                            )
                          }
                        >
                          Habilitar
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-secondary"
                        title="Genera el PDF del carton con el QR de validacion"
                        disabled={pdfDe === c.id}
                        onClick={() => emitirPdf(c)}
                      >
                        {pdfDe === c.id ? "Generando..." : "PDF"}
                      </button>
                      {c.habilitado && (
                        <button
                          type="button"
                          className="btn-secondary"
                          title="Reenvia el aviso con la URL y las credenciales"
                          onClick={() =>
                            accion(
                              () => cartonesApi.notificarHabilitado(c.id),
                              `Aviso de habilitación reenviado para ${c.codigo}.`
                            )
                          }
                        >
                          Reenviar aviso
                        </button>
                      )}
                      {c.estado === 'ACTIVO' && (
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => accion(() => cartonesApi.anular(c.id), 'Carton anulado.')}
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
