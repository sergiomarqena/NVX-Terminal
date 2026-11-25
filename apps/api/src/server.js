import http from "node:http";

const port = Number(process.env.PORT || 3001);
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200);
    res.end(JSON.stringify({
      name: "NORDVEX CHARTING API",
      status: "online",
      version: "0.1.0",
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`NORDVEX API listening on ${port}`);
});
