import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built app work on GitHub Pages (any sub-path) and locally.
export default defineConfig({ base: './', plugins: [react()] });
