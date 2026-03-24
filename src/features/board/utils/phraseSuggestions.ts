import type {
  PhraseSource,
  PhraseEventRecord,
  PhraseTokenSnapshot,
  SavedPhrase,
  SentenceToken,
  Tile,
} from '../../../shared/types/domain';

type SequenceInput = {
  tokens: PhraseTokenSnapshot[];
  baseWeight: number;
};

export type PhrasePrediction = {
  id: string;
  token: PhraseTokenSnapshot;
  score: number;
};

const MAX_MATCH_DEPTH = 3;
const DEFAULT_SUGGESTION_LIMIT = 3;

type CandidateAggregate = {
  id: string;
  token: PhraseTokenSnapshot;
  score: number;
  hits: number;
};

const toTokenSnapshot = (token: SentenceToken | PhraseTokenSnapshot): PhraseTokenSnapshot => ({
  tileId: token.tileId,
  label: token.label,
  emoji: token.emoji,
  visualType: token.visualType,
  imageLocalUri: token.imageLocalUri,
  imageRemotePath: token.imageRemotePath,
});

const resolveTokenSnapshot = (
  token: PhraseTokenSnapshot,
  tilesById: Record<string, Tile>
): PhraseTokenSnapshot => {
  const tile = tilesById[token.tileId];
  if (!tile) {
    return token;
  }

  return {
    tileId: tile.id,
    label: tile.labelCs,
    emoji: tile.emoji,
    visualType: tile.visualType,
    imageLocalUri: tile.imageLocalUri,
    imageRemotePath: tile.imageRemotePath,
  };
};

const matchesSuffix = (
  sentenceIds: string[],
  sequenceIds: string[],
  sequenceIndex: number,
  matchLength: number
): boolean => {
  if (matchLength <= 0 || sequenceIndex < matchLength || sentenceIds.length < matchLength) {
    return false;
  }

  const sentenceStart = sentenceIds.length - matchLength;
  const sequenceStart = sequenceIndex - matchLength;

  for (let offset = 0; offset < matchLength; offset += 1) {
    if (sentenceIds[sentenceStart + offset] !== sequenceIds[sequenceStart + offset]) {
      return false;
    }
  }

  return true;
};

const getMatchWeight = (depth: number): number => {
  if (depth >= 3) {
    return 4.8;
  }

  if (depth === 2) {
    return 2.5;
  }

  return 1;
};

const getSavedPhraseWeight = (
  phrase: SavedPhrase,
  index: number,
  newestSavedAt: number
): number => {
  const updatedAtMs = Date.parse(phrase.updatedAt);
  const ageDays =
    Number.isFinite(updatedAtMs) && newestSavedAt > 0
      ? Math.max(0, (newestSavedAt - updatedAtMs) / 86_400_000)
      : index * 2;
  const recencyFactor = Math.exp(-ageDays / 45);
  const usageBoost = 1 + Math.min(phrase.usageCount, 12) * 0.08;

  return 1.45 * usageBoost * Math.max(0.35, recencyFactor);
};

const getHistorySourceWeight = (source: PhraseSource): number => {
  if (source === 'manual') {
    return 1.15;
  }

  if (source === 'saved' || source === 'recent') {
    return 1.08;
  }

  return 0.92;
};

const getHistoryPhraseWeight = (
  phrase: PhraseEventRecord,
  index: number,
  newestSpokenAt: number
): number => {
  const spokenAtMs = Date.parse(phrase.spokenAt);
  const ageDays =
    Number.isFinite(spokenAtMs) && newestSpokenAt > 0
      ? Math.max(0, (newestSpokenAt - spokenAtMs) / 86_400_000)
      : index;
  const recencyFactor = Math.exp(-ageDays / 14);

  return getHistorySourceWeight(phrase.source) * Math.max(0.2, recencyFactor);
};

const buildSavedSequences = (savedPhrases: SavedPhrase[]): SequenceInput[] => {
  const newestSavedAt = savedPhrases.reduce((latest, phrase) => {
    const timestamp = Date.parse(phrase.updatedAt);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  return savedPhrases.map((phrase, index) => ({
    tokens: phrase.tokens,
    baseWeight: getSavedPhraseWeight(phrase, index, newestSavedAt),
  }));
};

const buildHistorySequences = (historyPhrases: PhraseEventRecord[]): SequenceInput[] => {
  const newestSpokenAt = historyPhrases.reduce((latest, phrase) => {
    const timestamp = Date.parse(phrase.spokenAt);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  return historyPhrases.map((phrase, index) => ({
    tokens: phrase.tokens,
    baseWeight: getHistoryPhraseWeight(phrase, index, newestSpokenAt),
  }));
};

export const buildPhrasePredictions = (params: {
  sentence: SentenceToken[];
  savedPhrases: SavedPhrase[];
  recentPhrases: PhraseEventRecord[];
  tilesById: Record<string, Tile>;
  limit?: number;
}): PhrasePrediction[] => {
  const { sentence, savedPhrases, recentPhrases, tilesById, limit = DEFAULT_SUGGESTION_LIMIT } = params;
  if (sentence.length === 0) {
    return [];
  }

  const sentenceIds = sentence.map((token) => token.tileId);
  const sequences: SequenceInput[] = [
    ...buildSavedSequences(savedPhrases),
    ...buildHistorySequences(recentPhrases),
  ];

  const candidates = new Map<string, CandidateAggregate>();

  for (const sequence of sequences) {
    const sequenceIds = sequence.tokens.map((token) => token.tileId);

    for (let index = 1; index < sequence.tokens.length; index += 1) {
      const maxDepth = Math.min(MAX_MATCH_DEPTH, sentenceIds.length, index);

      for (let depth = maxDepth; depth >= 1; depth -= 1) {
        if (!matchesSuffix(sentenceIds, sequenceIds, index, depth)) {
          continue;
        }

        const nextToken = resolveTokenSnapshot(sequence.tokens[index], tilesById);
        const candidateId = nextToken.tileId || `${nextToken.label}:${nextToken.emoji}`;
        const nextScore = sequence.baseWeight * getMatchWeight(depth);
        const existing = candidates.get(candidateId);

        if (!existing) {
          candidates.set(candidateId, {
            id: candidateId,
            token: nextToken,
            score: nextScore,
            hits: 1,
          });
        } else {
          existing.score += nextScore;
          existing.hits += 1;
          candidates.set(candidateId, existing);
        }

        break;
      }
    }
  }

  return [...candidates.values()]
    .map((candidate) => {
      const frequencyBoost = 1 + Math.min(candidate.hits - 1, 6) * 0.14;

      return {
        ...candidate,
        score: candidate.score * frequencyBoost,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.token.label.localeCompare(right.token.label, 'cs-CZ');
    })
    .slice(0, limit)
    .map((candidate) => ({
      ...candidate,
      token: toTokenSnapshot(candidate.token),
    }));
};
