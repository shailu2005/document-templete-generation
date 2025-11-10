import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["docx", "file-saver"],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});