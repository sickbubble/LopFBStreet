import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Rule 1 (CLAUDE.md): packages/domain never imports three, the DOM or Node,
 * and stays deterministic. The tsconfig already gives it no DOM and no Node
 * types; this scans the source so a cast, an `any` or a global cannot slip
 * one in. The twin of the Godot build's ArchitectureTests.
 */
const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** The code with comments and string contents blanked, so a doc comment naming `window` is fine. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
}

const files = sourceFiles(src);

const specifier = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

const forbiddenGlobals = [
  'window',
  'document',
  'navigator',
  'globalThis',
  'self',
  'process',
  'require',
  'requestAnimationFrame',
  'performance',
  'localStorage',
  'fetch',
  'setTimeout',
  'setInterval',
];

describe('architecture: packages/domain', () => {
  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(src, f).split(sep).join('/'), f]))(
    '%s imports only other domain files',
    (_name, file) => {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(specifier)) {
        const spec = m[1] ?? m[2] ?? m[3] ?? '';
        expect(spec.startsWith('./') || spec.startsWith('../'), `import of '${spec}'`).toBe(true);
        const target = resolve(dirname(file), spec);
        expect(target.startsWith(src), `'${spec}' leaves packages/domain/src`).toBe(true);
      }
    },
  );

  it.each(files.map((f) => [relative(src, f).split(sep).join('/'), f]))(
    '%s uses no browser or Node globals, no clock and no randomness',
    (_name, file) => {
      const code = codeOnly(readFileSync(file, 'utf8'));
      for (const name of forbiddenGlobals) {
        expect(new RegExp(`(?<![\\w.$])${name}\\b`).test(code), `uses ${name}`).toBe(false);
      }
      expect(/\bMath\.random\b/.test(code), 'uses Math.random').toBe(false);
      expect(/\bDate\b/.test(code), 'uses Date').toBe(false);
    },
  );
});
