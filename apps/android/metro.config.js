const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Android build-flavor detection (F-Droid FOSS guarantee — see
// docs/FDROID-SUBMISSION-PLAN.md and the sidecoin fdroiddata!50457
// precedent). Metro is invoked by Gradle's per-variant bundle task
// `createBundle<Flavor><BuildType>JsAndAssets`, so the flavor is visible
// in process.argv as the task name — RN exposes it no other way (no env
// var, no runtime flag; verified in the sidecoin submission). Only the
// fdroid flavor redirects the build-flavor flag to its `true` variant.
function detectAndroidFlavor(argv) {
  const commandLine = argv.join(' ');
  if (/createBundleAppstore[A-Za-z]*JsAndAssets/.test(commandLine)) {
    return 'appstore';
  }
  if (/createBundleFdroid[A-Za-z]*JsAndAssets/.test(commandLine)) {
    return 'fdroid';
  }
  return null;
}

const androidFlavor = detectAndroidFlavor(process.argv);

const config = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.join(projectRoot, 'node_modules'),
      path.join(workspaceRoot, 'node_modules'),
    ],
    unstable_enableSymlinks: true,
    disableHierarchicalLookup: false,
    // react-native uses package.json "exports" subpaths (e.g.
    // react-native/react-private-interface), so exports resolution must stay on.
    unstable_enablePackageExports: true,
    // Only the `fdroid` flavor resolves the build-flavor flag to its
    // `true` variant; appstore, dev, and Jest keep the base module
    // (IS_FDROID_BUILD=false). The ".fdroid" specifier itself never
    // matches: it ends with ".fdroid", not "/build-flavor".
    resolveRequest: (context, moduleName, platform) => {
      if (androidFlavor === 'fdroid' && moduleName.endsWith('/build-flavor')) {
        return context.resolveRequest(
          context,
          path.resolve(projectRoot, 'build-flavor.fdroid.ts'),
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};
const { withNativeWind } = require('nativewind/metro');
module.exports = withNativeWind(mergeConfig(getDefaultConfig(projectRoot), config), {
  input: './global.css',
});
