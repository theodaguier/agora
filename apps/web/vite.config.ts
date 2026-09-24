import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import svgr from "vite-plugin-svgr";

/** First LAN IPv4 of this machine: the address a phone on the same network can reach. */
const lanAddress = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;

export default defineConfig(({ command, mode }) => {
  // In development the page is on localhost, which the QR code can't hand to a phone:
  // unless VITE_MOBILE_SERVER_URL is set, point it at the API on this machine's LAN address.
  const lan = command === "serve" && !loadEnv(mode, process.cwd()).VITE_MOBILE_SERVER_URL && lanAddress();
  return {
    define: lan ? { "import.meta.env.VITE_MOBILE_SERVER_URL": JSON.stringify(`http://${lan}:3001`) } : {},
    plugins: [react(), tailwindcss(), svgr()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: { "/api": "http://localhost:3001" },
    },
  };
});
