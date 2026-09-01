// src/marketdata/ must never reach the code that prices a trade.
//
// ===========================================================================
// THIS TEST IS THE RULE. The comments in those files are only a description.
// ===========================================================================
//
// CoinGecko and Binance are display data. No quote, fill, credit limit,
// participation rate or settlement figure may read from them - protection is
// priced on the Thetanuts order book and nowhere else.
//
// A comment saying so would hold until someone in a hurry imported a price from
// the wrong module, and the resulting number would look entirely reasonable: a
// market cap and a strike are both dollars on a screen. So the directory
// enforces it, the same way src/api/ structurally cannot import signer.js.
//
// Two directions, both checked:
//
//   1. nothing in src/marketdata/ imports from the pricing tree
//   2. nothing in the pricing tree imports from src/marketdata/
//
// The second is the one that would actually cause harm. The first stops the
// coupling forming in the easier direction first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Directories whose figures a user trades on. */
const PRICING_TREE = ['src/thetanuts', 'src/lending', 'src/vault', 'src/scheduler'];

const MARKETDATA = 'src/marketdata';

function collect(dir, out = []) {
  const full = path.join(backend, dir);
  if (!existsSync(full)) return out;
  for (const entry of readdirSync(full)) {
    const p = path.join(full, entry);
    if (statSync(p).isDirectory()) collect(path.join(dir, entry), out);
    else if (entry.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Import specifiers in a file, comments stripped. */
function importsOf(file) {
  const code = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  return [...code.matchAll(/(?:import|export)[\s\S]{0,200}?from\s*['"]([^'"]+)['"]/g)]
    .concat([...code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)])
    .map((m) => m[1]);
}

/** Where a relative specifier resolves to, backend-relative. */
function resolveSpec(file, spec) {
  if (!spec.startsWith('.')) return null;
  return path.relative(backend, path.resolve(path.dirname(file), spec)).split(path.sep).join('/');
}

test('src/marketdata exists and is not empty', () => {
  const files = collect(MARKETDATA);
  assert.ok(files.length >= 3, `expected the marketdata modules, found ${files.length}`);
});

test('market data never imports from the code that prices a trade', () => {
  const offences = [];

  for (const file of collect(MARKETDATA)) {
    for (const spec of importsOf(file)) {
      const target = resolveSpec(file, spec);
      if (!target) continue;
      for (const tree of PRICING_TREE) {
        if (target.startsWith(tree)) {
          offences.push(`${path.relative(backend, file)} imports ${target}`);
        }
      }
    }
  }

  assert.deepEqual(offences, [],
    'src/marketdata/ must not reach the pricing tree:\n  ' + offences.join('\n  '));
});

test('nothing that prices a trade imports market data', () => {
  // The direction that would do real harm: a quote, a credit limit or a
  // settlement figure computed from an aggregator's price.
  const offences = [];

  for (const tree of PRICING_TREE) {
    for (const file of collect(tree)) {
      for (const spec of importsOf(file)) {
        const target = resolveSpec(file, spec);
        if (target && target.startsWith(MARKETDATA)) {
          offences.push(`${path.relative(backend, file)} imports ${target}`);
        }
      }
    }
  }

  assert.deepEqual(offences, [],
    'protection pricing must come from Thetanuts alone:\n  ' + offences.join('\n  '));
});

test('market data reaches no third party other than CoinGecko and Binance', () => {
  // A new provider is a decision, not an implementation detail. This fails on
  // one being added quietly.
  const allowed = [
    'https://api.coingecko.com',
    'https://data-api.binance.vision',
  ];

  const found = new Set();
  for (const file of collect(MARKETDATA)) {
    const code = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) found.add(m[0]);
  }

  const unexpected = [...found].filter((h) => !allowed.includes(h));
  assert.deepEqual(unexpected, [], `unexpected host(s) in src/marketdata: ${unexpected.join(', ')}`);
});

test('no Binance credential is referenced anywhere', () => {
  // These are public market-data endpoints. Nothing here can trade, and a
  // Binance key would be both unnecessary and a liability in a public repo.
  const offences = [];
  for (const file of collect(MARKETDATA)) {
    const code = readFileSync(file, 'utf8');
    if (/BINANCE_(API_)?(KEY|SECRET)/i.test(code)) offences.push(path.relative(backend, file));
  }
  assert.deepEqual(offences, [], 'Binance needs no credential for public market data');
});

test('the CoinGecko key is never VITE_ prefixed', () => {
  // BR-17: a VITE_ prefix bundles the value into the browser.
  for (const file of collect(MARKETDATA)) {
    const code = readFileSync(file, 'utf8');
    assert.ok(!/VITE_[A-Z_]*COINGECKO/i.test(code),
      `${path.relative(backend, file)} must not read a VITE_ prefixed key`);
  }
});
