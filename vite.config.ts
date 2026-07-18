/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ["xlsx"],
          vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "@supabase/supabase-js", "zustand"],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
