import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const ROOT = new URL("./dist", import.meta.url).pathname;
const PORT = process.env.PORT || 3000;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  // Prevent path traversal; SPA-fallback to index.html.
  let rel = normalize(decodeURIComponent((req.url || "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, rel === "/" ? "index.html" : rel);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(ROOT, "index.html");
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    const data = await readFile(join(ROOT, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data);
  }
}).listen(PORT, () => console.log("prototype on :" + PORT));
