import type { PromptPart } from "@aloop/provider";

export type OpencodeSdkPromptPart =
  | { type: "text"; text: string }
  | {
      type: "file";
      mime: string;
      url: string;
      filename?: string;
    };

export function resolvePromptParts(input: {
  prompt: string;
  promptParts?: readonly PromptPart[];
}): readonly PromptPart[] {
  return input.promptParts && input.promptParts.length > 0
    ? input.promptParts
    : [{ type: "text", text: input.prompt }];
}

export function toSdkPromptParts(parts: readonly PromptPart[]): OpencodeSdkPromptPart[] {
  return parts.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "file":
        return {
          type: "file",
          mime: part.mime,
          url: part.url,
          ...(part.filename !== undefined && { filename: part.filename }),
        };
    }
  });
}
