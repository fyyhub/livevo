import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const apiOrigin = "http://api.hclyz.com:81";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"]
]);

const server = createServer((req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (requestUrl.pathname.startsWith("/mf-api/")) {
    const targetPath = `${requestUrl.pathname.replace(/^\/mf-api/, "")}${requestUrl.search}`;
    proxyRequest(req, res, new URL(targetPath, apiOrigin), {
      referer: `${apiOrigin}/`
    });
    return;
  }

  if (requestUrl.pathname === "/stream-proxy") {
    const target = requestUrl.searchParams.get("url");
    if (!target) {
      writeText(res, 400, "Missing url");
      return;
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      writeText(res, 400, "Invalid url");
      return;
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      writeText(res, 400, "Unsupported protocol");
      return;
    }

    proxyRequest(req, res, targetUrl, {
      referer: `${targetUrl.protocol}//${targetUrl.host}/`
    });
    return;
  }

  serveStatic(requestUrl.pathname, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`zhibolive listening on http://0.0.0.0:${port}`);
});

function serveStatic(pathname, res) {
  const safePathname = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(distDir, `.${decodeURIComponent(safePathname)}`);

  if (!filePath.startsWith(distDir)) {
    writeText(res, 403, "Forbidden");
    return;
  }

  const finalPath = existsSync(filePath) && statSync(filePath).isFile()
    ? filePath
    : path.join(distDir, "index.html");

  const extension = path.extname(finalPath);
  res.setHeader("Content-Type", mimeTypes.get(extension) ?? "application/octet-stream");
  res.setHeader(
    "Cache-Control",
    finalPath.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache"
  );
  createReadStream(finalPath).pipe(res);
}

function proxyRequest(req, res, targetUrl, options) {
  const transport = targetUrl.protocol === "https:" ? https : http;
  const headers = {
    "User-Agent": req.headers["user-agent"] ?? "zhibolive",
    Accept: req.headers.accept ?? "*/*",
    Referer: options.referer
  };

  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  const proxy = transport.request(
    targetUrl,
    {
      method: req.method,
      headers
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode ?? 200;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (key.toLowerCase() === "set-cookie" || value === undefined) {
          continue;
        }
        res.setHeader(key, value);
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      proxyRes.pipe(res);
    }
  );

  proxy.on("error", () => {
    if (!res.headersSent) {
      writeText(res, 502, "Proxy failed");
    } else {
      res.end();
    }
  });

  req.on("close", () => proxy.destroy());

  if (req.method === "GET" || req.method === "HEAD") {
    proxy.end();
  } else {
    req.pipe(proxy);
  }
}

function writeText(res, status, text) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}
