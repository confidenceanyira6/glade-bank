import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build working from any path. Vendor code is split into its own long-cached chunks.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
