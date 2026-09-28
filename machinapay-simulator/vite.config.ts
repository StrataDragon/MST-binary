import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// MachinaPay robot simulator runs on LAPTOP 2, on its own IP on the LAN.
// host: true binds to 0.0.0.0 so it's reachable from Laptop 1 / the backend
// at http://<laptop-2-ip>:5174 instead of only localhost.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
  },
  preview: {
    host: true,
    port: 5174,
  },
});
