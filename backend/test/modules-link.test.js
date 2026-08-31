// Every module parses, and every import resolves to a real export.
//
// ---------------------------------------------------------------------------
// This test exists because commit 63d7fcc truncated fill.js from 398 lines to
// 130 and the whole suite kept passing.
// ---------------------------------------------------------------------------
//
// prepareFill() and executeFill() were deleted. Three scripts died at parse
// time with "does not provide an export named 'prepareFill'". Thirty-four tests
// passed anyway, because none of them import the fill path - the single most
// important file in the repo, and the suite could not see it was gone.
//
// Note what the failure actually was: a LINKING error, not a syntax error. The
// truncated file parsed perfectly. `node --check` would have said it was fine.
// So this checks two separate things:
//
//   1. every file parses                          (catches truncation mid-token)
//   2. every named import exists in its target    (catches truncation between
//                                                  functions, which is what
//                                                  actually happened)
//
// Static on purpose. Importing the modules for real would execute the scripts -
// they hit the network and the database at the top level - and src/db/client.js
// throws without SUPABASE_URL, which `npm test` does not load. A test that
// needs credentials is a test nobody runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every .js file under src/ and scripts/. */
function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = [...collect(path.join(root, 'src')), ...collect(path.join(root, 'scripts'))];

/** Comments can contain the words `import` and `export`; this file's own header does. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The names a file makes available to importers. */
function exportedNames(src) {
  const code = stripComments(src);
  const names = new Set();

  for (const m of code.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of code.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  // `export { a, b as c }` and `export { a } from './x.js'` - both make the
  // name available here, and the second is itself a link worth checking.
  for (const m of code.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const name = (bits[1] ?? bits[0]).trim();
      if (name) names.add(name);
    }
  }
  if (/^export\s+default\b/m.test(code)) names.add('default');
  return names;
}

/** Local imports and re-exports: [{ specifier, names, line }]. */
function localImports(src) {
  const code = stripComments(src);
  const out = [];
  const pattern = /^(?:import|export)\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"]/gms;
  for (const m of code.matchAll(pattern)) {
    const names = m[1]
      .split(',')
      .map((p) => p.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    out.push({ specifier: m[2], names });
  }
  return out;
}

test('every module parses', () => {
  const broken = [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      broken.push(`${path.relative(root, file)}: ${String(error.stderr).split('\n')[1] ?? error.message}`);
    }
  }
  assert.deepEqual(broken, [], `these files do not parse:\n  ${broken.join('\n  ')}`);
});

test('every local import resolves to a name the target actually exports', () => {
  const exportsByFile = new Map();
  for (const file of files) exportsByFile.set(file, exportedNames(readFileSync(file, 'utf8')));

  const missing = [];

  for (const file of files) {
    const from = path.relative(root, file);
    for (const { specifier, names } of localImports(readFileSync(file, 'utf8'))) {
      const target = path.resolve(path.dirname(file), specifier);

      if (!existsSync(target)) {
        missing.push(`${from} imports from '${specifier}', which does not exist`);
        continue;
      }

      const available = exportsByFile.get(target) ?? exportedNames(readFileSync(target, 'utf8'));
      for (const name of names) {
        if (!available.has(name)) {
          missing.push(
            `${from} imports { ${name} } from '${specifier}', ` +
            `but ${path.relative(root, target)} does not export it`,
          );
        }
      }
    }
  }

  assert.deepEqual(missing, [], `broken imports:\n  ${missing.join('\n  ')}`);
});

test('the module graph is not suspiciously small', () => {
  // A guard on the guard. If collect() ever stops finding files - a moved
  // directory, a changed layout - both tests above pass by checking nothing,
  // which is the exact failure this file was written to prevent.
  assert.ok(files.length > 30, `only found ${files.length} modules; expected the whole of src/ and scripts/`);
});
