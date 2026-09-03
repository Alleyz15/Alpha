import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Owns the Lending page's data: the collateral list (confirmed protection
 * positions), the offer for whichever one is selected, the borrow form, the
 * loans list, and a per-loan repayment flow keyed by loanId (each loan repays
 * independently of the others).
 */
export default function useLendingData(apiClient) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const [positionsState, setPositionsState] = useState('loading');
  const [positions, setPositions] = useState([]);
  const [positionsError, setPositionsError] = useState(null);

  const [loansState, setLoansState] = useState('loading');
  const [loans, setLoans] = useState([]);
  const [loansError, setLoansError] = useState(null);

  const [selectedPositionId, setSelectedPositionId] = useState(null);
  const [offerState, setOfferState] = useState('idle');
  const [offer, setOffer] = useState(null);
  const [offerError, setOfferError] = useState(null);

  const [principalInput, setPrincipalInput] = useState('');
  const [borrowState, setBorrowState] = useState('idle');
  const [borrowResult, setBorrowResult] = useState(null);
  const [borrowError, setBorrowError] = useState(null);

  // { [loanId]: { phase: 'requesting'|'awaiting-tx'|'verifying'|'done'|'failed', transfer, txHashInput, error } }
  const [repayFlows, setRepayFlows] = useState({});

  const loadPositions = useCallback(async () => {
    setPositionsState('loading');
    try {
      const payload = await apiClient.getPositions();
      if (mounted.current) {
        setPositions(payload.positions ?? []);
        setPositionsState('ready');
      }
    } catch (error) {
      if (mounted.current) {
        setPositionsError(error);
        setPositionsState('error');
      }
    }
  }, [apiClient]);

  const loadLoans = useCallback(async () => {
    setLoansState('loading');
    try {
      const payload = await apiClient.getLoans();
      if (mounted.current) {
        setLoans(payload.loans ?? []);
        setLoansState('ready');
      }
    } catch (error) {
      if (mounted.current) {
        setLoansError(error);
        setLoansState('error');
      }
    }
  }, [apiClient]);

  useEffect(() => {
    loadPositions();
    loadLoans();
  }, [loadPositions, loadLoans]);

  const selectCollateral = useCallback(async (positionId) => {
    setSelectedPositionId(positionId);
    setOfferState('loading');
    setOffer(null);
    setOfferError(null);
    setPrincipalInput('');
    setBorrowState('idle');
    setBorrowResult(null);
    setBorrowError(null);
    try {
      const data = await apiClient.getLoanOffer(positionId);
      if (mounted.current) {
        setOffer(data);
        setOfferState('ready');
      }
    } catch (error) {
      if (mounted.current) {
        setOfferError(error);
        setOfferState('error');
      }
    }
  }, [apiClient]);

  const setPrincipal = useCallback((value) => {
    setPrincipalInput(value);
    setBorrowState('idle');
    setBorrowResult(null);
    setBorrowError(null);
  }, []);

  const submitBorrow = useCallback(async () => {
    if (!selectedPositionId) return;
    setBorrowState('submitting');
    setBorrowError(null);
    try {
      const result = await apiClient.postLoan(selectedPositionId, Number(principalInput));
      if (!mounted.current) return;
      setBorrowState('success');
      setBorrowResult(result);
      loadLoans();
    } catch (error) {
      if (mounted.current) {
        setBorrowState('error');
        setBorrowError(error);
      }
    }
  }, [apiClient, selectedPositionId, principalInput, loadLoans]);

  const startRepayment = useCallback(async (loanId) => {
    setRepayFlows((current) => ({ ...current, [loanId]: { phase: 'requesting', txHashInput: '' } }));
    try {
      const data = await apiClient.postRepaymentRequest(loanId);
      if (!mounted.current) return;
      setRepayFlows((current) => ({
        ...current,
        [loanId]: { phase: 'awaiting-tx', transfer: data.transfer, txHashInput: '' },
      }));
      loadLoans();
    } catch (error) {
      if (mounted.current) {
        setRepayFlows((current) => ({ ...current, [loanId]: { phase: 'failed', error, txHashInput: '' } }));
      }
    }
  }, [apiClient, loadLoans]);

  const setRepayTxHash = useCallback((loanId, value) => {
    setRepayFlows((current) => ({
      ...current,
      [loanId]: { ...current[loanId], txHashInput: value, error: null },
    }));
  }, []);

  const confirmRepayment = useCallback(async (loanId) => {
    const txHash = repayFlows[loanId]?.txHashInput ?? '';
    setRepayFlows((current) => ({ ...current, [loanId]: { ...current[loanId], phase: 'verifying', error: null } }));
    try {
      const data = await apiClient.postRepay(loanId, txHash);
      if (!mounted.current) return;
      setRepayFlows((current) => ({ ...current, [loanId]: { ...current[loanId], phase: 'done', loan: data.loan } }));
      loadLoans();
    } catch (error) {
      if (mounted.current) {
        setRepayFlows((current) => ({ ...current, [loanId]: { ...current[loanId], phase: 'awaiting-tx', error } }));
      }
    }
  }, [apiClient, repayFlows, loadLoans]);

  return {
    positionsState, positions, positionsError, retryPositions: loadPositions,
    loansState, loans, loansError, retryLoans: loadLoans,
    selectedPositionId, offerState, offer, offerError, selectCollateral,
    principalInput, setPrincipal, borrowState, borrowResult, borrowError, submitBorrow,
    repayFlows, startRepayment, setRepayTxHash, confirmRepayment,
  };
}
