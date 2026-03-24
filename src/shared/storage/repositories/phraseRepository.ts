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
    row.mode === 'saved' || row.mode === 'recent' ? row.mode : 'manual';

  return {
    id: row.id,
    profileId: row.profile_id,
    tokens,
    spokenText: row.spoken_text,
    source,
    spokenAt: row.spoken_at,
  };
};

export const getSavedPhrases = async (
  profileId: string,
  limit = 8
): Promise<SavedPhrase[]> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SavedPhraseRow>(
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

    return {
      ...(mapSavedPhraseRow({
        ...existing,
        label,
        spoken_text: spokenText,
        tokens_json: serializedTokens,
        updated_at: timestamp,
        usage_count: existing.usage_count + 1,
      }) as SavedPhrase),
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
  const db = await getDatabase();
  await db.runAsync('DELETE FROM saved_phrases WHERE id = ?', phraseId);
};

export const noteSavedPhrasePlayed = async (phraseId: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `
      UPDATE saved_phrases
      SET updated_at = ?, usage_count = usage_count + 1
      WHERE id = ?
    `,
    nowIso(),
    phraseId
  );
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
    createId('phrase-event'),
    params.profileId,
    serializePhraseTokens(sanitizedTokens),
    buildPhraseSpokenText(sanitizedTokens),
    params.source,
    spokenAt
  );
};
