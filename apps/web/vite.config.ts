/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? 3000}`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The frontend calls /api/*; in dev Vite forwards it to the Fastify server, which answers there too.
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  // https://mantine.dev/guides/vitest/
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./vitest.setup.mjs",
  },
});
