import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../game.js';
import {createBackupText, parseBackupText, MAX_BACKUP_BYTES} from '../game-backup.js';

const game = moves => ({version: 1, humanColor: 'w', targetDepth: 9, moves});

test('backup round trip preserves castling and reconstructed undo without any network call', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('Backup validation must never call an external service');
  const restored = createGame();
  try {
    const record = game(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1e2', 'g8f6', 'e1g1', 'f8e7']);
    const backup = parseBackupText(createBackupText(record, 'room'));
    assert.deepEqual(backup, {version: 1, game: record, viewMode: 'room'});
    assert.equal(restored.restoreGame(backup.game), true);
    restored.undo();
    assert.deepEqual(restored.exportGame().moves, record.moves.slice(0, -2));
  } finally { restored.dispose(); globalThis.fetch = originalFetch; }
});

test('backup rejects malformed files, unsupported versions, illegal moves and UTF-8 byte overflow', () => {
  const valid = JSON.parse(createBackupText(game(['e2e4']), 'play'));
  const bad = ['{broken', 'null', JSON.stringify({...valid, format: 'other'}),
    JSON.stringify({...valid, version: 2}), JSON.stringify({...valid, viewMode: 'unknown'}),
    JSON.stringify({...valid, game: game(['e2e5'])}),
    JSON.stringify({...valid, game: {...game([]), moves: Array(1001).fill('e2e4')}}),
    'é'.repeat(MAX_BACKUP_BYTES / 2 + 1)];
  for (const text of bad) assert.throws(() => parseBackupText(text));
});

test('backup strips unknown fields and copies the validated transcript', () => {
  const record = JSON.parse(createBackupText(game(['e2e4', 'e7e5']), 'play'));
  record.extra = '<script>invalid()</script>';
  record.game.extra = 'untrusted';
  const parsed = parseBackupText(JSON.stringify(record));
  record.game.moves[0] = 'e2e5';
  assert.deepEqual(parsed, {version: 1, game: game(['e2e4', 'e7e5']), viewMode: 'play'});
});

test('backup preserves a claimed draw and completed checkmate', () => {
  const repeats = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const claim = {...game(repeats), drawClaim: {claimant: 'w', reason: 'threefold', intendedUci: null}};
  assert.deepEqual(parseBackupText(createBackupText(claim, 'play')).game, claim);
  const mate = game(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  assert.deepEqual(parseBackupText(createBackupText(mate, 'room')).game, mate);
});
