import { createRequestHandler } from "@remix-run/serve";
import { installGlobals } from "@remix-run/node";
import http from "node:http";

console.log("=== Server starting ===");
console.log("PORT:", process.env.PORT);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL);

installGlobals();

const port = Number(process.env.PORT || 3000);

try {
  console.log("Loading build...");
  const build = await import("./build/server/index.js");
  console.log("Build loaded successfully");

  const handler = createRequestHandler({ build, mode: process.env.NODE_ENV });
  console.log("Request handler created");

  const server = http.createServer(handler);

  server.listen(port, "0.0.0.0", () => {
    console.log(`=== Server listening on http://0.0.0.0:${port} ===`);
  });

  server.on("error", (err) => {
    console.error("Server error:", err);
  });
} catch (err) {
  console.error("=== FATAL ERROR ===");
  console.error(err);
  process.exit(1);
}
