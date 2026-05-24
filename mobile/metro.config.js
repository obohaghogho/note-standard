const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Watch the shared directory at the monorepo root
config.watchFolders = [path.resolve(__dirname, '../shared')];

// Resolve 'shared/...' imports to the shared directory
config.resolver.extraNodeModules = {
  shared: path.resolve(__dirname, '../shared'),
};

module.exports = config;
