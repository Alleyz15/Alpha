// HTTP server (IMPLEMENT.md 5.1, 5.2).
//
// node:http rather than a framework. Four routes does not justify a dependency,
// and the fewer moving parts between here and demo day the better.

import { createServer } from 'node:http';
import { toErrorResponse, ApiError } from './errors.js';
import { startSweeping, stopSweeping } from './quoteStore.js';
import { getDemoContext, postQuote, postPurchase, getPositions } from './routes.js';

// 5.2: the Vite dev server, named explicitly. A wildcard would let any page on
// the machine call this API, and the demo runs on a laptop that is also
// browsing the web.
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

// Requests are tiny - an asset, an amount, two ids. Anything larger is a
// mistake or an attempt to exhaust memory.
const MAX_BODY_BYTES = 16 * 1024;

function applyCors(res, origin) {
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new ApiError('INVALID_REQUEST', 'Request body is too large.');
    }
    chunks.push(chunk);
  }

  if (bytes === 0) return null;

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError('INVALID_REQUEST', 'Request body is not valid JSON.');
  }
}

const routes = [
  { method: 'GET', path: '/api/demo-context', handler: () => getDemoContext() },
  { method: 'POST', path: '/api/quote', handler: (body) => postQuote(body) },
  { method: 'POST', path: '/api/purchase', handler: (body) => postPurchase(body) },
  { method: 'GET', path: '/api/positions', handler: () => getPositions() },
];

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  applyCors(res, req.headers.origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Unauthenticated liveness check, so `npm run api` can be confirmed without
  // touching the database or the order book.
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  const route = routes.find((r) => r.path === url.pathname && r.method === req.method);

  if (!route) {
    const known = routes.some((r) => r.path === url.pathname);
    sendJson(res, known ? 405 : 404, {
      error: {
        code: 'INVALID_REQUEST',
        message: known
          ? `${req.method} is not supported on ${url.pathname}.`
          : `Unknown endpoint ${url.pathname}.`,
      },
    });
    return;
  }

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : null;
    sendJson(res, 200, await route.handler(body));
  } catch (error) {
    const { status, body } = toErrorResponse(error);

    // Log the real error server-side; the client gets the envelope. A failure
    // nobody can see is a failure nobody can fix.
    if (status >= 500) {
      console.error(`[api] ${req.method} ${url.pathname} ->`, error);
    } else {
      console.warn(`[api] ${req.method} ${url.pathname} -> ${status} ${body.error.code}`);
    }

    sendJson(res, status, body);
  }
}

/**
 * Start the API.
 * @param {number} [port]
 * @returns {Promise<import('node:http').Server>}
 */
export function startApi(port = Number(process.env.PORT ?? 3000)) {
  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error('[api] unhandled', error);
      if (!res.headersSent) sendJson(res, 500, toErrorResponse(error).body);
    });
  });

  startSweeping();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      console.log(`API listening on http://localhost:${server.address().port}`);
      console.log(`CORS origin: ${ALLOWED_ORIGIN}`);
      resolve(server);
    });
  });
}

export async function stopApi(server) {
  stopSweeping();
  await new Promise((resolve) => server.close(resolve));
}
