import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// openDAW's engine shares memory between threads (SharedArrayBuffer), which browsers allow only on a
// cross-origin isolated page. These two headers make it so in `npm run dev` and `npm run preview`;
// public/_headers does the same on Cloudflare.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [
    react(),
    // The engine's WebAssembly files, served at /opendaw/wasm/… (see src/daw/boot.ts).
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@opendaw/studio-core-wasm/dist/wasm/**/*.wasm',
          dest: 'opendaw',
          rename: { stripBase: 4 }, // drop node_modules/@opendaw/studio-core-wasm/dist
        },
      ],
    }),
  ],
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
