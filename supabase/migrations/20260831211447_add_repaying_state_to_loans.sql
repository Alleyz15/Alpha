-- Repayment is verify-and-record, not broadcast (7.4).
--
-- We do not hold the borrower's key and deliberately do not want to: BR-18 says
-- never commit or log a private key, and the surest way to honour that is not to
-- have a second one. A borrower who signs their own repayment is also a more
-- honest demonstration than a lender who signs it for them.
--
-- So the flow is: record what is owed, the operator sends it, we verify the
-- transaction on chain and only then mark the loan repaid.
--
-- WHY THE EXPECTED AMOUNT IS STORED RATHER THAN RECOMPUTED. What is owed grows
-- with the term. If the figure were derived again at verification time it would
-- differ from the figure the operator was told to send, and the check would
-- reject a correct payment - or, worse, accept a short one. The amount is fixed
-- when the repayment is requested and the transaction is checked against that.
--
-- 'repaying' is the trace BR-14 exists to leave: a repayment was requested and
-- its outcome is not yet known. A row stuck there means look at the chain, not
-- that the money vanished.

alter table public.loans
  drop constraint if exists loans_status_valid;

alter table public.loans
  add constraint loans_status_valid
  check (status in ('active', 'repaying', 'repaid', 'defaulted'));

alter table public.loans
  add column if not exists repayment_expected numeric
    check (repayment_expected is null or repayment_expected > 0);

alter table public.loans
  add column if not exists repayment_requested_at timestamptz;

comment on column public.loans.repayment_expected is
  'USDC owed, fixed when the repayment was requested. The verifier checks the transaction against this, never against a freshly derived figure.';
