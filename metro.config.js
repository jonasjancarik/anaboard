const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Work around Hermes startup crash from tslib@1.x ESM export condition
// (`modules/index.js` default-imports `tslib.js` and can resolve `default` as undefined).
// Disabling package exports makes Metro use `main` (`tslib.js`) consistently.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
