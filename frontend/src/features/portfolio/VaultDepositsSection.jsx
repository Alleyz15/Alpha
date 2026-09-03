import { useMemo } from 'react';
import AssetLogo, { ASSET_IDENTITIES } from '../../components/AssetLogo.jsx';
import { Alert, AsyncState, Button, Card, FormField, StatusBadge } from '../../components/ui/index.js';
import { formatUsdc } from '../../utils/usdc.js';
import { buildVaultRows, formatDate, formatParticipationPct } from './vaultDepositsViewModel.js';
import useVaultDeposits from './useVaultDeposits.js';

const ASSET_OPTIONS = Object.keys(ASSET_IDENTITIES);

function VaultDepositForm({ vault, usdcAvailable }) {
  const { phase } = vault;
  const previewDisabled = !vault.principalInput || Number(vault.principalInput) <= 0 || phase === 'previewing';

  return (
    <form
      className="vault-deposit-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (phase === 'preview-ready') vault.confirmDeposit();
        else vault.runPreview();
      }}
    >
      <div className="vault-deposit-fields">
        <FormField label="Asset">
          <select
            value={vault.assetInput}
            onChange={(event) => vault.setAsset(event.target.value)}
            disabled={!vault.isEditable}
          >
            {ASSET_OPTIONS.map((symbol) => (
              <option key={symbol} value={symbol}>{ASSET_IDENTITIES[symbol].name} ({symbol})</option>
            ))}
          </select>
        </FormField>

        <FormField label="Principal amount (USDC)" hint={`Available: ${formatUsdc(usdcAvailable) ?? '—'}`}>
          <input
            type="number"
            min="0.000001"
            step="any"
            inputMode="decimal"
            placeholder="0.00"
            value={vault.principalInput}
            onChange={(event) => vault.setPrincipal(event.target.value)}
            disabled={!vault.isEditable}
          />
        </FormField>
      </div>

      {phase === 'preview-no-calls' && (
        <Alert tone="warning" title="No upside options available">
          {vault.previewErrorAsset} has no available upside options right now — try a different asset
        </Alert>
      )}
      {phase === 'preview-error' && (
        <Alert tone="error" title="Preview failed">
          Something went wrong previewing this deposit, please try again
        </Alert>
      )}
      {vault.submitError && (
        <Alert tone="error" title="Deposit could not be started">{vault.submitError}</Alert>
      )}

      {phase === 'preview-ready' && vault.preview && (
        <Card variant="inset" className="vault-preview-card">
          <dl className="vault-preview-list">
            <div><dt>Participation</dt><dd>{formatParticipationPct(vault.preview.participationPct)}</dd></div>
            <div><dt>Upside exposure</dt><dd>{formatUsdc(vault.preview.exposureUsdc) ?? '—'}</dd></div>
            <div><dt>Upside target price</dt><dd>{formatUsdc(vault.preview.upsideThresholdUsdc) ?? '—'}</dd></div>
            <div><dt>Simulated yield portion</dt><dd>{formatUsdc(vault.preview.yieldPortionUsdc) ?? '—'}</dd></div>
            <div><dt>Real option portion</dt><dd>{formatUsdc(vault.preview.optionPortionUsdc) ?? '—'}</dd></div>
            <div><dt>Maturity</dt><dd>{formatDate(vault.preview.maturity)}</dd></div>
          </dl>
        </Card>
      )}

      {phase === 'submitting' && <p className="vault-deposit-status" role="status">Submitting your deposit…</p>}
      {phase === 'polling' && <p className="vault-deposit-status" role="status">Deposit submitted, processing…</p>}
      {phase === 'poll-timeout' && (
        <Alert tone="warning" title="Still processing">This is taking longer than expected, refresh to check status</Alert>
      )}

      <div className="vault-deposit-actions">
        {vault.isEditable && <Button type="button" variant="ghost" onClick={vault.cancelForm}>Cancel</Button>}
        {phase === 'preview-ready' ? (
          <Button type="submit" loading={phase === 'submitting'} loadingLabel="Submitting…">Confirm Deposit</Button>
        ) : (
          <Button type="submit" disabled={previewDisabled || !vault.isEditable} loading={phase === 'previewing'} loadingLabel="Previewing…">
            Preview
          </Button>
        )}
      </div>
    </form>
  );
}

export default function VaultDepositsSection({ apiClient, positions, usdcAvailable }) {
  const vault = useVaultDeposits(apiClient, positions);
  const rows = useMemo(() => buildVaultRows(vault.vaults, vault.positions), [vault.vaults, vault.positions]);
  const formOpen = vault.phase !== 'closed';

  return (
    <Card className="vault-deposits-card" aria-label="Vault deposits">
      <div className="portfolio-section-heading">
        <div>
          <span className="portfolio-eyebrow">Principal-protected</span>
          <h2>Vault Deposits</h2>
        </div>
        {!formOpen && rows.length > 0 && <Button size="small" onClick={vault.openForm}>+ New Deposit</Button>}
      </div>

      {vault.listState === 'loading' && <AsyncState state="loading" loadingLabel="Loading your vault deposits…" />}
      {vault.listState === 'error' && (
        <AsyncState
          state="error"
          errorTitle="Vault deposits could not be loaded"
          errorMessage="Check that the backend is running, then try again."
          onRetry={vault.retryList}
        />
      )}

      {vault.listState === 'ready' && rows.length === 0 && !formOpen && (
        <div className="alpha-async-state alpha-async-state--empty vault-deposits-empty">
          <span className="alpha-async-state__mark" aria-hidden="true">○</span>
          <strong>You haven't made any vault deposits yet</strong>
          <Button onClick={vault.openForm}>+ New Deposit</Button>
        </div>
      )}

      {vault.listState === 'ready' && rows.length > 0 && (
        <div className="portfolio-table-scroll">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Principal</th>
                <th>Participation</th>
                <th>Status</th>
                <th>Maturity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.vaultId}>
                  <td>
                    <div className="portfolio-coin-cell">
                      <AssetLogo symbol={row.symbol} name={row.name} size="small" />
                      <span><strong>{row.name}</strong><small>{row.symbol}</small></span>
                    </div>
                  </td>
                  <td className="numeric">{row.principalLabel}</td>
                  <td className="numeric">{row.participationLabel}</td>
                  <td><StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge></td>
                  <td>{row.maturityLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && <VaultDepositForm vault={vault} usdcAvailable={usdcAvailable} />}
    </Card>
  );
}
