const appJson = require('./app.json');

const baseUrl = process.env.EXPO_BASE_URL;

const experiments = {
  ...(appJson.expo.experiments ?? {}),
  ...(baseUrl ? { baseUrl } : {}),
};

module.exports = {
  expo: {
    ...appJson.expo,
    experiments,
  },
};
