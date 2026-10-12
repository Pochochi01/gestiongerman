/**
 * Alta y edicion de vendedores.
 *
 * El domicilio es texto simple (calle y numero): el sistema no usa mapas ni
 * catalogo de provincias/localidades.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { vendedoresApi } from '../../api/endpoints';
import { Alerta, Cargando } from '../../components/ui';

const VACIO = {
  apellido: '',
  nombre: '',
  dni: '',
  telefono: '',
  habilitado: true,
  domicilio: { calle: '', numero: '', piso: '', departamento: '' },
};

export default function VendedorForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(VACIO);
  const [cargando, setCargando] = useState(editando);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!editando) return;
    vendedoresApi
      .obtener(id)
      .then((v) => {
        setForm({
          apellido: v.apellido,
          nombre: v.nombre,
          dni: v.dni,
          telefono: v.telefono,
          habilitado: !!v.habilitado,
          domicilio: {
            calle: v.calle || '',
            numero: v.numero || '',
            piso: v.piso || '',
            departamento: v.departamento || '',
          },
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [editando, id]);

  const campo = (clave) => (e) => setForm((f) => ({ ...f, [clave]: e.target.value }));
  const campoDomicilio = (clave) => (e) =>
    setForm((f) => ({ ...f, domicilio: { ...f.domicilio, [clave]: e.target.value } }));

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);

    const payload = {
      ...form,
      // Sin calle no hay domicilio que guardar.
      domicilio: form.domicilio.calle.trim() ? form.domicilio : null,
    };

    try {
      if (editando) await vendedoresApi.actualizar(id, payload);
      else await vendedoresApi.crear(payload);
      navigate('/admin/vendedores');
    } catch (err) {
      setError(err.detalles ? `${err.message}: ${err.detalles.map((d) => d.mensaje).join(', ')}` : err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <Cargando />;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">
        {editando ? 'Editar vendedor' : 'Nuevo vendedor'}
      </h1>

      <form onSubmit={enviar} className="card space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Apellido *</label>
            <input className="input" value={form.apellido} onChange={campo('apellido')} required />
          </div>
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={form.nombre} onChange={campo('nombre')} required />
          </div>
          <div>
            <label className="label">DNI * {editando && '(no editable)'}</label>
            <input
              className="input"
              value={form.dni}
              onChange={campo('dni')}
              disabled={editando}
              required
            />
            {!editando && (
              <p className="mt-1 text-xs text-slate-500">
                Se usa como usuario y clave inicial del vendedor.
              </p>
            )}
          </div>
          <div>
            <label className="label">Telefono *</label>
            <input className="input" value={form.telefono} onChange={campo('telefono')} required />
          </div>
        </div>

        <fieldset className="space-y-4 border-t border-slate-200 pt-4">
          <legend className="text-sm font-semibold text-slate-700">Domicilio</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label">Calle</label>
              <input className="input" value={form.domicilio.calle} onChange={campoDomicilio('calle')} />
            </div>
            <div>
              <label className="label">Numero</label>
              <input className="input" value={form.domicilio.numero} onChange={campoDomicilio('numero')} />
            </div>
          </div>
        </fieldset>

        {!editando && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-bingo-600 focus:ring-bingo-500"
              checked={form.habilitado}
              onChange={(e) => setForm((f) => ({ ...f, habilitado: e.target.checked }))}
            />
            Habilitado para vender
          </label>
        )}

        <Alerta tipo="error">{error}</Alerta>

        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Guardar'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/admin/vendedores')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
