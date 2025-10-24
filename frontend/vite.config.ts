import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: env.VITE_DEV_SERVER_HOST ?? '127.0.0.1',
      port: Number(env.VITE_DEV_SERVER_PORT ?? 5173),
      open: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.ts',
      css: true,
    },
  };
});
