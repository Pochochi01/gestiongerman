/** Estructura comun: barra superior + menu lateral segun el rol. */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MENUS = {
  ADMIN: [
    { to: '/admin', label: 'Panel', end: true },
    { to: '/admin/vendedores', label: 'Vendedores' },
    { to: '/admin/sorteos', label: 'Sorteos' },
    { to: '/admin/numeros', label: 'Cargar numeros' },
    { to: '/admin/cartones', label: 'Cartones' },
    { to: '/admin/whatsapp', label: 'WhatsApp' },
  ],
  VENDEDOR: [
    { to: '/vendedor', label: 'Panel', end: true },
    { to: '/vendedor/jugadores', label: 'Mis clientes' },
    { to: '/vendedor/jugadores/nuevo', label: 'Nuevo jugador' },
    { to: '/vendedor/cartones', label: 'Cartones vendidos' },
  ],
  JUGADOR: [
    { to: '/jugador', label: 'Mi panel', end: true },
    { to: '/jugador/cartones', label: 'Mis cartones' },
    { to: '/jugador/sorteos', label: 'Mis sorteos' },
    { to: '/jugador/elegir', label: 'Elegir numeros' },
  ],
};

export default function AppLayout() {
  const { usuario, perfil, logout } = useAuth();
  const navigate = useNavigate();
  const menu = MENUS[usuario?.rol] || [];

  const salir = () => {
    logout();
    navigate('/login');
  };

  const nombre = perfil ? `${perfil.apellido}, ${perfil.nombre}` : usuario?.username;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-bingo-600 text-lg font-black text-white">
              B
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">Bingo DGG</p>
              <p className="text-xs text-slate-500">{usuario?.rol}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{nombre}</p>
              <NavLink to="/password" className="text-xs text-bingo-600 hover:underline">
                Cambiar clave
              </NavLink>
            </div>
            <button type="button" className="btn-secondary" onClick={salir}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="space-y-1">
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-bingo-600 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <nav className="flex gap-2 overflow-x-auto pb-1 md:hidden">
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-bingo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
