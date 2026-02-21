import * as Crypto from 'expo-crypto';

export const hashPin = async (pin: string): Promise<string> => {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
};

export const isValidPin = (pin: string): boolean => /^\d{4}$/.test(pin);
