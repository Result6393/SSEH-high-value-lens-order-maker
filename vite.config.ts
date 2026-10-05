import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  // Older iPhones (Safari < 16.4) silently fail to start on newer syntax; transpile for them.
  build: { target: ['es2019', 'safari13'] },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Toric IOL Request',
        short_name: 'Toric IOL',
        description: 'Prepare toric IOL approval emails from a biometry photo',
        theme_color: '#0b5cad',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the OCR engine and model so the app works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,gz,pdf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
});
