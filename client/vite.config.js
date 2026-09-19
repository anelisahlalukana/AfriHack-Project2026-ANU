import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Component tests only; the plain-function tests in tests/*.test.js run under node --test.
  test: {
    environment: 'jsdom',
    include: ['tests/component/**/*.test.{js,jsx}'],
  },
})