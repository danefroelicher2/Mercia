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

  # withFollyPatch: add shadowNodeFromValue shim for RN 0.81 (removed in favor of shadowNodeListFromValue)
  project_root = installer.sandbox.root.parent.parent

  rn_proxy_cpp = File.join(project_root, "node_modules/react-native-reanimated/Common/cpp/reanimated/NativeModules/ReanimatedModuleProxy.cpp")
  if File.exist?(rn_proxy_cpp)
    src = File.read(rn_proxy_cpp)
    shim = <<~'SHIM'
      // RN 0.81 compat: shadowNodeFromValue was removed from primitives.h but
      // ShadowNodeWrapper (single-node wrapper) still exists in ShadowNode.h.
      // updateProps passes ShadowNodeWrapper values, not ShadowNodeListWrapper —
      // unwrap directly via getNativeState<ShadowNodeWrapper>.
      #ifndef REANIMATED_SHADOW_NODE_FROM_VALUE_SHIM
      #define REANIMATED_SHADOW_NODE_FROM_VALUE_SHIM
      namespace facebook::react {
      inline static std::shared_ptr<const ShadowNode> shadowNodeFromValue(
          jsi::Runtime& runtime,
          const jsi::Value& value) {
        return value.asObject(runtime)
            .getNativeState<ShadowNodeWrapper>(runtime)
            ->shadowNode;
      }
      } // namespace facebook::react
      #endif
    SHIM
    # Inject shim after the primitives.h include inside RCT_NEW_ARCH_ENABLED block
    target = '#include <react/renderer/uimanager/primitives.h>'
    if src.include?(target) && !src.include?('REANIMATED_SHADOW_NODE_FROM_VALUE_SHIM')
      patched = src.sub(target, target + "\\n" + shim)
      File.write(rn_proxy_cpp, patched)
    end
  end

  # withFollyPatch: fix ReanimatedMountHook signature for RN 0.81 (double -> HighResTimeStamp)

  # Patch the node_modules header
  rn_mount_hook_h = File.join(project_root, "node_modules/react-native-reanimated/Common/cpp/reanimated/Fabric/ReanimatedMountHook.h")
  if File.exist?(rn_mount_hook_h)
    src = File.read(rn_mount_hook_h)
    patched = src
    # Fix signature: double -> HighResTimeStamp to match UIManagerMountHook base class in RN 0.81
    patched = patched.gsub('double mountTime) noexcept override;', 'HighResTimeStamp mountTime) noexcept override;')
    # Add include for HighResTimeStamp if not already present
    unless patched.include?('react/timing/primitives.h')
      patched = patched.gsub(
        '#include <react/renderer/uimanager/UIManagerMountHook.h>',
        "#include <react/renderer/uimanager/UIManagerMountHook.h>\\n#include <react/timing/primitives.h>"
      )
    end
    File.write(rn_mount_hook_h, patched) if patched != src
  end

  # Patch the node_modules implementation
  rn_mount_hook_cpp = File.join(project_root, "node_modules/react-native-reanimated/Common/cpp/reanimated/Fabric/ReanimatedMountHook.cpp")
  if File.exist?(rn_mount_hook_cpp)
    src = File.read(rn_mount_hook_cpp)
    patched = src.gsub('    double) noexcept {', '    HighResTimeStamp) noexcept {')
    File.write(rn_mount_hook_cpp, patched) if patched != src
  end

  # Patch the pod sandbox copy of the header
  sandbox_mount_hook_h = File.join(installer.sandbox.root, "Headers/Private/RNReanimated/reanimated/Fabric/ReanimatedMountHook.h")
  if File.exist?(sandbox_mount_hook_h)
    src = File.read(sandbox_mount_hook_h)
    patched = src
    patched = patched.gsub('double mountTime) noexcept override;', 'HighResTimeStamp mountTime) noexcept override;')
    unless patched.include?('react/timing/primitives.h')
      patched = patched.gsub(
        '#include <react/renderer/uimanager/UIManagerMountHook.h>',
        "#include <react/renderer/uimanager/UIManagerMountHook.h>\\n#include <react/timing/primitives.h>"
      )
    end
    File.write(sandbox_mount_hook_h, patched) if patched != src
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
