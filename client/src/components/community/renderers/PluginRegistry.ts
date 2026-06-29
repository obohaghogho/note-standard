import React from 'react';
import { PostPlugin } from './PluginContract';

// Define the type for dynamic imports
type PluginLoader = () => Promise<{ default: PostPlugin }>;

class Registry {
  private plugins = new Map<string, PostPlugin>();
  private asyncPlugins = new Map<string, PluginLoader>();
  private cache = new Map<string, Promise<PostPlugin>>();

  // Register synchronous plugin (e.g., base plugins like Text)
  register(plugin: PostPlugin) {
    this.plugins.set(plugin.id, plugin);
  }

  // Register asynchronous plugin (e.g., heavy plugins like Video, Poll)
  registerAsync(id: string, loader: PluginLoader) {
    this.asyncPlugins.set(id, loader);
  }

  // Get a plugin synchronously (if already loaded)
  get(id: string): PostPlugin | undefined {
    return this.plugins.get(id);
  }

  // Load a plugin asynchronously, with caching
  async load(id: string): Promise<PostPlugin | undefined> {
    if (this.plugins.has(id)) {
      return this.plugins.get(id);
    }

    if (!this.asyncPlugins.has(id)) {
      return undefined; // Unrecognized plugin
    }

    if (!this.cache.has(id)) {
      const loader = this.asyncPlugins.get(id)!;
      const loadPromise = loader()
        .then(module => {
          const plugin = module.default;
          this.plugins.set(id, plugin);
          return plugin;
        })
        .catch(err => {
          this.cache.delete(id); // Clear cache so we can retry later
          throw err;
        });
      
      this.cache.set(id, loadPromise);
    }

    return this.cache.get(id);
  }

  // Prefetch logic: Silently warm up the cache
  prefetch(ids: string[]) {
    ids.forEach(id => {
      if (!this.plugins.has(id) && this.asyncPlugins.has(id) && !this.cache.has(id)) {
        // Trigger load but ignore the result (fire and forget)
        this.load(id).catch(() => {});
      }
    });
  }

  getAllLoaded(): PostPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const PluginRegistry = new Registry();
