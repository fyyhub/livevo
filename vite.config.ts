import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

function streamProxy(): Plugin {
  return {
    name: "stream-proxy",
    configureServer(server) {
      server.middlewares.use("/stream-proxy", (req, res) => {
        const requestUrl = new URL(req.url ?? "/", "http://localhost");
        const target = requestUrl.searchParams.get("url");

        if (!target) {
          res.statusCode = 400;
          res.end("Missing url");
          return;
        }

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          res.statusCode = 400;
          res.end("Invalid url");
          return;
        }

        if (!["http:", "https:"].includes(parsed.protocol)) {
          res.statusCode = 400;
          res.end("Unsupported protocol");
          return;
        }

        const transport = parsed.protocol === "https:" ? https : http;
        const proxyRequest = transport.get(
          parsed,
          {
            headers: {
              "User-Agent": req.headers["user-agent"] ?? "zhibolive-dev-proxy",
              Referer: `${parsed.protocol}//${parsed.host}/`
            }
          },
          (proxyResponse) => {
            res.statusCode = proxyResponse.statusCode ?? 200;
            for (const [key, value] of Object.entries(proxyResponse.headers)) {
              if (key.toLowerCase() === "set-cookie" || value === undefined) {
                continue;
              }
              res.setHeader(key, value);
            }
            proxyResponse.pipe(res);
          }
        );

        proxyRequest.on("error", () => {
          if (!res.headersSent) {
            res.statusCode = 502;
          }
          res.end("Stream proxy failed");
        });

        req.on("close", () => proxyRequest.destroy());
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), streamProxy()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/mf-api": {
        target: "http://api.hclyz.com:81",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mf-api/, "")
      }
    }
  }
});
