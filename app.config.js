const baseUrl = process.env.EXPO_BASE_URL;

module.exports = ({ config }) => {
  const experiments = {
    ...(config.experiments ?? {}),
    ...(baseUrl ? { baseUrl } : {}),
  };

  return {
    ...config,
    experiments,
  };
};
