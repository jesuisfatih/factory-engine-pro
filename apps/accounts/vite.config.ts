import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

const previewAllowedHosts = [
  'app.dtfbank.com',
  'accounts.dtfbank.com',
  'person.dtfbank.com',
  ...(process.env.VITE_PREVIEW_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean),
];

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: './src/routes', generatedRouteTree: './src/routeTree.gen.ts' }),
    react(),
  ],
  server: { port: 5187, strictPort: true, host: '127.0.0.1' },
  preview: { allowedHosts: previewAllowedHosts },
  resolve: {
    alias: { '@': '/src' },
  },
});
