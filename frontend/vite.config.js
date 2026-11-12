import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" permite publicar el build en cualquier carpeta (por ejemplo GitHub Pages)
export default defineConfig({
  plugins: [react()],
  base: "./",
});
