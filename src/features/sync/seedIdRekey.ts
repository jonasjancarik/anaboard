import type { MigrationDatabase } from '../../shared/storage/migrations';

/**
 * Every install seeds its first board as `default-board` with tiles `tile-1`, `tile-2`, …, but
 * cloud primary keys are shared by all families. Only the first family to upload owns those ids;
 * for everyone else the upload is refused, so before a device uploads into a cloud profile that
 * does not already hold these rows, the seed ids are replaced with unique ones.
 */
export const SEED_TILE_ID_PATTERN = /^tile-\d+$/;

type TokenRow = {
  id: string;
};

type TileIdMap = Map<string, string>;

const remapTokensJson = (value: string, tileIds: TileIdMap): string | null => {
  let tokens: unknown;
  try {
    tokens = JSON.parse(value);
  } catch {
    return null;
  }

  if (!Array.isArray(tokens)) {
    return null;
  }

  let changed = false;
  const nextTokens = tokens.map((token) => {
    if (!token || typeof token !== 'object') {
      return token;
    }

    const nextTileId = tileIds.get(String((token as { tileId?: unknown }).tileId));
    if (!nextTileId) {
      return token;
    }

    changed = true;
    return { ...token, tileId: nextTileId };
  });

  return changed ? JSON.stringify(nextTokens) : null;
};

/** Phrase keys are `<tileId>:<label>` segments joined by `|`. */
export const remapPhraseKey = (phraseKey: string, tileIds: TileIdMap): string => {
  return phraseKey
    .split('|')
    .map((segment) => {
      const separatorIndex = segment.indexOf(':');
      const tileId = separatorIndex === -1 ? segment : segment.slice(0, separatorIndex);
      const nextTileId = tileIds.get(tileId);
      return nextTileId ? `${nextTileId}${segment.slice(tileId.length)}` : segment;
    })
    .join('|');
};

export const hasLocalSeedBoard = async (
  db: MigrationDatabase,
  seedBoardId: string
): Promise<boolean> => {
  const row = await db.getFirstAsync<TokenRow>('SELECT id FROM boards WHERE id = ? LIMIT 1', seedBoardId);
  return row !== null;
};

/**
 * Renames the seed board and seed tiles everywhere they are referenced locally, drops queued
 * changes for the old ids (the cloud never accepted them for this family) and queues uploads for
 * the renamed rows. Returns false when there was nothing to rename.
 */
export const rekeySeedBoard = async (
  db: MigrationDatabase,
  params: {
    seedBoardId: string;
    createId: (prefix: string) => string;
    now: string;
  }
): Promise<boolean> => {
  const { seedBoardId, createId, now } = params;

  return await db.withTransactionAsync(async () => {
    if (!(await hasLocalSeedBoard(db, seedBoardId))) {
      return false;
    }

    // Parent and child ids change one statement at a time; foreign keys are checked at commit.
    await db.execAsync('PRAGMA defer_foreign_keys = ON');

    const nextBoardId = createId('board');
    const tileIds: TileIdMap = new Map();
    const tileRows = await db.getAllAsync<TokenRow>('SELECT id FROM tiles');
    for (const row of tileRows) {
      if (SEED_TILE_ID_PATTERN.test(row.id)) {
        tileIds.set(row.id, createId('tile'));
      }
    }

    await db.runAsync('UPDATE boards SET id = ?, dirty = 1 WHERE id = ?', nextBoardId, seedBoardId);
    await db.runAsync('UPDATE tiles SET board_id = ? WHERE board_id = ?', nextBoardId, seedBoardId);
    await db.runAsync('UPDATE tiles_history SET board_id = ? WHERE board_id = ?', nextBoardId, seedBoardId);
    await db.runAsync('UPDATE tile_archive SET board_id = ? WHERE board_id = ?', nextBoardId, seedBoardId);

    for (const [oldTileId, nextTileId] of tileIds) {
      await db.runAsync('UPDATE tiles SET id = ?, dirty = 1 WHERE id = ?', nextTileId, oldTileId);
      await db.runAsync('UPDATE audio_clips SET tile_id = ? WHERE tile_id = ?', nextTileId, oldTileId);
      await db.runAsync('UPDATE tiles_history SET tile_id = ? WHERE tile_id = ?', nextTileId, oldTileId);
      await db.runAsync(
        'UPDATE tile_archive SET original_tile_id = ? WHERE original_tile_id = ?',
        nextTileId,
        oldTileId
      );
    }

    const changedPhraseIds: string[] = [];
    const savedPhrases = await db.getAllAsync<{ id: string; phrase_key: string; tokens_json: string }>(
      'SELECT id, phrase_key, tokens_json FROM saved_phrases'
    );
    for (const phrase of savedPhrases) {
      const nextTokensJson = remapTokensJson(phrase.tokens_json, tileIds);
      const nextPhraseKey = remapPhraseKey(phrase.phrase_key, tileIds);
      if (!nextTokensJson && nextPhraseKey === phrase.phrase_key) {
        continue;
      }

      await db.runAsync(
        'UPDATE saved_phrases SET phrase_key = ?, tokens_json = ? WHERE id = ?',
        nextPhraseKey,
        nextTokensJson ?? phrase.tokens_json,
        phrase.id
      );
      changedPhraseIds.push(phrase.id);
    }

    const changedPhraseEventIds: string[] = [];
    const phraseEvents = await db.getAllAsync<{ id: string; tile_sequence: string }>(
      'SELECT id, tile_sequence FROM phrase_events'
    );
    for (const event of phraseEvents) {
      const nextSequence = remapTokensJson(event.tile_sequence, tileIds);
      if (!nextSequence) {
        continue;
      }

      await db.runAsync('UPDATE phrase_events SET tile_sequence = ? WHERE id = ?', nextSequence, event.id);
      changedPhraseEventIds.push(event.id);
    }

    const oldTileIds = [...tileIds.keys()];
    await db.runAsync(
      "DELETE FROM sync_events WHERE status IN ('pending', 'error') AND entity_type = 'boards' AND entity_id = ?",
      seedBoardId
    );
    if (oldTileIds.length > 0) {
      await db.runAsync(
        `DELETE FROM sync_events
         WHERE status IN ('pending', 'error') AND entity_type = 'tiles'
           AND entity_id IN (${oldTileIds.map(() => '?').join(',')})`,
        ...oldTileIds
      );
    }

    // Uploads read the current local row, so the queued payload only needs the id.
    const enqueue = async (entityType: string, entityId: string): Promise<void> => {
      await db.runAsync(
        `INSERT INTO sync_events (entity_type, entity_id, operation, payload, created_at, status)
         VALUES (?, ?, 'upsert', ?, ?, 'pending')`,
        entityType,
        entityId,
        JSON.stringify({ id: entityId }),
        now
      );
    };

    await enqueue('boards', nextBoardId);
    const boardTiles = await db.getAllAsync<TokenRow>('SELECT id FROM tiles WHERE board_id = ?', nextBoardId);
    const tilesToUpload = new Set([...boardTiles.map((row) => row.id), ...tileIds.values()]);
    for (const tileId of tilesToUpload) {
      await enqueue('tiles', tileId);
    }

    const nextTileIds = [...tileIds.values()];
    if (nextTileIds.length > 0) {
      const clips = await db.getAllAsync<TokenRow>(
        `SELECT id FROM audio_clips WHERE tile_id IN (${nextTileIds.map(() => '?').join(',')})`,
        ...nextTileIds
      );
      for (const clip of clips) {
        await enqueue('audio_clips', clip.id);
      }
    }

    for (const phraseId of changedPhraseIds) {
      await enqueue('saved_phrases', phraseId);
    }

    for (const eventId of changedPhraseEventIds) {
      await enqueue('phrase_events', eventId);
    }

    return true;
  });
};
