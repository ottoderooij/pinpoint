// Tiny zero-dependency dev server: run `node server.js`, then open http://localhost:5173
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 5173;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(__dirname)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end("Not found");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Pinpoint running at http://localhost:${PORT}`));
