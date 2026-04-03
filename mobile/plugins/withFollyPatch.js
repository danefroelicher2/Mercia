const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withFollyPatch(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      const patch = `
post_install do |installer|
  expected_h = File.join(installer.sandbox.root, "Headers/Public/ReactNativeDependencies/folly/Expected.h")
  if File.exist?(expected_h)
    src = File.read(expected_h)
    patched = src.gsub('#include <folly/coro/Coroutine.h>', '// #include <folly/coro/Coroutine.h> -- disabled by withFollyPatch')
    File.write(expected_h, patched) if patched != src
  end
end
`;

      contents = contents + '\n' + patch;
      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
}

module.exports = withFollyPatch;
