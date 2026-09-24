// Local development server — zero dependencies, no Vercel account required.
//
//   node dev-server.js          (or: npm start)
//
// Serves the static site AND runs the handlers in api/ exactly the way Vercel
// does in production, so a page that works here works when deployed.
//
//   static file        /cart.html            -> ./cart.html
//   static dir index   /                     -> ./index.html
//   api route          /api/create-checkout-session -> ./api/create-checkout-session.js

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

// ---------------------------------------------------------------- env loading
// Minimal .env loader so we do not need the `dotenv` package. Values keep
// everything after the first "=" and are trimmed, so the common mistake of
// writing `STRIPE_SECRET_KEY= sk_test_...` (leading space) cannot corrupt a key.
async function loadEnv() {
  let raw;
  try {
    raw = await readFile(join(ROOT, ".env"), "utf8");
  } catch (error) {
    console.warn("No .env file found — API routes will report missing keys.");
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip matching surrounding quotes, if any.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }

  const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].filter((key) => !process.env[key]);
  if (missing.length) console.warn(`Warning: empty in .env -> ${missing.join(", ")}`);
}

// ------------------------------------------------------------- handler loading
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

// Re-imported on every request in dev so edits to api/*.js take effect without
// restarting the server. The cache-busting query is what forces a fresh module.
async function loadHandler(filePath) {
  const url = pathToFileURL(filePath).href + `?t=${Date.now()}`;
  const module = await import(url);
  return module.default;
}

function createRes(nodeRes) {
  let statusCode = 200;
  const headers = {};

  const res = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(payload) {
      const body = JSON.stringify(payload);
      nodeRes.writeHead(statusCode, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        ...headers
      });
      nodeRes.end(body);
      return res;
    },
    send(payload) {
      const body = typeof payload === "string" ? payload : JSON.stringify(payload);
      nodeRes.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8", ...headers });
      nodeRes.end(body);
      return res;
    },
    end() {
      nodeRes.writeHead(statusCode, headers);
      nodeRes.end();
      return res;
    }
  };

  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ------------------------------------------------------------------ static
function resolveStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const target = join(ROOT, safe);
  // Refuse anything that escapes the project root.
  if (!target.startsWith(ROOT + sep) && target !== ROOT) return null;
  return target;
}

async function serveStatic(req, res, pathname) {
  let filePath = resolveStaticPath(pathname);
  if (!filePath) {
    res.writeHead(403).end("Forbidden");
    return true;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch (error) {
    if (extname(pathname)) return false; // /missing.js -> real 404
    filePath = join(ROOT, "index.html"); // extensionless -> try index
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
      "content-length": body.length
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return true;
  } catch (error) {
    return false;
  }
}

// -------------------------------------------------------------------- server
const server = createServer(async (nodeReq, nodeRes) => {
  const started = Date.now();
  const url = new URL(nodeReq.url, `http://${nodeReq.headers.host}`);
  const { pathname, searchParams } = url;

  // CORS preflight, handy if you ever load the site from a different origin.
  if (nodeReq.method === "OPTIONS" && pathname.startsWith("/api/")) {
    nodeRes.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, stripe-signature",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    });
    nodeRes.end();
    return;
  }

  if (pathname.startsWith("/api/")) {
    const handlerPath = join(ROOT, "api", `${pathname.slice("/api/".length)}.js`);
    let handler;

    try {
      handler = await loadHandler(handlerPath);
    } catch (error) {
      console.error(`  API load failed: ${pathname} -> ${error.message}`);
      nodeRes.writeHead(404, { "content-type": "application/json" });
      nodeRes.end(JSON.stringify({ error: "Not found", detail: error.message }));
      return;
    }

    if (typeof handler !== "function") {
      nodeRes.writeHead(500, { "content-type": "application/json" });
      nodeRes.end(JSON.stringify({ error: "Handler has no default export" }));
      return;
    }

    // Shape the request the way Vercel does.
    const raw = await readBody(nodeReq);
    const req = nodeReq;
    req.query = Object.fromEntries(searchParams);
    req.cookies = {};
    req.body = raw.length ? parseBody(raw, nodeReq.headers["content-type"] || "") : undefined;

    try {
      await handler(req, createRes(nodeRes));
      console.log(`  ${nodeReq.method} ${pathname} -> ${Date.now() - started}ms`);
    } catch (error) {
      console.error(`  ${nodeReq.method} ${pathname} -> 500`, error);
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(500, { "content-type": "application/json" });
        nodeRes.end(JSON.stringify({ error: "Internal server error", detail: error.message }));
      }
    }
    return;
  }

  const served = await serveStatic(nodeReq, nodeRes, pathname);
  if (served) {
    console.log(`  ${nodeReq.method} ${pathname} -> 200`);
    return;
  }

  nodeRes.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  nodeRes.end("404 Not Found");
  console.log(`  ${nodeReq.method} ${pathname} -> 404`);
});

function parseBody(raw, contentType) {
  const text = raw.toString("utf8");
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return {};
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  return text;
}

await loadEnv();

server.listen(PORT, () => {
  console.log(`\n  Elite Padel dev server`);
  console.log(`  http://localhost:${PORT}/cart.html\n`);
  console.log(`  Static:  ${ROOT}`);
  console.log(`  API:     ${join(ROOT, "api")}`);
  console.log(`  Stripe:  ${process.env.STRIPE_SECRET_KEY ? "key loaded" : "NO KEY — set STRIPE_SECRET_KEY in .env"}`);
  console.log(`  Webhook: stripe listen --forward-to localhost:${PORT}/api/webhook\n`);
});
