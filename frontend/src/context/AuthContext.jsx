/** Sesion del usuario: token JWT, rol y perfil (vendedor o jugador). */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/endpoints';
import { borrarToken, guardarToken, leerToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al montar, si hay token se revalida contra el backend.
  useEffect(() => {
    if (!leerToken()) {
      setCargando(false);
      return;
    }
    authApi
      .perfil()
      .then((data) => {
        setUsuario(data.usuario);
        setPerfil(data.perfil);
      })
      .catch(() => borrarToken())
      .finally(() => setCargando(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await authApi.login(username, password);
    guardarToken(data.token);
    setUsuario(data.usuario);
    setPerfil(data.perfil);
    return data.usuario;
  }, []);

  const logout = useCallback(() => {
    borrarToken();
    setUsuario(null);
    setPerfil(null);
  }, []);

  const valor = useMemo(
    () => ({
      usuario,
      perfil,
      cargando,
      login,
      logout,
      setUsuario,
      esAdmin: usuario?.rol === 'ADMIN',
      esVendedor: usuario?.rol === 'VENDEDOR',
      esJugador: usuario?.rol === 'JUGADOR',
    }),
    [usuario, perfil, cargando, login, logout]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
