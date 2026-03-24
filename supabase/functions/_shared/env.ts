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
