const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsdc(value) {
  if (value == null || value === '') return null;

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;

  return `${currency.format(numericValue)} USDC`;
}

export function getPremiumPresentation(paymentStatus, paidAmount) {
  if (paymentStatus === 'paid') return formatUsdc(paidAmount) ?? '—';
  if (paymentStatus === 'held') return 'Funds held';
  if (paymentStatus === 'refunded') return 'Refunded';
  return '—';
}
