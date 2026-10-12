import { useState } from 'react';
import { authApi } from '../api/endpoints';
import { Alerta } from '../components/ui';

export default function CambiarPassword() {
  const [form, setForm] = useState({ actual: '', nueva: '', repetir: '' });
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setMensaje(null);
    if (form.nueva !== form.repetir) {
      setMensaje({ tipo: 'error', texto: 'Las claves nuevas no coinciden' });
      return;
    }
    setEnviando(true);
    try {
      await authApi.cambiarPassword(form.actual, form.nueva);
      setMensaje({ tipo: 'exito', texto: 'Clave actualizada correctamente' });
      setForm({ actual: '', nueva: '', repetir: '' });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-md">
      <h1 className="mb-4 text-xl font-bold text-slate-900">Cambiar clave</h1>
      <form onSubmit={enviar} className="card space-y-4">
        <div>
          <label className="label">Clave actual</label>
          <input
            type="password"
            className="input"
            value={form.actual}
            onChange={(e) => setForm({ ...form, actual: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Clave nueva (minimo 6 caracteres)</label>
          <input
            type="password"
            className="input"
            minLength={6}
            value={form.nueva}
            onChange={(e) => setForm({ ...form, nueva: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Repetir clave nueva</label>
          <input
            type="password"
            className="input"
            minLength={6}
            value={form.repetir}
            onChange={(e) => setForm({ ...form, repetir: e.target.value })}
            required
          />
        </div>

        {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}

        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </div>
  );
}
