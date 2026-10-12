import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// El backend puede correr en otro puerto (si el 4000 esta ocupado): se define
// con VITE_PROXY_TARGET en frontend/.env, sin tocar este archivo.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true },
      },
    },
  };
});
