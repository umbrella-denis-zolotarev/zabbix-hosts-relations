import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose ZABBIX_*, DATA_* and SSH_* to the client (the app calls the Zabbix
  // and data servers directly, no dev proxy), in addition to the default VITE_*.
  envPrefix: ["VITE_", "ZABBIX_", "DATA_", "SSH_"],
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
  },
});
