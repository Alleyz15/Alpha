import * as mockApi from './mockApi.js';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? 'Request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export const liveApi = {
  getDemoContext: () => request('/api/demo-context'),
  getMarketContext: () => request('/api/market-context'),
  createQuote: (body) => request('/api/quote', { method: 'POST', body: JSON.stringify(body) }),
  purchaseQuote: (body) => request('/api/purchase', { method: 'POST', body: JSON.stringify(body) }),
  getPositions: () => request('/api/positions'),
};

export const api = useMockApi ? mockApi : liveApi;

export function getApiErrorCode(error) {
  return error?.payload?.error?.code ?? 'UPSTREAM_ERROR';
}

export { useMockApi };
