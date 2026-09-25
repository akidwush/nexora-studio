import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Security: NEVER expose the development server to public interfaces by default.
// This supplements patched Vite; explicit --host overrides are operator responsibility.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    fs: { strict: true },
  },
  preview: { host: '127.0.0.1' },
});
