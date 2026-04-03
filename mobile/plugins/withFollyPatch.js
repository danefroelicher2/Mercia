const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withFollyPatch(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      const injection = `
  # withFollyPatch: disable missing coro header
  expected_h = File.join(installer.sandbox.root, "Headers/Public/ReactNativeDependencies/folly/Expected.h")
  if File.exist?(expected_h)
    src = File.read(expected_h)
    patched = src.gsub('#include <folly/coro/Coroutine.h>', '// #include <folly/coro/Coroutine.h> -- disabled by withFollyPatch')
    File.write(expected_h, patched) if patched != src
  end
`;

      // Inject into the existing post_install block instead of adding a second one
      if (contents.includes('post_install do |installer|')) {
        contents = contents.replace(
          'post_install do |installer|',
          'post_install do |installer|' + injection
        );
      } else {
        // Fallback: no existing post_install, add one
        contents = contents + `\npost_install do |installer|\n${injection}end\n`;
      }
      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
}

module.exports = withFollyPatch;
