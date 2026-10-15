/** Panel del vendedor: sorteo vigente y clientes propios. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jugadoresApi, sorteosApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { Alerta, Cargando, EstadoBadge, Progreso } from '../../components/ui';

export default function Panel() {
  const { perfil } = useAuth();
  const [datos, setDatos] = useState(null);
  const [jugadores, setJugadores] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([sorteosApi.vigente(), jugadoresApi.listar()])
      .then(([vigente, js]) => {
        setDatos(vigente);
        setJugadores(js);
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <Cargando />;

  const sorteo = datos?.sorteo;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Hola, {perfil?.nombre}</h1>
      <Alerta tipo="error">{error}</Alerta>

      {perfil && !perfil.habilitado && (
        <Alerta tipo="aviso">
          Su cuenta esta inhabilitada por el administrador: no puede cargar jugadores ni vender cartones.
        </Alerta>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Mis clientes</p>
          <p className="text-3xl font-bold text-slate-900">{jugadores.length}</p>
          <Link to="/vendedor/jugadores" className="text-sm text-marca-600 hover:underline">
            Ver listado
          </Link>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sorteo vigente</p>
          {sorteo ? (
            <>
              <p className="text-3xl font-bold text-slate-900">N° {sorteo.numero}</p>
              <EstadoBadge estado={sorteo.estado} />
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Sin sorteo activo</p>
          )}
        </div>
      </div>

      {sorteo && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-900">{sorteo.nombre}</h2>
          <Progreso vendidos={sorteo.cartones_vendidos} objetivo={sorteo.cartones_objetivo} />
          <p className="text-sm text-slate-600">
            {sorteo.estado === 'EN_VENTA'
              ? `Faltan ${sorteo.cartones_faltantes} cartones para que arranque el sorteo. Cada carton lleva ${sorteo.numeros_por_carton} numeros.`
              : 'La venta ya cerro: el sorteo esta en curso.'}
          </p>
          {sorteo.estado === 'EN_VENTA' && (
            <Link to="/vendedor/jugadores/nuevo" className="btn-primary w-fit">
              Cargar un jugador
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
