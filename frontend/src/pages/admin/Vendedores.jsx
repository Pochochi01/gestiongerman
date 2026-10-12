/** CRUD de vendedores: listado, busqueda, habilitar/inhabilitar y borrado. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { vendedoresApi } from '../../api/endpoints';
import { Alerta, Cargando, Vacio } from '../../components/ui';

export default function Vendedores() {
  const [lista, setLista] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async (q = '') => {
    setCargando(true);
    try {
      setLista(await vendedoresApi.listar(q ? { q } : undefined));
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alternar = async (vendedor) => {
    try {
      await vendedoresApi.habilitacion(vendedor.id, !vendedor.habilitado);
      setMensaje({
        tipo: 'exito',
        texto: `${vendedor.apellido} quedo ${vendedor.habilitado ? 'inhabilitado' : 'habilitado'}.`,
      });
      cargar(busqueda);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    }
  };

  /**
   * Borra el vendedor. Si tiene jugadores, el backend responde 409 y se vuelve
   * a pedir con `forzar`, previa confirmación explícita de lo que se arrastra.
   */
  const eliminar = async (vendedor) => {
    const clientes = Number(vendedor.jugadores_cargados);
    if (!window.confirm(`¿Eliminar a ${vendedor.apellido}, ${vendedor.nombre}?`)) return;

    try {
      const r = await vendedoresApi.eliminar(vendedor.id);
      setMensaje({ tipo: 'exito', texto: r.mensaje || 'Vendedor eliminado.' });
      cargar(busqueda);
      return;
    } catch (err) {
      // 409: tiene jugadores cargados. Se ofrece el borrado en cascada.
      if (err.status !== 409 || clientes === 0) {
        setMensaje({ tipo: 'error', texto: err.message });
        return;
      }
      const forzado = window.confirm(
        `${err.message}\n\n` +
          `ATENCIÓN: eliminar en cascada borra también sus ${clientes} jugador(es) ` +
          'y todos sus cartones. Esto no se puede deshacer.\n\n¿Continuar?'
      );
      if (!forzado) return;

      try {
        const r = await vendedoresApi.eliminar(vendedor.id, true);
        setMensaje({ tipo: 'exito', texto: r.mensaje });
        cargar(busqueda);
      } catch (e2) {
        setMensaje({ tipo: 'error', texto: e2.message });
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Vendedores</h1>
        <Link to="/admin/vendedores/nuevo" className="btn-primary">
          Nuevo vendedor
        </Link>
      </div>

      {mensaje && <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>{mensaje.texto}</Alerta>}

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
        <Vacio>No hay vendedores cargados.</Vacio>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Vendedor</th>
                <th className="th">DNI</th>
                <th className="th">Telefono</th>
                <th className="th">Clientes</th>
                <th className="th">Estado</th>
                <th className="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="td font-medium text-slate-900">
                    {v.apellido}, {v.nombre}
                  </td>
                  <td className="td">{v.dni}</td>
                  <td className="td">{v.telefono}</td>
                  <td className="td">{v.jugadores_cargados}</td>
                  <td className="td">
                    <span
                      className={`badge ${
                        v.habilitado ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {v.habilitado ? 'Habilitado' : 'Inhabilitado'}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-2">
                      <Link to={`/admin/vendedores/${v.id}`} className="btn-secondary">
                        Editar
                      </Link>
                      <button
                        type="button"
                        className={v.habilitado ? 'btn-secondary' : 'btn-success'}
                        onClick={() => alternar(v)}
                      >
                        {v.habilitado ? 'Inhabilitar' : 'Habilitar'}
                      </button>
                      <button type="button" className="btn-danger" onClick={() => eliminar(v)}>
                        Eliminar
                      </button>
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
