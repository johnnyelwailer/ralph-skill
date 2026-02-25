import { discoverWorkspace, type OutputMode } from './project.js';

interface DiscoverCommandOptions {
  projectRoot?: string;
  output?: OutputMode;
}

export async function discoverCommand(options: DiscoverCommandOptions = {}) {
  const result = await discoverWorkspace({ projectRoot: options.projectRoot });
  if (options.output === 'text') {
    console.log(`Project: ${result.project.name} [${result.project.hash}]`);
    console.log(`Root: ${result.project.root}`);
    console.log(`Detected language: ${result.context.detected_language} (${result.context.language_confidence})`);
    console.log(`Providers installed: ${result.providers.installed.join(', ')}`);
    console.log(`Spec candidates: ${result.context.spec_candidates.join(', ')}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}
