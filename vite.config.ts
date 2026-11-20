import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── версия игры ─────────────────────────────────────────────────────────────
// Номер берётся из package.json (его поднимает `npm run bump`), а номер сборки —
// из момента сборки, поэтому каждая сборка отличается даже без смены версии.
// Всё это видно в игре внизу экрана: «v0.3.0 · сборка 19.11.2026 14:03».
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")) as { version?: string };
const VERSION = pkg.version || "0.0.0";
const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const BUILD = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
const BUILD_ID = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
    __APP_BUILD__: JSON.stringify(BUILD),
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  // разрешаем превью-домены песочницы (*.e2b.app), локальная разработка не меняется
  server: { allowedHosts: ['.e2b.app'] },
  preview: { allowedHosts: ['.e2b.app'] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
