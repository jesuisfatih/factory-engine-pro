import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildId = process.env.VITE_BUILD_ID
  ?? process.env.APP_BUILD_SHA
  ?? process.env.GIT_COMMIT_SHA
  ?? `local-${Date.now().toString(36)}`;
const builtAt = new Date().toISOString();

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
  base: process.env.VITE_PERSON_BASE_PATH ?? '/',
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    {
      name: 'person-build-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId, builtAt }),
        });
      },
    },
  ],
  server: { port: 5188, strictPort: true, host: '127.0.0.1' },
  preview: { allowedHosts: previewAllowedHosts },
});
