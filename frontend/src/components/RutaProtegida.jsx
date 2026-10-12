/** Exige sesion iniciada y, opcionalmente, un rol determinado. */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Cargando } from './ui';

const INICIO_POR_ROL = { ADMIN: '/admin', VENDEDOR: '/vendedor', JUGADOR: '/jugador' };

export default function RutaProtegida({ roles, children }) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <Cargando texto="Verificando sesion..." />;
  if (!usuario) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to={INICIO_POR_ROL[usuario.rol] || '/login'} replace />;
  }
  return children;
}

export { INICIO_POR_ROL };
