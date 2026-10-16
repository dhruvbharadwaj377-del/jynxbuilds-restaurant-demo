import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    // The 3D scene chunk (three.js) is lazy-loaded after first paint and
    // skipped entirely on Save-Data / no-WebGL devices, so its size is expected.
    chunkSizeWarningLimit: 700,
  },
})
