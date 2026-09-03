// HTTP server (IMPLEMENT.md 5.1, 5.2).
//
// node:http rather than a framework. Four routes does not justify a dependency,
// and the fewer moving parts between here and demo day the better.

import { createServer } from 'node:http';
import { toErrorResponse, ApiError } from './errors.js';
import { startSweeping, stopSweeping } from './quoteStore.js';
import {
  getDemoContext, postQuote, postPurchase, getPositions, getLoanStress, getMarketContext,
  getAssetsOverview, getAssetCandles, getAssetOrderBook,
  getPositionDetail, getPortfolio,
} from './routes.js';
import {
  getLoans, getLoanDetail, postRepaymentRequest, postRepay, getLoanOffer, postLoan,
} from './loanRoutes.js';
import {
  getVaults, getVaultDetail, getMaturityPreflight, postMature,
  postVaultDeposit, getDepositPreflight,
} from './vaultRoutes.js';

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
  { method: 'GET', path: '/api/market-context', handler: () => getMarketContext() },
  { method: 'GET', path: '/api/portfolio', handler: () => getPortfolio() },
  { method: 'GET', path: '/api/loans', handler: () => getLoans() },
  // Literals ABOVE the /api/loans/:loanId pattern.
  {
    method: 'GET',
    path: '/api/loans/offer',
    handler: (_body, { query }) => getLoanOffer(query.get('positionId')),
  },
  {
    method: 'POST',
    path: '/api/loans',
    // Held rather than 202: eight local and RPC checks, then a one-block
    // transfer. Nothing here scans the chain the way the maturity check does.
    handler: (body) => postLoan(body),
  },
  { method: 'GET', path: '/api/vault', handler: () => getVaults() },
  // Literals, ABOVE the /api/vault/:vaultId pattern. 'deposit' is not a uuid so
  // the pattern could not capture it, but keeping the ordering habit means the
  // next literal added is safe without anyone having to check.
  {
    method: 'GET',
    path: '/api/vault/deposit-preflight',
    handler: (_body, { query }) => getDepositPreflight(query.get('asset'), query.get('principalUsdc')),
  },
  {
    method: 'POST',
    path: '/api/vault/deposit',
    // Accepted, not done. Buying the call is 9-30 seconds.
    successStatus: 202,
    handler: (body) => postVaultDeposit(body),
  },

  // Coin Detail market data. DISPLAY ONLY - CoinGecko and Binance, read-only,
  // and nothing they return prices a trade. This literal sits ABOVE the
  // /api/assets/:symbol patterns so 'overview' can never be captured as a
  // symbol; add new literals above the patterns for the same reason.
  { method: 'GET', path: '/api/assets/overview', handler: () => getAssetsOverview() },

  // Routes with a path parameter carry a pattern instead of a literal path.
  // Kept as regexes rather than pulling in a router: a dependency to match a
  // handful of them is not a trade worth making days before a freeze.
  {
    pattern: new RegExp('^/api/loans/([0-9a-fA-F-]{36})/repayment-request$'),
    path: '/api/loans/:loanId/repayment-request',
    method: 'POST',
    handler: (_body, { params }) => postRepaymentRequest(params[0]),
  },
  {
    // POST, because it writes: the expected repayment is fixed on the row here.
    pattern: new RegExp('^/api/loans/([0-9a-fA-F-]{36})/repay$'),
    path: '/api/loans/:loanId/repay',
    method: 'POST',
    handler: (body, { params }) => postRepay(params[0], body),
  },
  {
    // The id pattern is anchored with $, so it cannot swallow /repay or
    // /repayment-request whatever the order - unlike the /api/assets literals
    // above, which genuinely depend on being listed first.
    pattern: new RegExp('^/api/loans/([0-9a-fA-F-]{36})$'),
    path: '/api/loans/:loanId',
    method: 'GET',
    handler: (_body, { params }) => getLoanDetail(params[0]),
  },
  {
    pattern: new RegExp('^/api/vault/([0-9a-fA-F-]{36})/maturity-preflight$'),
    path: '/api/vault/:vaultId/maturity-preflight',
    method: 'GET',
    handler: (_body, { params }) => getMaturityPreflight(params[0]),
  },
  {
    pattern: new RegExp('^/api/vault/([0-9a-fA-F-]{36})/mature$'),
    path: '/api/vault/:vaultId/mature',
    method: 'POST',
    // Accepted, not done. The pre-flight alone takes over five minutes.
    successStatus: 202,
    handler: (_body, { params }) => postMature(params[0]),
  },
  {
    pattern: new RegExp('^/api/vault/([0-9a-fA-F-]{36})$'),
    path: '/api/vault/:vaultId',
    method: 'GET',
    handler: (_body, { params }) => getVaultDetail(params[0]),
  },
  {
    method: 'GET',
    pattern: new RegExp('^/api/loans/([0-9a-fA-F-]{36})/stress$'),
    path: '/api/loans/:loanId/stress',
    handler: (_body, { params, query }) => getLoanStress(params[0], query.get('price'), query.get('rule')),
  },
  {
    method: 'GET',
    pattern: new RegExp('^/api/assets/([A-Za-z]{2,10})/candles$'),
    path: '/api/assets/:symbol/candles',
    handler: (_body, { params, query }) => getAssetCandles(params[0], {
      intervalParam: query.get('interval'),
      limitParam: query.get('limit'),
      rangeParam: query.get('range'),
    }),
  },
  {
    method: 'GET',
    pattern: new RegExp('^/api/assets/([A-Za-z]{2,10})/order-book$'),
    path: '/api/assets/:symbol/order-book',
    handler: (_body, { params }) => getAssetOrderBook(params[0]),
  },
  {
    method: 'GET',
    pattern: new RegExp('^/api/positions/([0-9a-fA-F-]{36})$'),
    path: '/api/positions/:positionId',
    handler: (_body, { params }) => getPositionDetail(params[0]),
  },
];

/**
 * Match a request against the table, returning the route and its captures.
 *
 * ---------------------------------------------------------------------------
 * THE METHOD IS PART OF THE MATCH, NOT A CHECK APPLIED AFTERWARDS.
 * ---------------------------------------------------------------------------
 *
 * This used to return the first route whose PATH matched and then report
 * whether the method happened to agree. That was fine while every path had one
 * method, and broke the moment /api/loans gained a POST beside its GET: the GET
 * entry matched first, the method did not agree, and a valid POST got 405.
 *
 * So it looks for a path AND method match first, and only falls back to a
 * path-only match to distinguish 405 from 404. Those two answers are different
 * and both are worth keeping.
 */
function matchRoute(method, pathname) {
  const candidates = [];

  for (const r of routes) {
    if (r.pattern) {
      const m = pathname.match(r.pattern);
      if (m) candidates.push({ route: r, params: m.slice(1) });
    } else if (r.path === pathname) {
      candidates.push({ route: r, params: [] });
    }
  }

  if (candidates.length === 0) return null;

  const exact = candidates.find((c) => c.route.method === method);
  if (exact) return { ...exact, methodOk: true };

  // The path exists but not for this method: 405, not 404.
  return { ...candidates[0], methodOk: false };
}

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

  const matched = matchRoute(req.method, url.pathname);

  if (!matched || !matched.methodOk) {
    sendJson(res, matched ? 405 : 404, {
      error: {
        code: 'INVALID_REQUEST',
        message: matched
          ? `${req.method} is not supported on ${url.pathname}.`
          : `Unknown endpoint ${url.pathname}.`,
      },
    });
    return;
  }

  const route = matched.route;

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : null;
    // successStatus lets an endpoint say ACCEPTED rather than OK. Work that
    // takes minutes returns 202 and is polled; 200 would tell the interface the
    // thing was done, which is the one thing it must not believe.
    sendJson(res, route.successStatus ?? 200, await route.handler(body, {
      params: matched.params,
      query: url.searchParams,
    }));
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
