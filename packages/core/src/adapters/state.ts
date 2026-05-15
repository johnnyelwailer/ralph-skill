export interface EventStore {
  append(event: unknown): Promise<void>;
  read(since?: string): AsyncIterable<unknown>;
  close(): Promise<void>;
}