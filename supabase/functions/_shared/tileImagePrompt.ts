import { generateJsonText } from './openai.ts';

export const TILE_IMAGE_PROMPT_VERSION = 'tile-image-v2-meaning';

export type TileSubjectKind = 'person' | 'feeling' | 'thing';

export type TileMeaning = {
  meaning: string;
  depiction: string;
  subjectKind: TileSubjectKind;
};

type TileImagePromptInput = {
  label: string;
  locale: string;
  category?: string;
};

const MEANING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meaning', 'depiction', 'subjectKind'],
  properties: {
    meaning: {
      type: 'string',
      description: 'Short English gloss of what the tile means, e.g. "to go outside".',
    },
    depiction: {
      type: 'string',
      description: 'One concrete, child-appropriate thing to draw, in English, without naming the word itself.',
    },
    subjectKind: {
      type: 'string',
      enum: ['person', 'feeling', 'thing'],
    },
  },
} as const;

// Image models misread short words, especially outside English (for example Czech "Ven",
// "go outside", was drawn as a glass of wine). A cheap text call resolves the meaning first.
export const describeTileMeaning = async (input: TileImagePromptInput): Promise<TileMeaning> => {
  const prompt = [
    'You help draw pictograms for an AAC (Augmentative and Alternative Communication) board used by young children.',
    `Tile label: "${input.label}".`,
    `The board language is ${input.locale}. Interpret the label in that language; if it is clearly written in a different language, use that language instead.`,
    input.category ? `Board category: ${input.category}.` : 'Board category: unknown.',
    'Return:',
    '- meaning: what the label means as an AAC word, in a few English words.',
    '- depiction: the single most recognizable, child-appropriate thing to draw for that meaning. Prefer symbols familiar from AAC symbol sets and emoji over metaphors. For an action, name the object most tied to it rather than a person doing it. For a person, describe only that person alone. For a feeling, describe a face showing it. Choose something that cannot be confused with other common AAC words such as stop, no, more or help.',
    '- subjectKind: "person" if the label names a person or family member, "feeling" if it is an emotion, pain or body sensation, otherwise "thing".',
  ].join('\n');

  const result = await generateJsonText<TileMeaning>({
    prompt,
    schemaName: 'tile_meaning',
    schema: MEANING_SCHEMA,
    reasoningEffort: 'low',
  });

  return {
    meaning: result.meaning.trim(),
    depiction: result.depiction.trim(),
    subjectKind: result.subjectKind,
  };
};

const SUBJECT_RULES: Record<TileSubjectKind, string> = {
  person: 'Show only that one person as an emoji-style person: head and shoulders, friendly and calm. No other people.',
  feeling: 'Show one round yellow emoji face that clearly expresses it. No body, no scene.',
  thing: 'Draw it as a single emoji: one object or symbol. No people, no hands, no scene.',
};

export const buildTileImagePrompt = (
  input: TileImagePromptInput,
  meaning: TileMeaning | null,
): string => {
  const subject = meaning
    ? [
        `The tile label is "${input.label}" (${input.locale}). It means: ${meaning.meaning}.`,
        `Draw: ${meaning.depiction}.`,
        SUBJECT_RULES[meaning.subjectKind],
      ]
    : [
        // Fallback when the meaning step fails: still apply the layout and style rules.
        `The tile label is "${input.label}" (${input.locale}).`,
        'Draw it like a single emoji: one object or symbol, no scene. Draw a person or face only if the word names a person or describes an emotion or pain.',
      ];

  return [
    'Create one square pictogram for an Augmentative and Alternative Communication (AAC) tile for young children.',
    ...subject,
    input.category ? `Category: ${input.category}.` : null,
    'Style: a modern smartphone emoji. Chunky rounded shapes, bright friendly colors, smooth soft shading with a gentle highlight, no outlines or only very subtle ones, minimal detail, readable at 64 pixels.',
    'Centered and large, filling most of the canvas but fully inside it with a small even margin on every side. Nothing cropped.',
    'Transparent background. No text, letters or numbers. No watermark. No frame. No background scene.',
  ]
    .filter(Boolean)
    .join(' ');
};
