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

function vendorChunk(id: string) {
  const normalized = id.replace(/\\/g, '/');
  if (!normalized.includes('/node_modules/')) return undefined;
  if (normalized.includes('/react/') || normalized.includes('/react-dom/') || normalized.includes('/scheduler/')) {
    return 'vendor-react';
  }
  if (normalized.includes('/@radix-ui/')) return 'vendor-radix';
  if (normalized.includes('/lucide-react/')) return 'vendor-icons';
  return undefined;
}

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
  ],
  server: { port: 5187, strictPort: true, host: '127.0.0.1' },
  preview: { allowedHosts: previewAllowedHosts },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
