const distRoot = new URL("./dist/", import.meta.url);
const apiOrigin = "http://api.hclyz.com:81";

const mimeTypes = new Map<string, string>([
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
  [".webp", "image/webp"],
]);

Deno.serve(async (req) => {
  const requestUrl = new URL(req.url);

  if (requestUrl.pathname.startsWith("/mf-api/")) {
    const targetPath = `${requestUrl.pathname.replace(/^\/mf-api/, "")}${requestUrl.search}`;
    return proxyRequest(req, new URL(targetPath, apiOrigin), {
      referer: `${apiOrigin}/`,
    });
  }

  if (requestUrl.pathname === "/stream-proxy") {
    const target = requestUrl.searchParams.get("url");
    if (!target) {
      return textResponse("Missing url", 400);
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      return textResponse("Invalid url", 400);
    }

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return textResponse("Unsupported protocol", 400);
    }

    return proxyRequest(req, targetUrl, {
      referer: `${targetUrl.protocol}//${targetUrl.host}/`,
    });
  }

  return serveStatic(requestUrl.pathname);
});

async function serveStatic(pathname: string): Promise<Response> {
  const safePathname = pathname === "/" ? "/index.html" : pathname;
  const fileUrl = resolveDistUrl(safePathname);
  if (!fileUrl) {
    return textResponse("Forbidden", 403);
  }

  const response = await readStatic(fileUrl, cacheControl(fileUrl));
  if (response) {
    return response;
  }

  if (safePathname.startsWith("/assets/") || extensionOf(safePathname)) {
    return textResponse("Not found", 404);
  }

  const indexUrl = new URL("./index.html", distRoot);
  return await readStatic(indexUrl, "no-cache") ?? textResponse("Not found", 404);
}

function resolveDistUrl(pathname: string): URL | undefined {
  try {
    const decodedPathname = decodeURIComponent(pathname);
    const fileUrl = new URL(`.${decodedPathname}`, distRoot);
    return fileUrl.href.startsWith(distRoot.href) ? fileUrl : undefined;
  } catch {
    return undefined;
  }
}

async function readStatic(fileUrl: URL, cacheControlValue: string): Promise<Response | undefined> {
  try {
    const file = await Deno.readFile(fileUrl);
    const headers = new Headers({
      "Cache-Control": cacheControlValue,
      "Content-Type": mimeTypes.get(extensionOf(fileUrl.pathname)) ?? "application/octet-stream",
    });
    return new Response(file, { headers });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw error;
  }
}

function cacheControl(fileUrl: URL): string {
  return fileUrl.pathname.includes("/assets/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

async function proxyRequest(
  req: Request,
  targetUrl: URL,
  options: { referer: string },
): Promise<Response> {
  const headers = new Headers({
    "Accept": req.headers.get("accept") ?? "*/*",
    "Referer": options.referer,
    "User-Agent": req.headers.get("user-agent") ?? "zhibolive",
  });

  const range = req.headers.get("range");
  if (range) {
    headers.set("Range", range);
  }

  try {
    const proxyResponse = await fetch(targetUrl, {
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      headers,
      method: req.method,
    });
    const responseHeaders = new Headers(proxyResponse.headers);
    responseHeaders.delete("set-cookie");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(proxyResponse.body, {
      headers: responseHeaders,
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
    });
  } catch {
    return textResponse("Proxy failed", 502);
  }
}

function textResponse(text: string, status: number): Response {
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
    status,
  });
}

function extensionOf(pathname: string): string {
  const lastSlash = pathname.lastIndexOf("/");
  const lastDot = pathname.lastIndexOf(".");
  return lastDot > lastSlash ? pathname.slice(lastDot).toLowerCase() : "";
}
