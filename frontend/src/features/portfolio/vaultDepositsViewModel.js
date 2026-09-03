import { getAssetIdentity } from '../../components/AssetLogo.jsx';
import { formatUsdc } from '../../utils/usdc.js';
import { formatDate } from './portfolioViewModel.js';

export { formatDate };

const pct = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const VAULT_STATUS = {
  pending: { tone: 'warning', label: 'Pending' },
  active: { tone: 'success', label: 'Active' },
  maturing: { tone: 'warning', label: 'Maturing' },
  matured: { tone: 'primary', label: 'Matured' },
  superseded: { tone: 'neutral', label: 'Superseded' },
  failed: { tone: 'danger', label: 'Failed' },
};

export function formatParticipationPct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${pct.format(Number(value))}%`;
}

/**
 * Join vault rows (from GET /api/vault, which never resolves `call`) with the
 * user's positions (from GET /api/positions) to find each vault's asset.
 * vault.positionId === position.positionId is the same id on both sides.
 */
export function buildVaultRows(vaults = [], positions = []) {
  const positionsById = new Map(positions.map((position) => [position.positionId, position]));

  return vaults.map((vault) => {
    const position = vault.positionId ? positionsById.get(vault.positionId) : null;
    const identity = getAssetIdentity(position?.asset);
    const status = VAULT_STATUS[vault.status] ?? { tone: 'neutral', label: vault.status ?? 'Unknown' };

    return {
      vaultId: vault.vaultId,
      symbol: identity.symbol,
      name: identity.name,
      principalLabel: formatUsdc(vault.principalUsdc) ?? '—',
      participationLabel: formatParticipationPct(vault.participationPct),
      statusTone: status.tone,
      statusLabel: status.label,
      maturityLabel: formatDate(vault.maturity),
    };
  });
}
