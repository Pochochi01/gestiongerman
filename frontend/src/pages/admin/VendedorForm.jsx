/**
 * Alta y edicion de vendedores.
 *
 * El domicilio es texto simple (calle y numero): el sistema no usa mapas ni
 * catalogo de provincias/localidades.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { vendedoresApi } from '../../api/endpoints';
import { Alerta, Campo, Cargando, Casilla, ResumenErrores } from '../../components/ui';
import { dni, erroresDeApi, telefono, texto, validar } from '../../utils/validacion';

const VACIO = {
  apellido: '',
  nombre: '',
  dni: '',
  telefono: '',
  habilitado: true,
  domicilio: { calle: '', numero: '', piso: '', departamento: '' },
};

const REGLAS = {
  apellido: texto('el apellido'),
  nombre: texto('el nombre'),
  dni,
  telefono,
};

// Id fijos para que el resumen de errores pueda enlazar a cada campo.
const CAMPOS = {
  apellido: { id: 'vendedor-apellido', etiqueta: 'Apellido' },
  nombre: { id: 'vendedor-nombre', etiqueta: 'Nombre' },
  dni: { id: 'vendedor-dni', etiqueta: 'DNI' },
  telefono: { id: 'vendedor-telefono', etiqueta: 'Teléfono' },
};

export default function VendedorForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [cargando, setCargando] = useState(editando);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef(null);
  const resumenRef = useRef(null);

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

  const campo = (clave) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [clave]: value }));
    setErrores((prev) => (prev[clave] ? { ...prev, [clave]: undefined } : prev));
  };

  const alSalir = (clave) => () => {
    const mensaje = REGLAS[clave]?.(form[clave], form);
    setErrores((prev) => ({ ...prev, [clave]: mensaje || undefined }));
  };

  const campoDomicilio = (clave) => (e) =>
    setForm((f) => ({ ...f, domicilio: { ...f.domicilio, [clave]: e.target.value } }));

  /**
   * Con un solo error el foco va al campo; con varios al resumen, para no
   * esconder los demas detras del primero.
   */
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

    // Al editar, el DNI viaja deshabilitado y no se puede corregir: no tiene
    // sentido frenar el guardado por una regla que el usuario no puede cumplir.
    const reglas = editando ? { ...REGLAS, dni: null } : REGLAS;
    const mapa = validar(form, reglas);
    setErrores(mapa);
    if (Object.keys(mapa).length > 0) {
      enfocarError(mapa);
      return;
    }

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
      const { porCampo, general } = erroresDeApi(err);
      setErrores(porCampo);
      setError(general);
      enfocarError(porCampo);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <Cargando texto="Cargando el vendedor..." />;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">
        {editando ? 'Editar vendedor' : 'Nuevo vendedor'}
      </h1>

      <form ref={formRef} onSubmit={enviar} noValidate className="card space-y-5">
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
            ayuda={editando ? undefined : 'Sin puntos. Será su usuario y su clave inicial.'}
          />
          <Campo
            etiqueta="Teléfono"
            requerido
            id={CAMPOS.telefono.id}
            name="telefono"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            placeholder="3764 123456"
            value={form.telefono}
            onChange={campo('telefono')}
            onBlur={alSalir('telefono')}
            error={errores.telefono}
          />
        </div>

        <fieldset className="fieldset">
          <legend className="legend">Domicilio</legend>
          <p className="hint mb-3">Opcional. Si no completa la calle, no se guarda ningún domicilio.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo
              etiqueta="Calle"
              name="calle"
              autoComplete="address-line1"
              maxLength={80}
              value={form.domicilio.calle}
              onChange={campoDomicilio('calle')}
              contenedorClassName="sm:col-span-2"
            />
            <Campo
              etiqueta="Número"
              name="numero"
              inputMode="numeric"
              maxLength={10}
              value={form.domicilio.numero}
              onChange={campoDomicilio('numero')}
            />
          </div>
        </fieldset>

        {!editando && (
          <Casilla
            etiqueta="Habilitado para vender"
            ayuda="Si lo deja sin marcar, el vendedor queda creado pero no puede ingresar al sistema."
            checked={form.habilitado}
            onChange={(e) => setForm((f) => ({ ...f, habilitado: e.target.checked }))}
          />
        )}

        <Alerta tipo="error">{error}</Alerta>

        <div className="btn-fila border-t border-slate-200 pt-5">
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/admin/vendedores')}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
