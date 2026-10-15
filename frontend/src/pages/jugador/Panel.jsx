/**
 * Panel del jugador: cartones faltantes para iniciar el sorteo, control de
 * los sorteos diarios y acceso a sus cartones.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cartonesApi, sorteosApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { Alerta, Cargando, EstadoBadge, Progreso, Vacio } from '../../components/ui';
import ListaSorteos from '../../components/ListaSorteos';

export default function Panel() {
  const { perfil } = useAuth();
  const [datos, setDatos] = useState(null);
  const [cartones, setCartones] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([sorteosApi.vigente(), cartonesApi.listar()])
      .then(([v, cs]) => {
        setDatos(v);
        setCartones(cs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  // Todos los números que el jugador tiene en sus cartones: con eso la lista
  // de sorteos marca cuáles le pertenecen.
  const misNumeros = useMemo(
    () => [...new Set(cartones.flatMap((c) => c.numeros || []))],
    [cartones]
  );

  if (cargando) return <Cargando />;

  const sorteo = datos?.sorteo;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Hola, {perfil?.nombre}</h1>
      <Alerta tipo="error">{error}</Alerta>

      {!sorteo ? (
        <Vacio>No hay ningun sorteo activo en este momento.</Vacio>
      ) : (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              Sorteo N° {sorteo.numero} - {sorteo.nombre}
            </h2>
            <EstadoBadge estado={sorteo.estado} />
          </div>

          <Progreso vendidos={sorteo.cartones_vendidos} objetivo={sorteo.cartones_objetivo} />

          {sorteo.estado === 'EN_VENTA' ? (
            <p className="text-sm text-slate-700">
              Faltan <span className="font-bold text-marca-700">{sorteo.cartones_faltantes}</span> cartones
              para que empiece el sorteo.
            </p>
          ) : (
            <p className="text-sm text-slate-700">
              El sorteo esta en marcha. Salieron {datos.numeros_salidos.length} numeros.
            </p>
          )}

          {cartones.length === 0 && sorteo.estado === 'EN_VENTA' && (
            <Link to="/jugador/elegir" className="btn-primary w-fit">
              Elegir mis numeros
            </Link>
          )}
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="font-semibold text-slate-900">Controlar los sorteos</h2>
        <ListaSorteos jornadas={datos?.jornadas || []} misNumeros={misNumeros} />
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Mis cartones</h2>
          <Link to="/jugador/cartones" className="text-sm text-marca-600 hover:underline">
            Ver todos
          </Link>
        </div>
        {cartones.length === 0 ? (
          <Vacio>Todavia no tiene cartones.</Vacio>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cartones.slice(0, 3).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link to={`/jugador/cartones/${c.id}`} className="font-medium text-marca-700 hover:underline">
                    {c.codigo}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {c.aciertos}/{c.cantidad_numeros} aciertos
                  </p>
                </div>
                <EstadoBadge estado={c.estado_pago} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
