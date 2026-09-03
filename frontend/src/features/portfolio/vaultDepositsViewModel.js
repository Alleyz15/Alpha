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
 * The upside share, said so it cannot be read as a yield.
 *
 * ---------------------------------------------------------------------------
 * A BARE PERCENTAGE IS THE WRONG NUMBER TO SHOW ON ITS OWN.
 * ---------------------------------------------------------------------------
 *
 * "27.85%" next to a deposit reads as a return. It is not: it is the share of
 * the RISE, and only of the rise above a threshold. On a 4% move the depositor
 * receives 4% x 27.85%, about 1.08% - two orders of thought away from what the
 * bare figure suggests.
 *
 * The threshold comes from the backing position. GET /api/vault leaves `call`
 * null (it calls vaultView without a position, to avoid one query per row), so
 * it is joined here from the positions the section already holds.
 *
 * When the threshold cannot be joined the sentence stops early rather than
 * printing "above $—". Half a sentence with a placeholder price in it is worse
 * than a shorter true one.
 */
function upsideShareLabel(vault, position) {
  const share = formatParticipationPct(vault.participationPct);
  if (share === '—') return '—';

  const threshold = formatUsdc(position?.upsideThresholdUsdc);
  return threshold ? `${share} of gains above ${threshold}` : `${share} of gains`;
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
      upsideLabel: upsideShareLabel(vault, position),
      statusTone: status.tone,
      statusLabel: status.label,
      maturityLabel: formatDate(vault.maturity),
    };
  });
}
