import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alerta, Campo } from '../components/ui';
import { INICIO_POR_ROL } from '../components/RutaProtegida';

export default function Login() {
  const { usuario, login, cargando } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!cargando && usuario) return <Navigate to={INICIO_POR_ROL[usuario.rol]} replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const u = await login(form.username.trim(), form.password);
      navigate(INICIO_POR_ROL[u.rol] || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marca-700 to-marca-900 p-4">
      <main className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 text-center">
          <span
            className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-marca-600 text-lg font-black tracking-tight text-white"
            aria-hidden="true"
          >
            DG
          </span>
          <h1 className="text-xl font-bold text-slate-900">DGG Gestión</h1>
          <p className="mt-1 text-sm text-slate-600">Ingrese con su DNI</p>
        </div>

        <form onSubmit={enviar} className="space-y-4">
          <Campo
            etiqueta="Usuario (DNI)"
            requerido
            id="username"
            name="username"
            inputMode="numeric"
            autoComplete="username"
            autoFocus
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <Campo
            etiqueta="Clave"
            requerido
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          <Alerta tipo="error">{error}</Alerta>

          <button type="submit" className="btn-primary w-full" disabled={enviando}>
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Jugadores y vendedores: su usuario y su clave inicial son su número de DNI.
        </p>
      </main>
    </div>
  );
}
