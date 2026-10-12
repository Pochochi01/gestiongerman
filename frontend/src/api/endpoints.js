/** Todas las llamadas HTTP del sistema, agrupadas por modulo. */
import api, { extraer } from './client';

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }).then(extraer),
  perfil: () => api.get('/auth/perfil').then(extraer),
  cambiarPassword: (passwordActual, passwordNueva) =>
    api.put('/auth/password', { password_actual: passwordActual, password_nueva: passwordNueva }).then(extraer),
};

export const vendedoresApi = {
  listar: (params) => api.get('/vendedores', { params }).then(extraer),
  obtener: (id) => api.get(`/vendedores/${id}`).then(extraer),
  crear: (datos) => api.post('/vendedores', datos).then(extraer),
  actualizar: (id, datos) => api.put(`/vendedores/${id}`, datos).then(extraer),
  habilitacion: (id, habilitado) =>
    api.patch(`/vendedores/${id}/habilitacion`, { habilitado }).then(extraer),
  /** Resumen de cartones vendidos por sorteo. */
  cartonesPorSorteo: (id) => api.get(`/vendedores/${id}/cartones`).then(extraer),
  eliminar: (id, forzar = false) =>
    api.delete(`/vendedores/${id}`, { params: forzar ? { forzar: true } : undefined }).then(extraer),
};

export const jugadoresApi = {
  listar: (params) => api.get('/jugadores', { params }).then(extraer),
  obtener: (id) => api.get(`/jugadores/${id}`).then(extraer),
  crear: (datos) => api.post('/jugadores', datos).then(extraer),
  /**
   * Alta completa: jugador + carton + PDF con QR + enlace de WhatsApp.
   * Es lo que dispara el boton "Guardar jugador".
   */
  nuevo: (datos) => api.post('/jugadores/nuevo', datos).then(extraer),
  /** Reemite el PDF de un carton ya vendido. */
  reemitirPdf: (cartonId) => api.post(`/jugadores/cartones/${cartonId}/pdf`).then(extraer),
  actualizar: (id, datos) => api.put(`/jugadores/${id}`, datos).then(extraer),
};

export const sorteosApi = {
  listar: () => api.get('/sorteos').then(extraer),
  vigente: () => api.get('/sorteos/vigente').then(extraer),
  obtener: (id) => api.get(`/sorteos/${id}`).then(extraer),
  jornadas: (id) => api.get(`/sorteos/${id}/jornadas`).then(extraer),
  /** Últimos sorteos en los que participó quien consulta (por defecto 10). */
  historial: (limite = 10) => api.get('/sorteos/historial', { params: { limite } }).then(extraer),
  ranking: (id, limite = 20) => api.get(`/sorteos/${id}/ranking`, { params: { limite } }).then(extraer),
  ganadores: (id) => api.get(`/sorteos/${id}/ganadores`).then(extraer),
  /** Cartones del sorteo, opcionalmente de un solo vendedor. */
  cartones: (id, vendedorId = null) =>
    api
      .get(`/sorteos/${id}/cartones`, { params: vendedorId ? { vendedor: vendedorId } : undefined })
      .then(extraer),
  notificarGanadores: (id) => api.post(`/sorteos/${id}/notificar-ganadores`).then(extraer),
  crear: (datos) => api.post('/sorteos', datos).then(extraer),
  actualizar: (id, datos) => api.put(`/sorteos/${id}`, datos).then(extraer),
  abrirVenta: (id) => api.post(`/sorteos/${id}/abrir-venta`).then(extraer),
  iniciar: (id, forzado = false) => api.post(`/sorteos/${id}/iniciar`, { forzado }).then(extraer),
  // `numeros` son los valores de la quiniela (hasta 4 cifras cada uno);
  // el backend valida los cartones con las dos últimas.
  cargarNumeros: (id, fecha, numeros, numeroSorteo = null) =>
    api
      .post(`/sorteos/${id}/numeros`, {
        fecha,
        numeros,
        numero_sorteo: numeroSorteo || undefined,
      })
      .then(extraer),
};

export const cartonesApi = {
  listar: (params) => api.get('/cartones', { params }).then(extraer),
  obtener: (id) => api.get(`/cartones/${id}`).then(extraer),
  vender: (jugadorId, numeros) =>
    api.post('/cartones', { jugador_id: jugadorId, numeros }).then(extraer),
  habilitar: (id) => api.patch(`/cartones/${id}/habilitar`).then(extraer),
  notificarHabilitado: (id) => api.post(`/cartones/${id}/notificar-habilitado`).then(extraer),
  /** Cambio de estado unificado: { estado_pago, habilitado }. */
  actualizarEstado: (id, cambios) => api.patch(`/cartones/${id}`, cambios).then(extraer),
  rendir: (id) => api.patch(`/cartones/${id}/rendir`).then(extraer),
  anular: (id) => api.patch(`/cartones/${id}/anular`).then(extraer),
  subirComprobante: (id, archivo) => {
    const form = new FormData();
    form.append('comprobante', archivo);
    return api
      .post(`/cartones/${id}/comprobante`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(extraer);
  },
};

export const whatsappApi = {
  estado: () => api.get('/whatsapp/estado').then(extraer),
  qr: () => api.get('/whatsapp/qr').then(extraer),
  mensajes: (limite = 100) => api.get('/whatsapp/mensajes', { params: { limite } }).then(extraer),
  vincular: () => api.post('/whatsapp/vincular').then(extraer),
  desvincular: () => api.post('/whatsapp/desvincular').then(extraer),
  reintentar: () => api.post('/whatsapp/reintentar').then(extraer),
  reenviarCarton: (cartonId) => api.post(`/whatsapp/cartones/${cartonId}/reenviar`).then(extraer),
};


/** Validacion publica del QR del carton (no requiere sesion). */
export const validacionApi = {
  porToken: (token) => api.get(`/validar/${token}`).then(extraer),
};
