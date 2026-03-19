export function normalizeCiDetailForSignature(detail: string): string {
  return detail
    .toLowerCase()
    .replace(/[0-9a-f]{7,40}/g, '<sha>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}
