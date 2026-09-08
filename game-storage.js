const STORAGE_KEY = 'emilian-chess-game-v1';

// Storage is optional: blocked storage or a full quota must never stop a game.
export function createGameStorage(getStorage = () => window.localStorage) {
  let lastSaved = null;
  return {
    load() {
      try {
        const raw = getStorage().getItem(STORAGE_KEY);
        if (!raw || raw.length > 100000) return null;
        const value = JSON.parse(raw);
        if (value?.version !== 1 || !value.game || !Array.isArray(value.game.moves)) return null;
        lastSaved = raw;
        return value;
      } catch { return null; }
    },
    save(game, viewMode) {
      const raw = JSON.stringify({version: 1, game, viewMode});
      if (raw === lastSaved) return true;
      try {
        getStorage().setItem(STORAGE_KEY, raw);
        lastSaved = raw;
        return true;
      } catch { return false; }
    }
  };
}
