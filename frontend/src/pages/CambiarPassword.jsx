/**
 * Cambio de clave del usuario que esta en sesion.
 *
 * Los tres campos llevan `autoComplete` explicito para que el gestor de claves
 * del navegador guarde la nueva en lugar de volver a ofrecer la vieja.
 */
import { useRef, useState } from 'react';
import { authApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { Alerta, Campo } from '../components/ui';
import { clave as reglaClave, validar } from '../utils/validacion';

const VACIO = { actual: '', nueva: '', repetir: '' };

const REGLAS = {
  actual: (v) => (v ? null : 'Falta la clave actual.'),
  nueva: reglaClave,
  repetir: (v, form) => {
    if (!v) return 'Repita la clave nueva.';
    if (v !== form.nueva) return 'Las dos claves nuevas no coinciden.';
    return null;
  },
};

export default function CambiarPassword() {
  const { setUsuario } = useAuth();
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef(null);

  const campo = (clave) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [clave]: value }));
    setErrores((prev) => (prev[clave] ? { ...prev, [clave]: undefined } : prev));
  };

  const enviar = async (e) => {
    e.preventDefault();
    setMensaje(null);

    const mapa = validar(form, REGLAS);
    setErrores(mapa);
    if (Object.keys(mapa).length > 0) {
      const primero = Object.keys(REGLAS).find((c) => mapa[c]);
      formRef.current?.querySelector(`[name="${primero}"]`)?.focus();
      return;
    }

    setEnviando(true);
    try {
      await authApi.cambiarPassword(form.actual, form.nueva);
      setMensaje({ tipo: 'exito', texto: 'Clave actualizada. La próxima vez ingrese con la nueva.' });
      setForm(VACIO);
      setErrores({});
      // La clave ya es propia: se baja la bandera para que desaparezca el
      // aviso de clave provisoria sin tener que volver a entrar.
      setUsuario((u) => (u ? { ...u, debe_cambiar_password: false } : u));
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
      // La clave actual es lo unico que el servidor puede rechazar aca.
      setErrores({ actual: 'Revise la clave actual.' });
      formRef.current?.querySelector('[name="actual"]')?.focus();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Cambiar clave</h1>

      <form ref={formRef} onSubmit={enviar} noValidate className="card space-y-4">
        <Campo
          etiqueta="Clave actual"
          requerido
          name="actual"
          type="password"
          autoComplete="current-password"
          value={form.actual}
          onChange={campo('actual')}
          error={errores.actual}
        />
        <Campo
          etiqueta="Clave nueva"
          requerido
          name="nueva"
          type="password"
          autoComplete="new-password"
          minLength={6}
          value={form.nueva}
          onChange={campo('nueva')}
          error={errores.nueva}
          ayuda="Al menos 6 caracteres."
        />
        <Campo
          etiqueta="Repetir la clave nueva"
          requerido
          name="repetir"
          type="password"
          autoComplete="new-password"
          minLength={6}
          value={form.repetir}
          onChange={campo('repetir')}
          error={errores.repetir}
        />

        {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}

        <div className="btn-fila border-t border-slate-200 pt-4">
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Guardar la clave nueva'}
          </button>
        </div>
      </form>
    </div>
  );
}
