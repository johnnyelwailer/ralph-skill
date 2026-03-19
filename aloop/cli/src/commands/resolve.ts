import { assertProjectConfigured, discoverWorkspace, type OutputMode } from './project.js';

interface ResolveCommandOptions {
  projectRoot?: string;
  homeDir?: string;
  output?: OutputMode;
}

export async function resolveCommand(options: ResolveCommandOptions = {}) {
  const discovery = await discoverWorkspace({ projectRoot: options.projectRoot, homeDir: options.homeDir });
  assertProjectConfigured(discovery);
  const result = {
    project: discovery.project,
    setup: discovery.setup,
  };
  if (options.output === 'text') {
    console.log(`Project: ${result.project.name} [${result.project.hash}]`);
    console.log(`Root: ${result.project.root}`);
    console.log(`Project config: ${result.setup.config_path}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}
