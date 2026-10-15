/** Estructura comun: barra superior + menu lateral segun el rol. */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alerta } from '../components/ui';

const MENUS = {
  ADMIN: [
    { to: '/admin', label: 'Panel', end: true },
    { to: '/admin/vendedores', label: 'Vendedores' },
    { to: '/admin/administradores', label: 'Administradores' },
    { to: '/admin/sorteos', label: 'Sorteos' },
    { to: '/admin/numeros', label: 'Cargar números' },
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
    { to: '/jugador/elegir', label: 'Elegir números' },
  ],
};

/** El rol se guarda en mayusculas; en pantalla se lee en lenguaje llano. */
const TEXTO_ROL = {
  ADMIN: 'Administración',
  VENDEDOR: 'Vendedor',
  JUGADOR: 'Jugador',
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

  const claseEnlace = (base) => ({ isActive }) =>
    `${base} ${
      isActive
        ? 'bg-marca-600 text-white'
        : 'text-slate-700 hover:bg-white hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen">
      {/* Primer elemento enfocable de la pagina: permite saltear el menu, que
          en el movil son hasta seis enlaces antes del contenido. */}
      <a href="#contenido" className="salto-contenido">
        Ir al contenido
      </a>

      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-marca-600 text-sm font-black tracking-tight text-white"
              aria-hidden="true"
            >
              DG
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-slate-900">DGG Gestión</p>
              <p className="truncate text-xs text-slate-600">{TEXTO_ROL[usuario?.rol] || usuario?.rol}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium text-slate-800">{nombre}</p>
              <NavLink to="/password" className="text-xs font-medium text-marca-700 hover:underline">
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
          <nav className="space-y-1" aria-label="Secciones">
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={claseEnlace(
                  'block rounded-lg px-3 py-2 text-sm font-medium transition-colors'
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main id="contenido" className="min-w-0 flex-1 space-y-6">
          {/* En el movil el menu es una tira horizontal. El margen negativo la
              deja sangrar hasta el borde para que se note que sigue. */}
          <nav
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden"
            aria-label="Secciones"
          >
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex min-h-touch shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-marca-600 text-white'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {/* Clave provisoria: pasa cuando la cuenta es nueva o cuando un
              administrador le blanqueo la clave. Quien la blanqueo la conoce,
              asi que conviene que no siga en uso. Es un aviso y no una
              redireccion forzada: encerrar al usuario en una pantalla es peor
              que insistirle. */}
          {usuario?.debe_cambiar_password && (
            <Alerta tipo="aviso">
              Está usando una clave provisoria.{' '}
              <NavLink to="/password" className="font-semibold underline">
                Elija una clave propia
              </NavLink>
              : quien se la asignó la conoce.
            </Alerta>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
