import type {
  PhraseEventRecord,
  PhraseTokenSnapshot,
  SavedPhrase,
  SentenceToken,
  Tile,
} from '../../../shared/types/domain';

type SequenceInput = {
  tokens: PhraseTokenSnapshot[];
  weight: number;
};

export type PhrasePrediction = {
  id: string;
  token: PhraseTokenSnapshot;
  score: number;
};

const MAX_MATCH_DEPTH = 3;

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

export const buildPhrasePredictions = (params: {
  sentence: SentenceToken[];
  savedPhrases: SavedPhrase[];
  recentPhrases: PhraseEventRecord[];
  tilesById: Record<string, Tile>;
  limit?: number;
}): PhrasePrediction[] => {
  const { sentence, savedPhrases, recentPhrases, tilesById, limit = 5 } = params;
  if (sentence.length === 0) {
    return [];
  }

  const sentenceIds = sentence.map((token) => token.tileId);
  const sequences: SequenceInput[] = [
    ...savedPhrases.map((phrase, index) => ({
      tokens: phrase.tokens,
      weight: Math.max(6, 10 - index),
    })),
    ...recentPhrases.map((phrase, index) => ({
      tokens: phrase.tokens,
      weight: Math.max(3, 7 - index),
    })),
  ];

  const candidates = new Map<string, PhrasePrediction>();

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
        const nextScore = sequence.weight * depth;
        const existing = candidates.get(candidateId);

        if (!existing || nextScore > existing.score) {
          candidates.set(candidateId, {
            id: candidateId,
            token: nextToken,
            score: nextScore,
          });
        } else if (existing) {
          existing.score += nextScore * 0.35;
          candidates.set(candidateId, existing);
        }

        break;
      }
    }
  }

  return [...candidates.values()]
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
