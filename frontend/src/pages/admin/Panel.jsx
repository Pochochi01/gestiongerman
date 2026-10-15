/** Panel del administrador: estado del sorteo vigente y resumen general. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sorteosApi, vendedoresApi, whatsappApi } from '../../api/endpoints';
import { Alerta, Cargando, EstadoBadge, Progreso } from '../../components/ui';

export default function Panel() {
  const [datos, setDatos] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [wa, setWa] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      sorteosApi.vigente(),
      vendedoresApi.listar(),
      whatsappApi.estado().catch(() => null),
    ])
      .then(([vigente, vs, estadoWa]) => {
        setDatos(vigente);
        setVendedores(vs);
        setWa(estadoWa);
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <Cargando />;

  const sorteo = datos?.sorteo;
  const habilitados = vendedores.filter((v) => v.habilitado).length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Panel del administrador</h1>
      <Alerta tipo="error">{error}</Alerta>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Vendedores</p>
          <p className="text-3xl font-bold text-slate-900">{vendedores.length}</p>
          <p className="text-sm text-slate-500">{habilitados} habilitados</p>
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
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">WhatsApp</p>
          <p className="text-lg font-bold capitalize text-slate-900">{wa?.estado || 'sin datos'}</p>
          <Link to="/admin/whatsapp" className="text-sm text-marca-600 hover:underline">
            Ver panel
          </Link>
        </div>
      </div>

      {sorteo && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              {sorteo.nombre} - {sorteo.numeros_por_carton} numeros por carton
            </h2>
            <Link to="/admin/sorteos" className="text-sm text-marca-600 hover:underline">
              Administrar sorteos
            </Link>
          </div>
          <Progreso vendidos={sorteo.cartones_vendidos} objetivo={sorteo.cartones_objetivo} />
          <p className="text-sm text-slate-600">
            {sorteo.estado === 'EN_VENTA'
              ? `Faltan ${sorteo.cartones_faltantes} cartones para iniciar el sorteo.`
              : `Numeros ya extraidos: ${datos.numeros_salidos.length}`}
          </p>
          {datos.numeros_salidos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {datos.numeros_salidos.map((n) => (
                <span key={n} className="badge bg-emerald-100 text-emerald-700">
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
