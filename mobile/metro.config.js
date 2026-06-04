const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Watch the shared directory at the monorepo root
config.watchFolders = [path.resolve(__dirname, '../shared')];

// Resolve 'shared/...' imports to the shared directory
config.resolver.extraNodeModules = {
  shared: path.resolve(__dirname, '../shared'),
};

// Ensure Metro resolves node_modules from the mobile directory when processing shared files
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config;
