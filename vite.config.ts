import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev is driven by `netlify dev`, which runs this Vite server behind the
// Netlify proxy and serves the edge function at /api/* on the same origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // node_modules uses an isolated symlink layout (.deno/*), which can resolve a
  // dependency's React (e.g. dexie-react-hooks) to a second instance and trigger
  // "Invalid hook call / more than one copy of React". Force one React.
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'dexie', 'dexie-react-hooks'],
  },
})
