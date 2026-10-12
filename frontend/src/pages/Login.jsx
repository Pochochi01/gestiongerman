import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alerta } from '../components/ui';
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-bingo-700 to-bingo-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-bingo-600 text-2xl font-black text-white">
            B
          </span>
          <h1 className="text-xl font-bold text-slate-900">Bingo DGG</h1>
          <p className="text-sm text-slate-500">Ingrese con su DNI</p>
        </div>

        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label className="label" htmlFor="username">Usuario (DNI)</label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Clave</label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <Alerta tipo="error">{error}</Alerta>

          <button type="submit" className="btn-primary w-full" disabled={enviando}>
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Jugadores y vendedores: su usuario y clave inicial son su numero de DNI.
        </p>
      </div>
    </div>
  );
}
