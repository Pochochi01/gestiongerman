/**
 * Configuración de PM2 para la API.
 *
 * Arrancar:   pm2 start deploy/ecosystem.config.cjs
 * Recargar:   pm2 reload bingodgg-api        (sin cortar pedidos en curso)
 * Al booteo:  pm2 startup && pm2 save
 *
 * Las variables sensibles (clave de la base, JWT_SECRET) van en
 * `backend/.env`, NO acá: este archivo se versiona.
 */
module.exports = {
  apps: [
    {
      name: 'bingodgg-api',
      script: 'src/server.js',
      cwd: '/var/www/bingodgg/backend', // <-- ajustar a la ruta real

      // Una sola instancia: el estado de la conexión de WhatsApp y los timers
      // de reconexión viven en memoria del proceso. Con varias instancias cada
      // una abriría su propia sesión y WhatsApp invalidaría el dispositivo.
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        // Debe coincidir con el `upstream` de deploy/nginx/bingodgg.conf
        PORT: 5006,
        // Detrás de nginx: 1 salto de proxy.
        TRUST_PROXY: 1,
      },

      // Reinicio ante caída, con freno para no entrar en bucle.
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 5000,

      // Si el proceso pasa de esto, algo quedó colgado: mejor reiniciarlo.
      max_memory_restart: '500M',

      error_file: '/var/log/pm2/bingodgg-api.error.log',
      out_file: '/var/log/pm2/bingodgg-api.out.log',
      time: true,
    },
  ],
};
