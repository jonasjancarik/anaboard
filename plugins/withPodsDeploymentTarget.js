const { withPodfile } = require('expo/config-plugins');

// Xcode 27 refuses pod targets below iOS 15.0 (AsyncStorage and Sentry
// resource bundles still declare 11.0/13.4), so lift every pod to the app's
// minimum after `pod install`.
const MARKER = '# anaboard: pods deployment target';
const MIN_IOS = '15.1';

module.exports = function withPodsDeploymentTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    const podfile = podfileConfig.modResults;
    if (podfile.contents.includes(MARKER)) {
      return podfileConfig;
    }

    podfile.contents = podfile.contents.replace(
      /post_install do \|installer\|\n/,
      (match) =>
        `${match}    ${MARKER}\n` +
        `    installer.pods_project.targets.each do |target|\n` +
        `      target.build_configurations.each do |build_config|\n` +
        `        if build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${MIN_IOS}\n` +
        `          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'\n` +
        `        end\n` +
        `      end\n` +
        `    end\n`
    );

    if (!podfile.contents.includes(MARKER)) {
      throw new Error('withPodsDeploymentTarget: post_install hook not found in ios/Podfile');
    }

    return podfileConfig;
  });
};
