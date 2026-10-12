/** El jugador elige la cantidad de numeros definida por el administrador. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cartonesApi, sorteosApi } from '../../api/endpoints';
import SelectorNumeros from '../../components/SelectorNumeros';
import { Alerta, Cargando, Progreso, Vacio } from '../../components/ui';

export default function ElegirNumeros() {
  const navigate = useNavigate();
  const [sorteo, setSorteo] = useState(null);
  const [numeros, setNumeros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    sorteosApi
      .vigente()
      .then((v) => setSorteo(v?.sorteo || null))
      .catch((err) => setMensaje({ tipo: 'error', texto: err.message }))
      .finally(() => setCargando(false));
  }, []);

  const confirmar = async () => {
    setMensaje(null);
    setEnviando(true);
    try {
      const r = await cartonesApi.vender(null, numeros);
      setMensaje({
        tipo: 'exito',
        texto:
          `Carton ${r.carton.codigo} generado. Te lo enviamos por WhatsApp con estado IMPAGO.` +
          (r.sorteo_iniciado ? ' Con tu carton se completo la venta: el sorteo ya comenzo.' : ''),
      });
      setNumeros([]);
      setTimeout(() => navigate(`/jugador/cartones/${r.carton.id}`), 1500);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <Cargando />;
  if (!sorteo) return <Vacio>No hay ningun sorteo activo.</Vacio>;

  if (sorteo.estado !== 'EN_VENTA') {
    return (
      <Alerta tipo="aviso">
        El sorteo N° {sorteo.numero} esta en estado {sorteo.estado}: la venta de cartones ya cerro.
      </Alerta>
    );
  }

  const cantidad = sorteo.numeros_por_carton;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Elegir mis numeros</h1>
        <p className="text-sm text-slate-600">
          Sorteo N° {sorteo.numero} - elija {cantidad} numeros entre {sorteo.rango_min} y {sorteo.rango_max}.
        </p>
      </div>

      <div className="card">
        <Progreso vendidos={sorteo.cartones_vendidos} objetivo={sorteo.cartones_objetivo} />
        <p className="mt-2 text-sm text-slate-600">
          Faltan {sorteo.cartones_faltantes} cartones para iniciar el sorteo.
        </p>
      </div>

      {mensaje && <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

      <div className="card space-y-4">
        <SelectorNumeros
          min={sorteo.rango_min}
          max={sorteo.rango_max}
          cantidad={cantidad}
          valor={numeros}
          onChange={setNumeros}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={numeros.length !== cantidad || enviando}
          onClick={confirmar}
        >
          {enviando ? 'Generando...' : `Confirmar carton (${numeros.length}/${cantidad})`}
        </button>
      </div>
    </div>
  );
}
