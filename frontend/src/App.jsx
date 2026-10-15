import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import RutaProtegida, { INICIO_POR_ROL } from './components/RutaProtegida';

import Login from './pages/Login';
import CambiarPassword from './pages/CambiarPassword';
import Validar from './pages/Validar';

import AdminPanel from './pages/admin/Panel';
import AdminAdministradores from './pages/admin/Administradores';
import AdminAdministradorForm from './pages/admin/AdministradorForm';
import AdminVendedores from './pages/admin/Vendedores';
import AdminVendedorForm from './pages/admin/VendedorForm';
import AdminSorteos from './pages/admin/Sorteos';
import AdminSorteoDetalle from './pages/admin/SorteoDetalle';
import AdminCargarNumeros from './pages/admin/CargarNumeros';
import AdminCartones from './pages/admin/Cartones';
import AdminWhatsapp from './pages/admin/Whatsapp';

import VendedorPanel from './pages/vendedor/Panel';
import VendedorJugadores from './pages/vendedor/Jugadores';
import VendedorJugadorForm from './pages/vendedor/JugadorForm';
import VendedorCartones from './pages/vendedor/Cartones';

import JugadorPanel from './pages/jugador/Panel';
import JugadorCartones from './pages/jugador/Cartones';
import JugadorCartonDetalle from './pages/jugador/CartonDetalle';
import JugadorElegirNumeros from './pages/jugador/ElegirNumeros';
import JugadorSorteos from './pages/jugador/Sorteos';

/** Redirige a la portada del rol que tenga la sesion. */
function Inicio() {
  const { usuario } = useAuth();
  return <Navigate to={usuario ? INICIO_POR_ROL[usuario.rol] : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Validacion publica del QR del carton: fuera de las rutas protegidas. */}
      <Route path="/validar/:token" element={<Validar />} />

      <Route
        element={
          <RutaProtegida>
            <AppLayout />
          </RutaProtegida>
        }
      >
        <Route path="/" element={<Inicio />} />
        <Route path="/password" element={<CambiarPassword />} />

        {/* ---- Modulo 1: Administrador ---- */}
        <Route path="/admin" element={<RutaProtegida roles={['ADMIN']}><AdminPanel /></RutaProtegida>} />
        <Route path="/admin/administradores" element={<RutaProtegida roles={['ADMIN']}><AdminAdministradores /></RutaProtegida>} />
        <Route path="/admin/administradores/nuevo" element={<RutaProtegida roles={['ADMIN']}><AdminAdministradorForm /></RutaProtegida>} />
        <Route path="/admin/administradores/:id" element={<RutaProtegida roles={['ADMIN']}><AdminAdministradorForm /></RutaProtegida>} />
        <Route path="/admin/vendedores" element={<RutaProtegida roles={['ADMIN']}><AdminVendedores /></RutaProtegida>} />
        <Route path="/admin/vendedores/nuevo" element={<RutaProtegida roles={['ADMIN']}><AdminVendedorForm /></RutaProtegida>} />
        <Route path="/admin/vendedores/:id" element={<RutaProtegida roles={['ADMIN']}><AdminVendedorForm /></RutaProtegida>} />
        <Route path="/admin/sorteos" element={<RutaProtegida roles={['ADMIN']}><AdminSorteos /></RutaProtegida>} />
        <Route path="/admin/sorteos/:id" element={<RutaProtegida roles={['ADMIN']}><AdminSorteoDetalle /></RutaProtegida>} />
        <Route path="/admin/numeros" element={<RutaProtegida roles={['ADMIN']}><AdminCargarNumeros /></RutaProtegida>} />
        <Route path="/admin/cartones" element={<RutaProtegida roles={['ADMIN']}><AdminCartones /></RutaProtegida>} />
        <Route path="/admin/whatsapp" element={<RutaProtegida roles={['ADMIN']}><AdminWhatsapp /></RutaProtegida>} />

        {/* ---- Modulo 2: Vendedores ---- */}
        <Route path="/vendedor" element={<RutaProtegida roles={['VENDEDOR']}><VendedorPanel /></RutaProtegida>} />
        <Route path="/vendedor/jugadores" element={<RutaProtegida roles={['VENDEDOR']}><VendedorJugadores /></RutaProtegida>} />
        <Route path="/vendedor/jugadores/nuevo" element={<RutaProtegida roles={['VENDEDOR']}><VendedorJugadorForm /></RutaProtegida>} />
        <Route path="/vendedor/cartones" element={<RutaProtegida roles={['VENDEDOR']}><VendedorCartones /></RutaProtegida>} />

        {/* ---- Modulo 3: Jugadores ---- */}
        <Route path="/jugador" element={<RutaProtegida roles={['JUGADOR']}><JugadorPanel /></RutaProtegida>} />
        <Route path="/jugador/cartones" element={<RutaProtegida roles={['JUGADOR']}><JugadorCartones /></RutaProtegida>} />
        <Route path="/jugador/cartones/:id" element={<RutaProtegida roles={['JUGADOR']}><JugadorCartonDetalle /></RutaProtegida>} />
        <Route path="/jugador/sorteos" element={<RutaProtegida roles={['JUGADOR']}><JugadorSorteos /></RutaProtegida>} />
        <Route path="/jugador/elegir" element={<RutaProtegida roles={['JUGADOR']}><JugadorElegirNumeros /></RutaProtegida>} />
      </Route>

      <Route path="*" element={<Inicio />} />
    </Routes>
  );
}
