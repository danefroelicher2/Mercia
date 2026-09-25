/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: 'widget',
  name: 'widget',
  displayName: 'Mercia',
  deploymentTarget: '17.0',
  bundleIdentifier: '.widget',
  // Same App Group as the app, so the widget can read the streak snapshot.
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
