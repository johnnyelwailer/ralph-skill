import { scaffoldWorkspace, type OutputMode } from './project.js';

interface ScaffoldCommandOptions {
  projectRoot?: string;
  output?: OutputMode;
  language?: string;
  provider?: string;
  mode?: string;
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
    language: options.language,
    provider: options.provider,
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
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}
