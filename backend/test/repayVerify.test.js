// Reading a repayment out of a transaction receipt.
//
// ===========================================================================
// THIS IS THE CHECK THAT DECIDES WHETHER A LOAN IS CLOSED FOR FREE.
// ===========================================================================
//
// The borrower signs the repayment from their own wallet and hands us a hash.
// Everything we know about whether they actually paid comes from decoding that
// receipt, so a decoder that is too permissive marks a loan repaid against a
// transaction that moved nothing.
//
// The tempting wrong implementation is to check the transaction's `to` and
// `value`. Both are meaningless for ERC-20:
//
//   value  is the ETH sent - zero for a token transfer
//   to     is the TOKEN CONTRACT, not the recipient
//
// So a `to === USDC && value >= owed` check passes on any transaction sent to
// USDC and fails on every real repayment. usdcTransfersIn takes LOGS and has no
// way to be passed those two fields at all, which is the point.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { usdcTransfersIn } from '../src/lending/repay.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OTHER_TOKEN = '0x4200000000000000000000000000000000000006';   // WETH on Base
const BORROWER = '0xc169c7c000cAA28807Ab2585D707C7A6457d718E';
const LENDER = '0x4fB77837bf2A0B86D167627Ded2E894f92F15127';
const STRANGER = '0x1bDff855d6811728acaDC00989e79143a2bdfDed';

const TRANSFER = ethers.id('Transfer(address,address,uint256)');
const pad = (addr) => '0x' + '0'.repeat(24) + addr.slice(2).toLowerCase();

/** A Transfer log as an RPC returns one. */
const transferLog = ({ token = USDC, from = BORROWER, to = LENDER, value = 4599411n } = {}) => ({
  address: token,
  topics: [TRANSFER, pad(from), pad(to)],
  data: '0x' + value.toString(16).padStart(64, '0'),
});

// --- decoding --------------------------------------------------------------

test('a real repayment decodes to from, to and value', () => {
  const [t] = usdcTransfersIn([transferLog()], USDC);

  assert.equal(t.from, BORROWER.toLowerCase());
  assert.equal(t.to, LENDER.toLowerCase());
  assert.equal(t.value, 4599411n);
});

test('addresses come back lowercased, so comparison never depends on checksum case', () => {
  // Ethereum addresses are case-insensitive and mixed case has broken equality
  // checks in this project before - the positions table has a CHECK constraint
  // forcing lowercase for exactly this reason.
  const [t] = usdcTransfersIn([transferLog()], USDC);
  assert.equal(t.from, t.from.toLowerCase());
  assert.equal(t.to, t.to.toLowerCase());
});

test('the token is matched case-insensitively', () => {
  assert.equal(usdcTransfersIn([transferLog()], USDC.toLowerCase()).length, 1);
  assert.equal(usdcTransfersIn([transferLog()], USDC.toUpperCase()).length, 1);
});

// --- what it must refuse ---------------------------------------------------

test('a transfer of a DIFFERENT token is not a USDC repayment', () => {
  // Someone could repay in WETH, or a transaction could touch several tokens.
  // Only the one we lent counts.
  const logs = [transferLog({ token: OTHER_TOKEN })];
  assert.deepEqual(usdcTransfersIn(logs, USDC), []);
});

test('a non-Transfer event on the token contract is ignored', () => {
  // Approval has the same shape - contract address, three topics, a data word.
  // Matching on the topic rather than the shape is what separates them.
  const approval = {
    address: USDC,
    topics: [ethers.id('Approval(address,address,uint256)'), pad(BORROWER), pad(LENDER)],
    data: '0x' + (9_000_000n).toString(16).padStart(64, '0'),
  };
  assert.deepEqual(usdcTransfersIn([approval], USDC), []);
});

test('a transfer to a STRANGER is decoded, not silently accepted', () => {
  // The decoder reports what happened; confirmRepayment decides whether it is
  // the right transfer. Keeping those separate means a wrong recipient shows up
  // as a failed named check rather than as an empty list that reads like
  // "no transfer found".
  const [t] = usdcTransfersIn([transferLog({ to: STRANGER })], USDC);
  assert.equal(t.to, STRANGER.toLowerCase());
  assert.notEqual(t.to, LENDER.toLowerCase());
});

test('a zero-value transfer decodes as zero, not as absent', () => {
  // A transaction that transferred nothing is a real event with a real amount.
  // Dropping it would make "sent 0" indistinguishable from "sent nothing at
  // all", and the amount check is what should refuse it.
  const [t] = usdcTransfersIn([transferLog({ value: 0n })], USDC);
  assert.equal(t.value, 0n);
});

test('an empty or missing log list is empty, not a crash', () => {
  assert.deepEqual(usdcTransfersIn([], USDC), []);
  assert.deepEqual(usdcTransfersIn(undefined, USDC), []);
  assert.deepEqual(usdcTransfersIn(null, USDC), []);
});

// --- several transfers in one transaction ----------------------------------

test('every USDC transfer in the receipt is returned, not just the first', () => {
  // A router or batch can move USDC several times in one transaction. Taking
  // only the first would let a repayment hide behind an unrelated leg.
  const logs = [
    transferLog({ to: STRANGER, value: 1n }),
    transferLog({ value: 4599411n }),
  ];
  const found = usdcTransfersIn(logs, USDC);

  assert.equal(found.length, 2);
  assert.ok(found.some((t) => t.to === LENDER.toLowerCase() && t.value === 4599411n),
    'the real repayment must survive being second in the list');
});

test('USDC transfers are picked out of a receipt full of other events', () => {
  const logs = [
    { address: OTHER_TOKEN, topics: [TRANSFER, pad(BORROWER), pad(LENDER)], data: '0x' + (1n).toString(16).padStart(64, '0') },
    { address: USDC, topics: [ethers.id('Approval(address,address,uint256)'), pad(BORROWER), pad(LENDER)], data: '0x00' },
    transferLog(),
  ];
  const found = usdcTransfersIn(logs, USDC);

  assert.equal(found.length, 1);
  assert.equal(found[0].value, 4599411n);
});

// --- the shape of the interface itself -------------------------------------

test('there is no way to pass a transaction to or value', () => {
  // The signature takes logs and a token. A caller cannot accidentally reach
  // for receipt.to or receipt.value, because the function never sees a receipt.
  assert.equal(usdcTransfersIn.length, 2, 'logs and token, nothing else');
});
