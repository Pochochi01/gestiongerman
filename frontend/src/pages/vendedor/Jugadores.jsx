/** Lista de clientes propios del vendedor. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jugadoresApi } from '../../api/endpoints';
import { Alerta, Cargando, Vacio } from '../../components/ui';

export default function Jugadores() {
  const [lista, setLista] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async (q = '') => {
    setCargando(true);
    try {
      setLista(await jugadoresApi.listar(q ? { q } : undefined));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Mis clientes</h1>
        <Link to="/vendedor/jugadores/nuevo" className="btn-primary">
          Nuevo jugador
        </Link>
      </div>

      <Alerta tipo="error">{error}</Alerta>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          cargar(busqueda);
        }}
      >
        <input
          className="input max-w-xs"
          placeholder="Buscar por apellido, nombre o DNI"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Buscar</button>
      </form>

      {cargando ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <Vacio>Todavia no cargo ningun jugador.</Vacio>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Jugador</th>
                <th className="th">DNI</th>
                <th className="th">WhatsApp</th>
                <th className="th">Cartones</th>
                <th className="th">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td className="td font-medium text-slate-900">
                    {j.apellido}, {j.nombre}
                  </td>
                  <td className="td">{j.dni}</td>
                  <td className="td">{j.whatsapp}</td>
                  <td className="td">{j.cartones}</td>
                  <td className="td text-xs">{new Date(j.creado_en).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
