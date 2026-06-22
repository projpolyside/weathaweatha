import { defineConfig } from "vite";
import path from "path";

const port = Number(process.env.PORT) || 3000;

export default defineConfig({
base: process.env.BASE_PATH || "/",
root: path.resolve(import.meta.dirname),
publicDir: "public",

build: {
outDir: path.resolve(import.meta.dirname, "dist"),
emptyOutDir: true,
},

server: {
port,
strictPort: false,
host: "0.0.0.0",
allowedHosts: true,
},

preview: {
port,
host: "0.0.0.0",
allowedHosts: true,
},
});
