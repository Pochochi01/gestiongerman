/**
 * Cliente axios unico del frontend.
 * - Inyecta el JWT guardado en localStorage.
 * - Normaliza la respuesta { ok, data } y los errores { ok:false, error }.
 * - Ante un 401 limpia la sesion y redirige al login.
 */
import axios from 'axios';

const TOKEN_KEY = 'bingodgg_token';

export const guardarToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const leerToken = () => localStorage.getItem(TOKEN_KEY);
export const borrarToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = leerToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const mensaje =
      error.response?.data?.error ||
      (error.code === 'ECONNABORTED' ? 'El servidor tardo demasiado' : 'Error de conexion');

    if (status === 401 && !window.location.pathname.startsWith('/login')) {
      borrarToken();
      window.location.href = '/login';
    }

    return Promise.reject(
      Object.assign(new Error(mensaje), {
        status,
        detalles: error.response?.data?.detalles || null,
      })
    );
  }
);

/** Desenvuelve la respuesta del backend: devuelve `data` directamente. */
export const extraer = (respuesta) => respuesta.data?.data;

export default api;
