export const getRequiredEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} missing`);
  }

  return value;
};

export const getOptionalEnv = (name: string, fallback: string): string => {
  return Deno.env.get(name) ?? fallback;
};

export const getOptionalBooleanEnv = (name: string, fallback: boolean): boolean => {
  const value = Deno.env.get(name);
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be a boolean`);
};

export const getOptionalIntEnv = (name: string, fallback: number): number => {
  const value = Deno.env.get(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
};
