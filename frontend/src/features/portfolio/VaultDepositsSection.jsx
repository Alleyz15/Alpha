import { useMemo } from 'react';
import AssetLogo from '../../components/AssetLogo.jsx';
import AssetPicker from '../../components/AssetPicker.jsx';
import { ExternalIcon } from '../../components/Icons.jsx';
import { Alert, AsyncState, Button, Card, FormField, StatusBadge } from '../../components/ui/index.js';
import { formatUsdc } from '../../utils/usdc.js';
import { buildVaultRows, formatDate, formatParticipationPct } from './vaultDepositsViewModel.js';
import useVaultDeposits from './useVaultDeposits.js';

/**
 * The two transactions behind one deposit.
 *
 * Buying the position and collecting the deposit are separate events, so they
 * are separate links, named for which one they are. A url is null until that
 * event has happened - an active deposit has been bought and not collected -
 * and a link to a transaction that does not exist would claim it did.
 */
function VaultOnChain({ depositUrl, maturityUrl }) {
  if (!depositUrl && !maturityUrl) return <span aria-hidden="true">—</span>;

  return (
    <div className="lending-onchain-links">
      {depositUrl && (
        <a
          className="vault-onchain-link"
          href={depositUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View the deposit transaction on BaseScan"
        >
          Deposited <ExternalIcon size={13} />
        </a>
      )}
      {maturityUrl && (
        <a
          className="vault-onchain-link"
          href={maturityUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View the transaction that returned this deposit on BaseScan"
        >
          Collected <ExternalIcon size={13} />
        </a>
      )}
    </div>
  );
}

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
          <AssetPicker
            value={vault.assetInput}
            onChange={vault.setAsset}
            disabled={!vault.isEditable}
          />
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
          {/*
            The two claims, kept apart. Principal protection is a guarantee;
            the upside is not, and a screen that implied both would look like
            it had failed on the ordinary day - the 3 Sep deposit returned in
            full with no rise to share, which is the promise working.

            The second line exists because "27.85%" is read as a return unless
            something says otherwise. It is a share of the RISE: on a 4% move
            it is about 1.08% of the deposit, not 27.85%.
          */}
          <p className="vault-deposits-note">
            <strong>Your deposit comes back in full, whatever the market does.</strong>{' '}
            You hold USDC the whole time — never the asset itself, and never its
            downside.
          </p>
          <p className="vault-deposits-note">
            If the asset ends above the threshold shown, you also receive that
            share <strong>of the rise</strong> — not of your deposit. A flat or
            falling market simply returns what you put in.
          </p>
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
                <th>Tracks</th>
                <th>Principal</th>
                <th>Returned</th>
                <th>Upside share</th>
                <th>Status</th>
                <th>Maturity</th>
                <th>On chain</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.vaultId}>
                  <td>
                    {/*
                      "Ethereum / ETH" is exactly how the protection table
                      names a holding, and that sameness says the two are the
                      same kind of thing. They are not: this is a USDC deposit
                      that watches ETH, and the depositor never holds ETH or
                      carries its downside. The second line says so, for the
                      reader who scans the table without reading the note above
                      it.
                    */}
                    <div className="portfolio-coin-cell">
                      <AssetLogo symbol={row.symbol} name={row.name} size="small" />
                      <span><strong>{row.name}</strong><small>reference only</small></span>
                    </div>
                  </td>
                  <td className="numeric">{row.principalLabel}</td>
                  {/*
                    Beside the principal on purpose: "3.00 in, 3.00 back" is a
                    line anyone can check, and it is the guarantee actually
                    happening rather than a sentence claiming it will.
                  */}
                  <td className="numeric">{row.returnedLabel}</td>
                  <td>{row.upsideLabel}</td>
                  <td><StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge></td>
                  <td>{row.maturityLabel}</td>
                  <td><VaultOnChain depositUrl={row.depositUrl} maturityUrl={row.maturityUrl} /></td>
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
