import { parseProviderRef } from "./ref.ts";
import type { ParsedProviderRef, ProviderAdapter, ProviderRef } from "./types.ts";

export type ResolvedProvider = {
  readonly ref: ParsedProviderRef;
  readonly adapter: ProviderAdapter;
};

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    const existing = this.adapters.get(adapter.id);
    if (existing) {
      throw new Error(`provider adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(providerId: string): ProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  require(providerId: string): ProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`provider adapter not registered: ${providerId}`);
    }
    return adapter;
  }

  list(): readonly ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  async disposeAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.dispose?.();
    }
  }

  resolve(ref: ProviderRef): ResolvedProvider {
    const parsed = parseProviderRef(ref);
    return {
      ref: parsed,
      adapter: this.require(parsed.providerId),
    };
  }
}
