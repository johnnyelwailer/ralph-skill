import { scaffoldWorkspace, type OutputMode } from './project.js';

interface ScaffoldCommandOptions {
  projectRoot?: string;
  homeDir?: string;
  output?: OutputMode;
  language?: string;
  provider?: string;
  mode?: string;
  autonomyLevel?: string;
  templatesDir?: string;
  enabledProviders?: string[];
  roundRobinOrder?: string[];
  specFiles?: string[];
  referenceFiles?: string[];
  validationCommands?: string[];
  safetyRules?: string[];
}

export async function scaffoldCommand(options: ScaffoldCommandOptions = {}) {
  const result = await scaffoldWorkspace({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    language: options.language,
    provider: options.provider,
    autonomyLevel: options.autonomyLevel as 'cautious' | 'balanced' | 'autonomous' | undefined,
    enabledProviders: options.enabledProviders,
    roundRobinOrder: options.roundRobinOrder,
    specFiles: options.specFiles,
    referenceFiles: options.referenceFiles,
    validationCommands: options.validationCommands,
    safetyRules: options.safetyRules,
    mode: options.mode,
    templatesDir: options.templatesDir,
  });

  if (options.output === 'text') {
    console.log(`Wrote config: ${result.config_path}`);
    console.log(`Wrote prompts: ${result.prompts_dir}`);
    if (options.enabledProviders?.includes('opencode')) {
      console.log('');
      console.log('Shipped OpenCode agents installed to .opencode/agents/:');
      console.log('  code-critic       — Deep code review for subtle bugs and security issues');
      console.log('  error-analyst     — Parses error logs and stack traces to suggest fixes');
      console.log('  vision-reviewer   — Analyzes screenshots for layout and visual issues');
      console.log('');
      console.log('Run them with: opencode run --agent <name>');
    }
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}
