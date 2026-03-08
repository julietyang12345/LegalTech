import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 4173,
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_ORIGIN || 'http://localhost:4300',
          changeOrigin: true,
        },
      },
    },
  };
});
