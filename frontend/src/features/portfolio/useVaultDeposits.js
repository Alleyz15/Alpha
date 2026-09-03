import { useCallback, useEffect, useReducer, useRef } from 'react';
import { getApiErrorCode } from '../../api/client.js';

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 60_000;

const EDITABLE_PHASES = new Set(['open', 'preview-ready', 'preview-no-calls', 'preview-error']);

function initState(positions) {
  return {
    listState: 'loading',
    listError: null,
    vaults: [],
    positions: positions ?? [],

    phase: 'closed',
    assetInput: 'ETH',
    principalInput: '',
    preview: null,
    previewErrorAsset: null,
    submitError: null,

    trackedVaultId: null,
    preSubmitVaultIds: null,
    pollStartedAt: null,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'list-loading':
      return { ...state, listState: 'loading', listError: null };
    case 'list-loaded':
      return { ...state, listState: 'ready', vaults: action.vaults };
    case 'list-error':
      return { ...state, listState: 'error', listError: action.error };

    case 'open-form':
      return {
        ...state,
        phase: 'open',
        assetInput: 'ETH',
        principalInput: '',
        preview: null,
        previewErrorAsset: null,
        submitError: null,
      };
    case 'cancel-form':
      return { ...state, phase: 'closed', preview: null, previewErrorAsset: null, submitError: null };

    // Editing either field after a preview invalidates it - a stale preview
    // for different inputs would be a wrong number shown as a real one.
    case 'set-asset':
      return {
        ...state,
        assetInput: action.value,
        preview: null,
        previewErrorAsset: null,
        phase: EDITABLE_PHASES.has(state.phase) ? 'open' : state.phase,
      };
    case 'set-principal':
      return {
        ...state,
        principalInput: action.value,
        preview: null,
        previewErrorAsset: null,
        phase: EDITABLE_PHASES.has(state.phase) ? 'open' : state.phase,
      };

    case 'preview-start':
      return { ...state, phase: 'previewing', previewErrorAsset: null };
    case 'preview-success':
      return { ...state, phase: 'preview-ready', preview: action.data };
    case 'preview-no-calls':
      return { ...state, phase: 'preview-no-calls', previewErrorAsset: action.asset };
    case 'preview-error':
      return { ...state, phase: 'preview-error' };

    case 'submit-start':
      return { ...state, phase: 'submitting', submitError: null };
    case 'submit-accepted':
      return {
        ...state,
        phase: 'polling',
        preSubmitVaultIds: action.preSubmitVaultIds,
        trackedVaultId: null,
        pollStartedAt: action.startedAt,
      };
    case 'submit-error':
      return { ...state, phase: 'preview-ready', submitError: action.message };

    case 'poll-progress':
      return {
        ...state,
        vaults: action.vaults,
        positions: action.positions,
        trackedVaultId: action.trackedVaultId ?? state.trackedVaultId,
      };
    case 'poll-resolved':
      return { ...state, phase: 'closed', trackedVaultId: null, preSubmitVaultIds: null, pollStartedAt: null };
    case 'poll-timeout':
      return { ...state, phase: 'poll-timeout', trackedVaultId: null, preSubmitVaultIds: null, pollStartedAt: null };

    default:
      return state;
  }
}

/**
 * Owns the Vault Deposits section: the list (joined with positions for their
 * asset - see vaultDepositsViewModel.js) and the inline deposit form's state
 * machine, from the initial inputs through preview, submission, and the
 * post-submit poll of GET /api/vault.
 */
export default function useVaultDeposits(apiClient, positions) {
  const [state, dispatch] = useReducer(reducer, positions, initState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const mounted = useRef(true);

  const loadVaults = useCallback(async () => {
    dispatch({ type: 'list-loading' });
    try {
      const payload = await apiClient.getVaults();
      if (mounted.current) dispatch({ type: 'list-loaded', vaults: payload.vaults ?? [] });
    } catch (error) {
      if (mounted.current) dispatch({ type: 'list-error', error });
    }
  }, [apiClient]);

  useEffect(() => {
    mounted.current = true;
    loadVaults();
    return () => { mounted.current = false; };
  }, [loadVaults]);

  // Polling only runs while a just-submitted deposit is in flight - there is
  // no ambient polling of the list at rest.
  useEffect(() => {
    if (state.phase !== 'polling') return undefined;

    const tick = async () => {
      const current = stateRef.current;
      const elapsed = Date.now() - (current.pollStartedAt ?? Date.now());
      if (elapsed >= POLL_TIMEOUT_MS) {
        if (mounted.current) dispatch({ type: 'poll-timeout' });
        return;
      }

      try {
        const [vaultsPayload, positionsPayload] = await Promise.all([
          apiClient.getVaults(),
          apiClient.getPositions(),
        ]);
        if (!mounted.current) return;

        const vaults = vaultsPayload.vaults ?? [];
        const positionsList = positionsPayload.positions ?? [];
        const latest = stateRef.current;

        let trackedVaultId = latest.trackedVaultId;
        if (!trackedVaultId) {
          const found = vaults.find((v) => !latest.preSubmitVaultIds?.has(v.vaultId));
          trackedVaultId = found ? found.vaultId : null;
        }

        dispatch({ type: 'poll-progress', vaults, positions: positionsList, trackedVaultId });

        const trackedVault = trackedVaultId ? vaults.find((v) => v.vaultId === trackedVaultId) : null;
        if (trackedVault && trackedVault.status !== 'pending') {
          dispatch({ type: 'poll-resolved' });
        }
      } catch {
        // A failed tick is not fatal - retried next tick. If the backend
        // never recovers, the elapsed check above still times it out.
      }
    };

    tick();
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => { window.clearInterval(timer); };
  }, [state.phase === 'polling', apiClient]);

  const openForm = useCallback(() => dispatch({ type: 'open-form' }), []);
  const cancelForm = useCallback(() => dispatch({ type: 'cancel-form' }), []);
  const setAsset = useCallback((value) => dispatch({ type: 'set-asset', value }), []);
  const setPrincipal = useCallback((value) => dispatch({ type: 'set-principal', value }), []);

  const runPreview = useCallback(async () => {
    const asset = state.assetInput;
    const principalUsdc = Number(state.principalInput);
    dispatch({ type: 'preview-start' });
    try {
      const data = await apiClient.getDepositPreflight(asset, principalUsdc);
      if (!mounted.current) return;
      if (data.pass) {
        dispatch({ type: 'preview-success', data });
      } else {
        dispatch({ type: 'preview-error' });
      }
    } catch (error) {
      if (!mounted.current) return;
      if (getApiErrorCode(error) === 'NO_BUYABLE_CALLS') {
        dispatch({ type: 'preview-no-calls', asset });
      } else {
        dispatch({ type: 'preview-error' });
      }
    }
  }, [apiClient, state.assetInput, state.principalInput]);

  const confirmDeposit = useCallback(async () => {
    const preSubmitVaultIds = new Set(state.vaults.map((v) => v.vaultId));
    const asset = state.assetInput;
    const principalUsdc = Number(state.principalInput);
    dispatch({ type: 'submit-start' });
    try {
      await apiClient.postVaultDeposit(asset, principalUsdc);
      if (mounted.current) dispatch({ type: 'submit-accepted', preSubmitVaultIds, startedAt: Date.now() });
    } catch (error) {
      if (mounted.current) dispatch({ type: 'submit-error', message: error?.message ?? 'The deposit could not be started.' });
    }
  }, [apiClient, state.assetInput, state.principalInput, state.vaults]);

  return {
    ...state,
    isEditable: EDITABLE_PHASES.has(state.phase),
    retryList: loadVaults,
    openForm,
    cancelForm,
    setAsset,
    setPrincipal,
    runPreview,
    confirmDeposit,
  };
}
