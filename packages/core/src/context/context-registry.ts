/**
 * Context plugin registry.
 *
 * The registry holds live ContextPlugin instances. Plugins are registered at
 * daemon startup from project-level context-provider manifests loaded by the
 * daemon. The session runner resolves context ids against this registry before
 * each agent turn.
 *
 * Spec: docs/spec/context.md §Context plugins
 */

import type {
  ContextBlock,
  ContextInput,
  ContextPlugin,
  TurnObservation,
} from "./types.ts";

export type ContextRegistry = {
  /**
   * Register a context plugin. Id must be unique — later registrations with the
   * same id replace earlier ones. The registry takes no ownership; callers
   * manage plugin lifecycle.
   */
  register(plugin: ContextPlugin): void;

  /**
   * Resolve context blocks for one or more context ids. Returns blocks from
   * all resolved plugins concatenated in declaration order. Plugins that are
   * not registered are silently skipped (the spec says missing context ids
   * should fail startup, not fail mid-turn — the daemon validates at startup).
   *
   * Each plugin's `build` is called with the full `ContextInput`. Plugins MUST
   * respect `input.budgetTokens` as a hard ceiling on the total output.
   */
  build(input: ContextInput, contextIds: readonly string[]): Promise<ContextBlock[]>;

  /**
   * Forward a turn observation to every registered plugin that has an
   * `observe` method. Errors are swallowed so one plugin's observe failure
   * does not cascade.
   */
  observe(observation: TurnObservation): void;
};

export function createContextRegistry(): ContextRegistry {
  const plugins = new Map<string, ContextPlugin>();

  return {
    register(plugin: ContextPlugin): void {
      plugins.set(plugin.id, plugin);
    },

    async build(input: ContextInput, contextIds: readonly string[]): Promise<ContextBlock[]> {
      const blocks: ContextBlock[] = [];
      for (const id of contextIds) {
        const plugin = plugins.get(id);
        if (!plugin) continue; // silently skip unknown ids
        try {
          const result = await plugin.build(input);
          blocks.push(...result);
        } catch {
          // Plugin error — skip this plugin, do not fail the turn.
          // Errors are observable through the daemon's own error channel.
        }
      }
      return blocks;
    },

    observe(observation: TurnObservation): void {
      const all = Array.from(plugins.values());
      for (let i = 0; i < all.length; i++) {
        const plugin = all[i]!;
        if (!plugin.observe) continue;
        try {
          const result = plugin.observe(observation);
          // Handle both sync void and async Promise<void> plugins.
          if (result != null && typeof result === "object" && "catch" in result) {
            (result as Promise<void>).catch(() => {});
          }
        } catch {
          // Swallow sync observe errors.
        }
      }
    },
  };
}
