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
  getAssetsOverview: () => request('/api/assets/overview'),
  getAssetCandles: (symbol, { interval = '5m', limit = 200 } = {}) => request(`/api/assets/${encodeURIComponent(symbol)}/candles?interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`),
  getAssetOrderBook: (symbol) => request(`/api/assets/${encodeURIComponent(symbol)}/order-book`),
  createQuote: (body) => request('/api/quote', { method: 'POST', body: JSON.stringify(body) }),
  purchaseQuote: (body) => request('/api/purchase', { method: 'POST', body: JSON.stringify(body) }),
  getPositions: () => request('/api/positions'),
  getPortfolio: () => request('/api/portfolio'),
  getPositionDetail: (positionId) => request(`/api/positions/${encodeURIComponent(positionId)}`),
  getLoans: () => request('/api/loans'),
  getLoanOffer: (positionId) => request(`/api/loans/offer?positionId=${encodeURIComponent(positionId)}`),
  postLoan: (positionId, principalUsdc) => request('/api/loans', { method: 'POST', body: JSON.stringify({ positionId, principalUsdc }) }),
  postRepaymentRequest: (loanId) => request(`/api/loans/${encodeURIComponent(loanId)}/repayment-request`, { method: 'POST' }),
  postRepay: (loanId, txHash) => request(`/api/loans/${encodeURIComponent(loanId)}/repay`, { method: 'POST', body: JSON.stringify({ txHash }) }),
  getVaults: () => request('/api/vault'),
  getDepositPreflight: (asset, principalUsdc) => request(`/api/vault/deposit-preflight?asset=${encodeURIComponent(asset)}&principalUsdc=${encodeURIComponent(principalUsdc)}`),
  postVaultDeposit: (asset, principalUsdc) => request('/api/vault/deposit', { method: 'POST', body: JSON.stringify({ asset, principalUsdc }) }),
};

export const api = useMockApi ? mockApi : liveApi;

export function getApiErrorCode(error) {
  return error?.payload?.error?.code ?? 'UPSTREAM_ERROR';
}

export { useMockApi };
