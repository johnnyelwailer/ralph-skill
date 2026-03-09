/** Parse TODO.md content to count completed vs total tasks */
export function parseTodoProgress(todoContent: string): { completed: number; total: number } {
  const taskPattern = /^[ \t]*- \[([ xX])\]/gm;
  let completed = 0;
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = taskPattern.exec(todoContent)) !== null) {
    total++;
    if (match[1] !== ' ') completed++;
  }
  return { completed, total };
}
