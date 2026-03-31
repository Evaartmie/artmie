import http from "node:http";

const port = Number(process.env.PORT || 3000);

console.log("=== HELLO FROM SERVER.MJS ===");
console.log("PORT:", port);

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Server is running!");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Listening on port ${port}`);
});
