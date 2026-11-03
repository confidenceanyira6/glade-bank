import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built mockup work on GitHub Pages sub-paths.
export default defineConfig({ base: './', plugins: [react()] });
