// PluginRegistry Health Check
import { PluginRegistry } from './PluginRegistry';

export const runRegistryHealthCheck = () => {
  if (process.env.NODE_ENV === 'production') return;

  const plugins = PluginRegistry.getAllLoaded();
  const ids = new Set<string>();

  console.groupCollapsed('🏥 Plugin Registry Health Check');

  let hasErrors = false;

  plugins.forEach(plugin => {
    // 1. Unique ID
    if (ids.has(plugin.id)) {
      console.error(`❌ Duplicate Plugin ID found: ${plugin.id}`);
      hasErrors = true;
    }
    ids.add(plugin.id);

    // 2. Required Interfaces
    if (!plugin.Renderer) {
      console.error(`❌ Plugin ${plugin.id} is missing a Renderer.`);
      hasErrors = true;
    }
    if (typeof plugin.validator !== 'function') {
      console.error(`❌ Plugin ${plugin.id} is missing a validator function.`);
      hasErrors = true;
    }

    // 3. Supported Actions
    if (!Array.isArray(plugin.supportedActions)) {
      console.error(`❌ Plugin ${plugin.id} must define an array of supportedActions.`);
      hasErrors = true;
    }
  });

  if (!hasErrors) {
    console.log('✅ All registered plugins passed health checks.');
  }
  
  console.groupEnd();
};
