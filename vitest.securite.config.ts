/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Config dédiée aux tests de sécurité (intrusion réseau + scan du bundle).
// Lancée par `npm run test:securite`, séparée du run standard pour ne pas
// taper le projet Supabase réel à chaque `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/securite/**/*.test.ts"],
    testTimeout: 20000, // appels réseau vers Supabase
  },
});
