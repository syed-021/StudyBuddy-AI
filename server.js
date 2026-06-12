const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

if (process.argv.includes("--check")) {
  ["index.html", "styles.css", "app.js"].forEach((file) => {
    if (!fs.existsSync(path.join(root, file))) {
      console.error(`Missing ${file}`);
      process.exit(1);
    }
  });
  console.log("StudyBuddy AI build check passed.");
  process.exit(0);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const requested = url.pathname === "/" || safePath === "/" || safePath === "\\" ? "index.html" : safePath.replace(/^[/\\]/, "");
  const filePath = path.join(root, requested);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`StudyBuddy AI running at http://localhost:${port}`);
});
