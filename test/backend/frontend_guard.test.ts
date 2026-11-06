import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APPROVED_FRONTEND_MARKER, hasApprovedFrontend } from '../../src/services/frontendGuard.js';

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

test('approves the v2 frontend marker in dist/index.html', () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otzaria-frontend-guard-'));
  const indexPath = path.join(tempDir, 'dist', 'index.html');
  fs.mkdirSync(path.dirname(indexPath));
  fs.writeFileSync(indexPath, `<head>${APPROVED_FRONTEND_MARKER}</head>`);

  assert.equal(hasApprovedFrontend(indexPath), true);
});

test('keeps the guard closed for missing or unapproved frontends', () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otzaria-frontend-guard-'));
  const indexPath = path.join(tempDir, 'dist', 'index.html');

  assert.equal(hasApprovedFrontend(indexPath), false);

  fs.mkdirSync(path.dirname(indexPath));
  fs.writeFileSync(indexPath, '<head><meta name="otzaria-frontend" content="v1" /></head>');
  assert.equal(hasApprovedFrontend(indexPath), false);
});
