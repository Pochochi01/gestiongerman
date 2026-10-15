/**
 * Alta y edicion de administradores.
 *
 * El DNI es el usuario con el que la cuenta entra, asi que al editar no se
 * puede cambiar: cambiarlo seria crear otra cuenta. Para eso esta el alta.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { administradoresApi } from '../../api/endpoints';
import { Alerta, Campo, Cargando, Casilla, ResumenErrores } from '../../components/ui';
import { dni, erroresDeApi, texto, validar } from '../../utils/validacion';

const VACIO = { apellido: '', nombre: '', dni: '', activo: true };

const REGLAS = {
  apellido: texto('el apellido'),
  nombre: texto('el nombre'),
  dni,
};

// Id fijos para que el resumen de errores pueda enlazar a cada campo.
const CAMPOS = {
  apellido: { id: 'admin-apellido', etiqueta: 'Apellido' },
  nombre: { id: 'admin-nombre', etiqueta: 'Nombre' },
  dni: { id: 'admin-dni', etiqueta: 'DNI' },
};

export default function AdministradorForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [cargando, setCargando] = useState(editando);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [creado, setCreado] = useState(null);
  const resumenRef = useRef(null);

  useEffect(() => {
    if (!editando) return;
    administradoresApi
      .obtener(id)
      .then((a) =>
        setForm({ apellido: a.apellido, nombre: a.nombre, dni: a.dni, activo: !!a.activo })
      )
      .catch((err) => setError(err.message))
      .finally(() => setCargando(false));
  }, [editando, id]);

  const campo = (clave) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [clave]: value }));
    setErrores((prev) => (prev[clave] ? { ...prev, [clave]: undefined } : prev));
  };

  const alSalir = (clave) => () => {
    const mensaje = REGLAS[clave]?.(form[clave], form);
    setErrores((prev) => ({ ...prev, [clave]: mensaje || undefined }));
  };

  const enfocarError = (mapa) => {
    const conError = Object.keys(CAMPOS).filter((c) => mapa[c]);
    if (conError.length === 0) return;
    if (conError.length > 1) {
      resumenRef.current?.focus();
      return;
    }
    document.getElementById(CAMPOS[conError[0]].id)?.focus();
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError('');

    // Al editar, el DNI va deshabilitado: no tiene sentido frenar el guardado
    // por una regla que el usuario no puede corregir en esta pantalla.
    const reglas = editando ? { ...REGLAS, dni: null } : REGLAS;
    const mapa = validar(form, reglas);
    setErrores(mapa);
    if (Object.keys(mapa).length > 0) {
      enfocarError(mapa);
      return;
    }

    setEnviando(true);
    try {
      if (editando) {
        await administradoresApi.actualizar(id, { apellido: form.apellido, nombre: form.nombre });
        navigate('/admin/administradores');
      } else {
        const r = await administradoresApi.crear(form);
        // No se navega todavía: hay que mostrar las credenciales una vez.
        setCreado(r);
        setForm(VACIO);
        setErrores({});
      }
    } catch (err) {
      const { porCampo, general } = erroresDeApi(err);
      setErrores(porCampo);
      setError(general);
      enfocarError(porCampo);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <Cargando texto="Cargando el administrador..." />;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">
        {editando ? 'Editar administrador' : 'Nuevo administrador'}
      </h1>

      {/* Las credenciales se muestran una sola vez, al crear: después la clave
          queda hasheada y no hay forma de volver a leerla (sólo blanquearla). */}
      {creado && (
        <div className="card space-y-4 ring-2 ring-emerald-300">
          <div>
            <p className="text-sm text-slate-600">Administrador creado</p>
            <p className="text-lg font-bold text-slate-900">
              {creado.apellido}, {creado.nombre}
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Usuario
              </dt>
              <dd className="tabular text-base font-bold text-slate-900">
                {creado.credenciales.usuario}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Clave inicial
              </dt>
              <dd className="tabular text-base font-bold text-slate-900">
                {creado.credenciales.clave}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-slate-600">
            Pásele estos datos. Al entrar, el sistema le va a pedir una clave nueva. Si la pierde,
            use <span className="font-medium">Blanquear clave</span> en la lista.
          </p>
          <div className="btn-fila">
            <button type="button" className="btn-primary" onClick={() => setCreado(null)}>
              Cargar otro administrador
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/admin/administradores')}
            >
              Volver a la lista
            </button>
          </div>
        </div>
      )}

      {!creado && (
        <form onSubmit={enviar} noValidate className="card space-y-5">
          <ResumenErrores
            ref={resumenRef}
            items={Object.keys(CAMPOS)
              .filter((c) => errores[c])
              .map((c) => ({ ...CAMPOS[c], mensaje: errores[c] }))}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Apellido"
              requerido
              id={CAMPOS.apellido.id}
              name="apellido"
              autoComplete="family-name"
              maxLength={60}
              value={form.apellido}
              onChange={campo('apellido')}
              onBlur={alSalir('apellido')}
              error={errores.apellido}
            />
            <Campo
              etiqueta="Nombre"
              requerido
              id={CAMPOS.nombre.id}
              name="nombre"
              autoComplete="given-name"
              maxLength={60}
              value={form.nombre}
              onChange={campo('nombre')}
              onBlur={alSalir('nombre')}
              error={errores.nombre}
            />
            <Campo
              etiqueta={editando ? 'DNI (no se puede cambiar)' : 'DNI'}
              requerido={!editando}
              id={CAMPOS.dni.id}
              name="dni"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={form.dni}
              onChange={campo('dni')}
              onBlur={alSalir('dni')}
              disabled={editando}
              error={errores.dni}
              ayuda={
                editando
                  ? undefined
                  : 'Sin puntos. Será su usuario y su clave inicial, y no se puede cambiar después.'
              }
              contenedorClassName="sm:col-span-2"
            />
          </div>

          {!editando && (
            <Casilla
              etiqueta="Habilitado para entrar al sistema"
              ayuda="Si lo deja sin marcar, la cuenta queda creada pero no puede ingresar."
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            />
          )}

          <Alerta tipo="error">{error}</Alerta>

          <div className="btn-fila border-t border-slate-200 pt-5">
            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? 'Guardando...' : editando ? 'Guardar' : 'Crear administrador'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/admin/administradores')}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
