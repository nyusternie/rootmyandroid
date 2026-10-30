const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
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
  },
};
module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
