const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Shared core has no platform dependencies. Resolve React explicitly from mobile
// while retaining normal nested dependency lookup inside Expo's installation.
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/') || moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
    return context.resolveRequest({ ...context, disableHierarchicalLookup: true, nodeModulesPaths: config.resolver.nodeModulesPaths }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
