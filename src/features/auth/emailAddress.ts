export type EmailProvider = 'gmail' | null;

export type NormalizedEmailAddress = {
  original: string;
  canonical: string;
  provider: EmailProvider;
};

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export const normalizeEmailAddress = (value: string): NormalizedEmailAddress => {
  const original = value.trim();
  const lowered = original.toLowerCase();
  const atIndex = lowered.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === lowered.length - 1) {
    return {
      original,
      canonical: lowered,
      provider: null,
    };
  }

  const localPart = lowered.slice(0, atIndex);
  const domain = lowered.slice(atIndex + 1);

  if (!GMAIL_DOMAINS.has(domain)) {
    return {
      original,
      canonical: `${localPart}@${domain}`,
      provider: null,
    };
  }

  const gmailLocalPart = localPart.split('+', 1)[0].replace(/\./g, '');

  return {
    original,
    canonical: `${gmailLocalPart}@gmail.com`,
    provider: 'gmail',
  };
};

export const getOriginalEmailAddress = (value: string): string =>
  normalizeEmailAddress(value).original;

export const canonicalizeEmailAddress = (value: string): string =>
  normalizeEmailAddress(value).canonical;
