const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// expo-build-properties' ios.useModularHeaders option only applies
// `:modular_headers => true` per-pod to Expo's own curated list of autolinked
// native modules (visible in build logs as "[Expo] Enabling modular headers
// for pod X"). It does not touch pods pulled in transitively — e.g.
// AppCheckCore/GoogleUtilities/RecaptchaInterop, dragged in by RevenueCat's
// PurchasesHybridCommon — so `pod install` still fails on those with
// "cannot yet be integrated as static libraries" even with that option set.
// The global `use_modular_headers!` directive (CocoaPods' own recommended
// fix for this exact error) covers every pod, including transitive ones,
// so this must run before pod install ever resolves the dependency graph.
function withGlobalModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(
          /^(platform :ios,.*)$/m,
          '$1\n\nuse_modular_headers!'
        );
        fs.writeFileSync(podfilePath, contents);
      }

      return config;
    },
  ]);
}

module.exports = withGlobalModularHeaders;
