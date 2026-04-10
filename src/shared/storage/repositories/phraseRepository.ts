import type {
  PhraseEventRecord,
  PhraseSource,
  PhraseTokenSnapshot,
  SavedPhrase,
  SentenceToken,
} from '../../types/domain';
import { createId } from '../../utils/id';
import { nowIso } from '../../utils/time';
import { getDatabase } from '../db';
import { enqueueSyncEvent } from './syncRepository';

type SavedPhraseRow = {
  id: string;
  profile_id: string;
  phrase_key: string;
  label: string;
  spoken_text: string;
  tokens_json: string;
  created_at: string;
  updated_at: string;
  usage_count: number;
};

type PhraseEventRow = {
  id: string;
  profile_id: string;
  tile_sequence: string;
  spoken_text: string;
  mode: string;
  spoken_at: string;
};

const RECENT_PHRASE_FETCH_LIMIT = 24;
const SUGGESTION_PHRASE_FETCH_LIMIT = 500;

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, ' ');

export const toPhraseTokenSnapshot = (
  token: PhraseTokenSnapshot | SentenceToken
): PhraseTokenSnapshot => ({
  tileId: token.tileId,
  label: normalizeWhitespace(token.label),
  emoji: token.emoji,
  visualType: token.visualType,
  imageLocalUri: token.imageLocalUri,
  imageRemotePath: token.imageRemotePath,
});

export const buildPhraseSpokenText = (
  tokens: Array<PhraseTokenSnapshot | SentenceToken>
): string =>
  normalizeWhitespace(
    tokens
      .map((token) => ('label' in token ? normalizeWhitespace(token.label) : ''))
      .filter(Boolean)
      .join(' ')
  );

export const createPhraseKey = (
  tokens: Array<PhraseTokenSnapshot | SentenceToken>
): string =>
  tokens
    .map((token) => {
      const snapshot = toPhraseTokenSnapshot(token);
      return `${snapshot.tileId}:${snapshot.label.toLocaleLowerCase('cs-CZ')}`;
    })
    .join('|');

const serializePhraseTokens = (
  tokens: Array<PhraseTokenSnapshot | SentenceToken>
): string => JSON.stringify(tokens.map(toPhraseTokenSnapshot));

const parsePhraseTokens = (rawValue: string): PhraseTokenSnapshot[] => {
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }

      const candidate = item as Partial<PhraseTokenSnapshot>;
      if (
        typeof candidate.tileId !== 'string' ||
        typeof candidate.label !== 'string' ||
        typeof candidate.emoji !== 'string'
      ) {
        return [];
      }

      return [
        {
          tileId: candidate.tileId,
          label: normalizeWhitespace(candidate.label),
          emoji: candidate.emoji,
          visualType: candidate.visualType === 'image' ? 'image' : 'emoji',
          imageLocalUri:
            typeof candidate.imageLocalUri === 'string'
              ? candidate.imageLocalUri
              : undefined,
          imageRemotePath:
            typeof candidate.imageRemotePath === 'string'
              ? candidate.imageRemotePath
              : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
};

const mapSavedPhraseRow = (row: SavedPhraseRow): SavedPhrase | null => {
  const tokens = parsePhraseTokens(row.tokens_json);
  if (tokens.length === 0) {
    return null;
  }

  return {
    id: row.id,
    profileId: row.profile_id,
    phraseKey: row.phrase_key,
    label: row.label,
    spokenText: row.spoken_text,
    tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usageCount: row.usage_count,
  };
};

const mapPhraseEventRow = (row: PhraseEventRow): PhraseEventRecord | null => {
  const tokens = parsePhraseTokens(row.tile_sequence);
  if (tokens.length === 0) {
    return null;
  }

  const source: PhraseSource =
    row.mode === 'saved' || row.mode === 'recent' || row.mode === 'composed'
      ? row.mode
      : 'manual';

  return {
    id: row.id,
    profileId: row.profile_id,
    tokens,
    spokenText: row.spoken_text,
    source,
    spokenAt: row.spoken_at,
  };
};

const buildSavedPhrasePayload = (row: SavedPhraseRow) => ({
  id: row.id,
  profile_id: row.profile_id,
  phrase_key: row.phrase_key,
  label: row.label,
  spoken_text: row.spoken_text,
  tokens_json: row.tokens_json,
  created_at: row.created_at,
  updated_at: row.updated_at,
  usage_count: row.usage_count,
});

const buildPhraseEventPayload = (row: PhraseEventRow) => ({
  id: row.id,
  profile_id: row.profile_id,
  tile_sequence: row.tile_sequence,
  spoken_text: row.spoken_text,
  mode: row.mode,
  spoken_at: row.spoken_at,
});

const getSavedPhraseRowById = async (phraseId: string): Promise<SavedPhraseRow | null> => {
  const db = await getDatabase();
  return db.getFirstAsync<SavedPhraseRow>(
    `
      SELECT
        id,
        profile_id,
        phrase_key,
        label,
        spoken_text,
        tokens_json,
        created_at,
        updated_at,
        usage_count
      FROM saved_phrases
      WHERE id = ?
      LIMIT 1
    `,
    phraseId
  );
};

export const getSavedPhrases = async (
  profileId: string,
  limit?: number
): Promise<SavedPhrase[]> => {
  const db = await getDatabase();
  const rows = limit === undefined
    ? await db.getAllAsync<SavedPhraseRow>(
        `
          SELECT
            id,
            profile_id,
            phrase_key,
            label,
            spoken_text,
            tokens_json,
            created_at,
            updated_at,
            usage_count
          FROM saved_phrases
          WHERE profile_id = ?
          ORDER BY updated_at DESC, created_at DESC
        `,
        profileId
      )
    : await db.getAllAsync<SavedPhraseRow>(
        `
          SELECT
            id,
            profile_id,
            phrase_key,
            label,
            spoken_text,
            tokens_json,
            created_at,
            updated_at,
            usage_count
          FROM saved_phrases
          WHERE profile_id = ?
          ORDER BY updated_at DESC, created_at DESC
          LIMIT ?
        `,
        profileId,
        limit
      );

  return rows
    .map(mapSavedPhraseRow)
    .filter((phrase): phrase is SavedPhrase => Boolean(phrase));
};

export const getRecentPhraseEvents = async (
  profileId: string,
  limit = 6
): Promise<PhraseEventRecord[]> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PhraseEventRow>(
    `
      SELECT id, profile_id, tile_sequence, spoken_text, mode, spoken_at
      FROM phrase_events
      WHERE profile_id = ?
        AND mode != 'composed'
      ORDER BY spoken_at DESC
      LIMIT ?
    `,
    profileId,
    RECENT_PHRASE_FETCH_LIMIT
  );

  const results: PhraseEventRecord[] = [];
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const record = mapPhraseEventRow(row);
    if (!record) {
      continue;
    }

    const dedupeKey = `${createPhraseKey(record.tokens)}:${record.source}`;
    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    results.push(record);

    if (results.length >= limit) {
      break;
    }
  }

  return results;
};

export const getSuggestionPhraseEvents = async (
  profileId: string,
  limit = SUGGESTION_PHRASE_FETCH_LIMIT
): Promise<PhraseEventRecord[]> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PhraseEventRow>(
    `
      SELECT id, profile_id, tile_sequence, spoken_text, mode, spoken_at
      FROM phrase_events
      WHERE profile_id = ?
      ORDER BY spoken_at DESC
      LIMIT ?
    `,
    profileId,
    Math.min(limit, SUGGESTION_PHRASE_FETCH_LIMIT)
  );

  return rows
    .map(mapPhraseEventRow)
    .filter((phrase): phrase is PhraseEventRecord => Boolean(phrase))
    .slice(0, limit);
};

export const savePhrase = async (
  profileId: string,
  tokens: Array<PhraseTokenSnapshot | SentenceToken>
): Promise<SavedPhrase> => {
  const sanitizedTokens = tokens.map(toPhraseTokenSnapshot).filter((token) => token.label.length > 0);
  if (sanitizedTokens.length === 0) {
    throw new Error('Věta je prázdná');
  }

  const db = await getDatabase();
  const phraseKey = createPhraseKey(sanitizedTokens);
  const spokenText = buildPhraseSpokenText(sanitizedTokens);
  const label = spokenText || sanitizedTokens[0]?.label || 'Věta';
  const timestamp = nowIso();
  const serializedTokens = serializePhraseTokens(sanitizedTokens);

  const existing = await db.getFirstAsync<SavedPhraseRow>(
    `
      SELECT
        id,
        profile_id,
        phrase_key,
        label,
        spoken_text,
        tokens_json,
        created_at,
        updated_at,
        usage_count
      FROM saved_phrases
      WHERE profile_id = ? AND phrase_key = ?
      LIMIT 1
    `,
    profileId,
    phraseKey
  );

  if (existing) {
    const nextRow: SavedPhraseRow = {
      ...existing,
      label,
      spoken_text: spokenText,
      tokens_json: serializedTokens,
      updated_at: timestamp,
      usage_count: existing.usage_count + 1,
    };

    await db.runAsync(
      `
        UPDATE saved_phrases
        SET
          label = ?,
          spoken_text = ?,
          tokens_json = ?,
          updated_at = ?,
          usage_count = usage_count + 1
        WHERE id = ?
      `,
      label,
      spokenText,
      serializedTokens,
      timestamp,
      existing.id
    );

    await enqueueSyncEvent('saved_phrases', existing.id, 'upsert', buildSavedPhrasePayload(nextRow));

    return {
      ...(mapSavedPhraseRow(nextRow) as SavedPhrase),
    };
  }

  const phraseId = createId('phrase');

  await db.runAsync(
    `
      INSERT INTO saved_phrases (
        id,
        profile_id,
        phrase_key,
        label,
        spoken_text,
        tokens_json,
        created_at,
        updated_at,
        usage_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    phraseId,
    profileId,
    phraseKey,
    label,
    spokenText,
    serializedTokens,
    timestamp,
    timestamp
  );

  await enqueueSyncEvent('saved_phrases', phraseId, 'upsert', {
    id: phraseId,
    profile_id: profileId,
    phrase_key: phraseKey,
    label,
    spoken_text: spokenText,
    tokens_json: serializedTokens,
    created_at: timestamp,
    updated_at: timestamp,
    usage_count: 1,
  });

  return {
    id: phraseId,
    profileId,
    phraseKey,
    label,
    spokenText,
    tokens: sanitizedTokens,
    createdAt: timestamp,
    updatedAt: timestamp,
    usageCount: 1,
  };
};

export const deleteSavedPhrase = async (phraseId: string): Promise<void> => {
  const existing = await getSavedPhraseRowById(phraseId);
  if (!existing) {
    return;
  }

  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_phrases WHERE id = ?', phraseId);
  await enqueueSyncEvent('saved_phrases', phraseId, 'delete', {
    id: phraseId,
    profile_id: existing.profile_id,
  });
};

export const noteSavedPhrasePlayed = async (phraseId: string): Promise<void> => {
  const existing = await getSavedPhraseRowById(phraseId);
  if (!existing) {
    return;
  }

  const db = await getDatabase();
  const updatedAt = nowIso();
  await db.runAsync(
    `
      UPDATE saved_phrases
      SET updated_at = ?, usage_count = usage_count + 1
      WHERE id = ?
    `,
    updatedAt,
    phraseId
  );

  await enqueueSyncEvent('saved_phrases', phraseId, 'upsert', buildSavedPhrasePayload({
    ...existing,
    updated_at: updatedAt,
    usage_count: existing.usage_count + 1,
  }));
};

export const recordPhraseEvent = async (params: {
  profileId: string;
  tokens: Array<PhraseTokenSnapshot | SentenceToken>;
  source: PhraseSource;
}): Promise<void> => {
  const sanitizedTokens = params.tokens
    .map(toPhraseTokenSnapshot)
    .filter((token) => token.label.length > 0);
  if (sanitizedTokens.length === 0) {
    return;
  }

  const db = await getDatabase();
  const spokenAt = nowIso();
  const eventId = createId('phrase-event');
  const payload: PhraseEventRow = {
    id: eventId,
    profile_id: params.profileId,
    tile_sequence: serializePhraseTokens(sanitizedTokens),
    spoken_text: buildPhraseSpokenText(sanitizedTokens),
    mode: params.source,
    spoken_at: spokenAt,
  };

  await db.runAsync(
    `
      INSERT INTO phrase_events (
        id,
        profile_id,
        tile_sequence,
        spoken_text,
        mode,
        spoken_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    payload.id,
    payload.profile_id,
    payload.tile_sequence,
    payload.spoken_text,
    payload.mode,
    payload.spoken_at
  );

  await enqueueSyncEvent('phrase_events', payload.id, 'upsert', buildPhraseEventPayload(payload));
};
