/**
 * CRUD de administradores: listado, busqueda, alta, edicion, habilitacion,
 * blanqueo de clave y borrado.
 *
 * La cuenta raiz (la que creo el sistema) no aparece en esta lista y no se
 * puede alcanzar desde aca: el backend no la expone en ninguna respuesta.
 * No es que este oculta en la interfaz, es que no viene en los datos.
 *
 * La propia cuenta de quien mira tampoco ofrece "Inhabilitar" ni "Eliminar":
 * el backend los rechaza igual, pero mostrar un boton que siempre falla es una
 * promesa falsa.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { administradoresApi } from '../../api/endpoints';
import { Alerta, Cargando, Vacio } from '../../components/ui';

/** Fecha y hora legibles, o un guion si nunca entro. */
function cuando(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Administradores() {
  const [lista, setLista] = useState([]);
  const [yo, setYo] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const cargar = useCallback(async (q = '') => {
    setCargando(true);
    try {
      const [datos, quienSoy] = await Promise.all([
        administradoresApi.listar(q ? { q } : undefined),
        administradoresApi.yo(),
      ]);
      setLista(datos);
      setYo(quienSoy);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const esYo = (a) => yo && a.usuario_id === yo.usuario_id;

  const alternar = async (a) => {
    setOcupado(a.id);
    try {
      await administradoresApi.activacion(a.id, !a.activo);
      setMensaje({
        tipo: 'exito',
        texto: `${a.apellido}, ${a.nombre} quedó ${a.activo ? 'inhabilitado' : 'habilitado'}.`,
      });
      await cargar(busqueda);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setOcupado(null);
    }
  };

  const blanquear = async (a) => {
    const seguir = window.confirm(
      `¿Blanquear la clave de ${a.apellido}, ${a.nombre}?\n\n` +
        `Su clave pasa a ser su DNI (${a.dni}) y el sistema le va a pedir una nueva ` +
        'la próxima vez que entre.'
    );
    if (!seguir) return;

    setOcupado(a.id);
    try {
      const r = await administradoresApi.blanquear(a.id);
      setMensaje({
        tipo: 'exito',
        texto:
          `${r.mensaje}\n` +
          `Usuario: ${r.credenciales.usuario} — Clave provisoria: ${r.credenciales.clave}`,
      });
      await cargar(busqueda);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setOcupado(null);
    }
  };

  const eliminar = async (a) => {
    const seguir = window.confirm(
      `¿Eliminar al administrador ${a.apellido}, ${a.nombre}?\n\n` +
        'Pierde el acceso al sistema de inmediato. Esto no se puede deshacer.\n' +
        'Si sólo quiere quitarle el acceso por un tiempo, use "Inhabilitar".'
    );
    if (!seguir) return;

    setOcupado(a.id);
    try {
      const r = await administradoresApi.eliminar(a.id);
      setMensaje({ tipo: 'exito', texto: r.mensaje });
      await cargar(busqueda);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Administradores</h1>
        <Link to="/admin/administradores/nuevo" className="btn-primary">
          Nuevo administrador
        </Link>
      </div>

      <p className="max-w-2xl text-sm text-slate-600">
        Un administrador maneja todo el sistema: vendedores, sorteos, carga de números y cartones.
        Entra con su DNI como usuario y como clave inicial, y el sistema le pide cambiarla.
      </p>

      {mensaje && (
        <Alerta tipo={mensaje.tipo} onCerrar={() => setMensaje(null)}>
          {mensaje.texto}
        </Alerta>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          cargar(busqueda);
        }}
      >
        <label htmlFor="buscar-administrador" className="sr-only">
          Buscar por apellido, nombre o DNI
        </label>
        <input
          id="buscar-administrador"
          type="search"
          className="input max-w-xs"
          placeholder="Buscar por apellido, nombre o DNI"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button type="submit" className="btn-secondary">
          Buscar
        </button>
      </form>

      {cargando ? (
        <Cargando texto="Cargando administradores..." />
      ) : lista.length === 0 ? (
        <Vacio
          accion={
            <Link to="/admin/administradores/nuevo" className="btn-primary">
              Crear el primero
            </Link>
          }
        >
          {busqueda
            ? 'Ningún administrador coincide con esa búsqueda.'
            : 'Todavía no hay otros administradores. Usted es el único que entra al sistema.'}
        </Vacio>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Administrador</th>
                <th className="th">DNI / usuario</th>
                <th className="th">Último acceso</th>
                <th className="th">Estado</th>
                <th className="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="td font-medium text-slate-900">
                    {a.apellido}, {a.nombre}
                    {esYo(a) && (
                      <span className="ml-2 badge bg-marca-100 text-marca-800">usted</span>
                    )}
                    {a.creado_por_username && (
                      <span className="block text-xs font-normal text-slate-600">
                        lo creó {a.creado_por_username}
                      </span>
                    )}
                  </td>
                  <td className="td tabular">{a.dni}</td>
                  <td className="td">
                    {cuando(a.ultimo_acceso)}
                    {a.debe_cambiar_password && (
                      <span className="block text-xs text-amber-800">
                        tiene que cambiar la clave
                      </span>
                    )}
                  </td>
                  <td className="td">
                    <span
                      className={`badge ${
                        a.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {a.activo ? 'Habilitado' : 'Inhabilitado'}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-2">
                      <Link to={`/admin/administradores/${a.id}`} className="btn-secondary">
                        Editar
                      </Link>

                      {/* La propia cuenta no se blanquea desde acá: para eso
                          está "Cambiar clave", que pide la clave actual. */}
                      {!esYo(a) && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => blanquear(a)}
                          disabled={ocupado === a.id}
                        >
                          Blanquear clave
                        </button>
                      )}

                      {!esYo(a) && (
                        <>
                          <button
                            type="button"
                            className={a.activo ? 'btn-secondary' : 'btn-success'}
                            onClick={() => alternar(a)}
                            disabled={ocupado === a.id}
                          >
                            {a.activo ? 'Inhabilitar' : 'Habilitar'}
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => eliminar(a)}
                            disabled={ocupado === a.id}
                          >
                            Eliminar
                          </button>
                        </>
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
