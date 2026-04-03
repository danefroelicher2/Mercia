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
  # withFollyPatch: replace #if FOLLY_HAS_COROUTINES with #if 0 in both offending headers
  ['Expected.h', 'Optional.h'].each do |fname|
    header_path = File.join(installer.sandbox.root, "Headers/Public/ReactNativeDependencies/folly/\#{fname}")
    if File.exist?(header_path)
      src = File.read(header_path)
      patched = src.gsub('#if FOLLY_HAS_COROUTINES', '#if 0 /* FOLLY_HAS_COROUTINES disabled by withFollyPatch */')
      File.write(header_path, patched) if patched != src
    end
  end
`;

      if (contents.includes('post_install do |installer|')) {
        contents = contents.replace(
          'post_install do |installer|',
          'post_install do |installer|' + injection
        );
      } else {
        contents = contents + `\npost_install do |installer|\n${injection}end\n`;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
}

module.exports = withFollyPatch;
