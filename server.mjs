import { createRequestHandler } from "@remix-run/express";
import { installGlobals } from "@remix-run/node";
import express from "express";

console.log("=== Server starting ===");
console.log("PORT:", process.env.PORT);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("ADMIN_PASSWORD exists:", !!process.env.ADMIN_PASSWORD);
console.log("ADMIN_PASSWORD value:", process.env.ADMIN_PASSWORD);
console.log("SHOPIFY_API_KEY exists:", !!process.env.SHOPIFY_API_KEY);

installGlobals();

const port = Number(process.env.PORT || 3000);

try {
  console.log("Loading build...");
  const build = await import("./build/server/index.js");
  console.log("Build loaded successfully");

  const app = express();
  app.use(express.static("build/client"));
  app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

  app.listen(port, "0.0.0.0", () => {
    console.log(`=== Server listening on http://0.0.0.0:${port} ===`);
  });
} catch (err) {
  console.error("=== FATAL ERROR ===");
  console.error(err);
  process.exit(1);
}
