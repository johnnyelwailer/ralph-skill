import type { ParsedProviderRef, ProviderRef } from "./types.ts";

export function parseProviderRef(ref: ProviderRef): ParsedProviderRef {
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    throw new Error("provider ref cannot be empty");
  }

  const versionSplit = trimmed.split("@");
  if (versionSplit.length > 2) {
    throw new Error(`invalid provider ref "${ref}": too many @ separators`);
  }
  const rawPath = versionSplit[0]!;
  const version = versionSplit[1];
  if (version !== undefined && version.trim().length === 0) {
    throw new Error(`invalid provider ref "${ref}": version cannot be empty`);
  }

  const segments = rawPath.split("/").map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new Error(`invalid provider ref "${ref}": provider id is required`);
  }

  const providerId = segments[0]!;
  const track = segments.length > 1 ? segments[1] : undefined;
  const model = segments.length > 2 ? segments.slice(2).join("/") : undefined;
  const canonicalRef = [
    providerId,
    ...(track ? [track] : []),
    ...(model ? [model] : []),
  ].join("/") + (version ? `@${version}` : "");

  return {
    providerId,
    ...(track && { track }),
    ...(model && { model }),
    ...(version && { version }),
    canonicalRef,
  };
}

export function providerIdFromRef(ref: ProviderRef): string {
  return parseProviderRef(ref).providerId;
}
