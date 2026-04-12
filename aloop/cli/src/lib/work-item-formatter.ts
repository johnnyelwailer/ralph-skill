const FORBIDDEN_TOKENS = [
  /github/i,
  /\bpr\b/i,
  /pull request/i,
  /\/issues\//i,
  /\/pull\//i,
  /issue #\d+/i,
];

export function formatWorkItemHeader(issueNumber: number, issueTitle: string): string {
  return `## Work Item ${issueNumber}: ${issueTitle}`;
}

export function formatWorkItemContext(
  issueNumber: number,
  issueTitle: string,
  body: string | undefined,
  wave: number,
  dependsOn: number[],
): string {
  const depRefs = dependsOn.length > 0
    ? dependsOn.map((d) => `[${d}]`).join(', ')
    : 'none';

  return [
    formatWorkItemHeader(issueNumber, issueTitle),
    '',
    body ?? '(no body)',
    '',
    `**Wave:** ${wave}`,
    `**Dependencies:** ${depRefs}`,
  ].join('\n');
}

export function sanitizePromptText(text: string): string {
  let sanitized = text;
  for (const token of FORBIDDEN_TOKENS) {
    sanitized = sanitized.replace(token, (match) => {
      if (token.source.includes('issue #') && /\d+/.test(match)) {
        return '[work item]';
      }
      if (/\bpr\b/i.test(match)) {
        return '[change request]';
      }
      if (/pull request/i.test(match)) {
        return '[change request]';
      }
      return '[work item]';
    });
  }
  return sanitized;
}

export function checkForForbiddenTokens(text: string): string[] {
  const found: string[] = [];
  for (const token of FORBIDDEN_TOKENS) {
    const matches = text.match(token);
    if (matches) {
      found.push(...matches);
    }
  }
  return found;
}

export interface WorkItemRef {
  number: number;
  title: string;
  body?: string;
  wave: number;
  depends_on: number[];
}
