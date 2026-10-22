const baseUrl = process.env.EXPO_BASE_URL;
// Google Play needs a higher versionCode for every upload; release scripts pass one in.
const androidVersionCode = Number.parseInt(process.env.ANDROID_VERSION_CODE ?? '', 10);

module.exports = ({ config }) => {
  const experiments = {
    ...(config.experiments ?? {}),
    ...(baseUrl ? { baseUrl } : {}),
  };

  return {
    ...config,
    experiments,
    android: {
      ...config.android,
      ...(Number.isInteger(androidVersionCode) ? { versionCode: androidVersionCode } : {}),
    },
  };
};
