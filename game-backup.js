import {createGame} from './game.js';

export const MAX_BACKUP_BYTES = 100000;
const FORMAT = 'emilian-chess-backup';

// Replay in an isolated game before touching the current game or storage.
// Validation never starts the engine and discards unrecognized file fields.
function normalize(record) {
  if (!record || record.version !== 1 || !['play', 'room'].includes(record.viewMode)) {
    throw new Error('Filen er ikke en understøttet backup af et Chess-parti.');
  }
  const preview = createGame();
  try {
    if (!preview.restoreGame(record.game)) {
      throw new Error('Partiet i filen er ugyldigt og kan ikke gendannes.');
    }
    return {version: 1, game: preview.exportGame(), viewMode: record.viewMode};
  } finally {
    preview.dispose();
  }
}

export function createBackupText(game, viewMode, now = new Date()) {
  const record = normalize({version: 1, game, viewMode});
  return JSON.stringify({format: FORMAT, ...record, exportedAt: now.toISOString()}, null, 2) + '\n';
}

export function parseBackupText(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    throw new Error('Backupfilen er for stor. Vælg en Chess-backup på højst 100 KB.');
  }
  let record;
  try { record = JSON.parse(text); }
  catch { throw new Error('Filen kunne ikke læses. Vælg en JSON-backup hentet fra Chess.'); }
  if (record?.format !== FORMAT) {
    throw new Error('Filen er ikke en understøttet backup af et Chess-parti.');
  }
  return normalize(record);
}
