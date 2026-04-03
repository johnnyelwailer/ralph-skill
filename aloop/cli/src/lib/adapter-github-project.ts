/**
 * GitHub project-status helpers for GitHubAdapter.
 *
 * Extracted from adapter-github.ts so the main adapter file stays under 300 LOC.
 * These functions handle the GraphQL-based GitHub Projects v2 status field
 * (resolving project/field IDs, then writing the status option).
 */

import type { GhExecFn } from './github-monitor.js';

export interface ProjectStatusContext {
  itemId: string;
  projectId: string;
  statusFieldId: string;
  statusOptions: Map<string, string>;
}

/**
 * Resolves the GitHub Projects v2 context (item ID, project ID, status field ID,
 * and option map) for the given issue number.  Results are cached in `cache` so
 * subsequent calls for the same issue are free.
 */
export async function resolveProjectStatusContext(
  repo: string,
  execGh: GhExecFn,
  cache: Map<number, ProjectStatusContext | null>,
  issueNumber: number,
): Promise<ProjectStatusContext | null> {
  if (cache.has(issueNumber)) {
    return cache.get(issueNumber) ?? null;
  }

  const parts = repo.split('/');
  const owner = parts[0];
  const name = parts[1];
  if (!owner || !name || parts.length !== 2) {
    cache.set(issueNumber, null);
    return null;
  }

  const query = 'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){projectItems(first:20){nodes{id project{id} fieldValues(first:50){nodes{... on ProjectV2ItemFieldSingleSelectValue{field{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}}}}}';
  const response = await execGh([
    'api', 'graphql',
    '-f', `query=${query}`,
    '-F', `owner=${owner}`,
    '-F', `repo=${name}`,
    '-F', `number=${issueNumber}`,
  ]);

  const parsed = JSON.parse(response.stdout) as {
    data?: {
      repository?: {
        issue?: {
          projectItems?: {
            nodes?: Array<{
              id?: string;
              project?: { id?: string };
              fieldValues?: {
                nodes?: Array<{
                  field?: {
                    id?: string;
                    name?: string;
                    options?: Array<{ id?: string; name?: string }>;
                  };
                }>;
              };
            }>;
          };
        };
      };
    };
  };

  const nodes = parsed.data?.repository?.issue?.projectItems?.nodes;
  if (!Array.isArray(nodes)) {
    cache.set(issueNumber, null);
    return null;
  }

  for (const node of nodes) {
    const itemId = typeof node.id === 'string' ? node.id : '';
    const projectId = typeof node.project?.id === 'string' ? node.project.id : '';
    if (!itemId || !projectId) continue;
    const fieldNodes = node.fieldValues?.nodes;
    if (!Array.isArray(fieldNodes)) continue;
    for (const fieldNode of fieldNodes) {
      const field = fieldNode.field;
      if (!field || field.name !== 'Status') continue;
      const fieldId = typeof field.id === 'string' ? field.id : '';
      if (!fieldId || !Array.isArray(field.options) || field.options.length === 0) continue;
      const statusOptions = new Map<string, string>();
      for (const option of field.options) {
        if (typeof option.name === 'string' && typeof option.id === 'string') {
          statusOptions.set(option.name.toLowerCase(), option.id);
        }
      }
      const context: ProjectStatusContext = { itemId, projectId, statusFieldId: fieldId, statusOptions };
      cache.set(issueNumber, context);
      return context;
    }
  }

  cache.set(issueNumber, null);
  return null;
}

/**
 * Sets the GitHub Projects v2 "Status" field for the given issue.
 * No-ops silently when the issue is not associated with a project or
 * the requested status option does not exist.
 */
export async function setIssueStatusViaProject(
  repo: string,
  execGh: GhExecFn,
  cache: Map<number, ProjectStatusContext | null>,
  number: number,
  status: string,
): Promise<void> {
  const context = await resolveProjectStatusContext(repo, execGh, cache, number);
  if (!context) return;
  const optionId = context.statusOptions.get(status.toLowerCase());
  if (!optionId) return;
  await execGh([
    'project', 'item-edit',
    '--id', context.itemId,
    '--project-id', context.projectId,
    '--field-id', context.statusFieldId,
    '--single-select-option-id', optionId,
  ]);
}
