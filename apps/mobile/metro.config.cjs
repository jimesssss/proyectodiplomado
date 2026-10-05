const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.disableHierarchicalLookup = false;

const routerEntry = path.resolve(workspaceRoot, 'node_modules/expo-router/entry');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './node_modules/expo-router/entry') {
    return context.resolveRequest(context, routerEntry, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
