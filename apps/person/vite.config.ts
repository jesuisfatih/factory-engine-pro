import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react()],
  server: { port: 5188, strictPort: true, host: '127.0.0.1' },
  preview: { allowedHosts: previewAllowedHosts },
});
