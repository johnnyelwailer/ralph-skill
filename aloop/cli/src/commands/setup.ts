import * as readline from 'node:readline';
import { discoverWorkspace, scaffoldWorkspace, type DiscoveryResult, type ScaffoldResult, type ScaffoldOptions } from './project.js';

export interface SetupCommandOptions {
  projectRoot?: string;
  homeDir?: string;
  nonInteractive?: boolean;
  spec?: string;
  providers?: string;
}

export type PromptFunction = (question: string, defaultValue: string) => Promise<string>;

async function defaultPromptUser(rl: readline.Interface, question: string, defaultValue: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${question} [${defaultValue}]: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

export async function setupCommandWithDeps(
  options: SetupCommandOptions,
  deps: {
    discover: (opts: { projectRoot?: string; homeDir?: string }) => Promise<DiscoveryResult>;
    scaffold: (opts: ScaffoldOptions) => Promise<ScaffoldResult>;
    prompt: PromptFunction;
  }
) {
  const discovery = await deps.discover({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
  });

  if (options.nonInteractive) {
    console.log('Running setup in non-interactive mode...');
    const result = await deps.scaffold({
      projectRoot: options.projectRoot,
      homeDir: options.homeDir,
      specFiles: options.spec ? [options.spec] : undefined,
      enabledProviders: options.providers ? options.providers.split(',').map(p => p.trim()) : undefined,
    });
    console.log(`Setup complete. Config written to: ${result.config_path}`);
    return;
  }

  console.log('\n--- Aloop Interactive Setup ---\n');

  const defaultSpec = options.spec || discovery.context.spec_candidates[0] || 'SPEC.md';
  const spec = await deps.prompt('Spec File', defaultSpec);

  const defaultProviders = options.providers || discovery.providers.installed.join(',') || 'claude';
  const providersRaw = await deps.prompt('Enabled Providers (comma-separated)', defaultProviders);
  const enabledProviders = providersRaw.split(',').map((s) => s.trim()).filter(Boolean);

  const defaultLanguage = discovery.context.detected_language;
  const language = await deps.prompt('Language', defaultLanguage);

  const defaultProvider = enabledProviders[0] || discovery.providers.default_provider;
  const provider = await deps.prompt('Primary Provider', defaultProvider);

  const defaultMode = 'plan-build-review';
  const mode = await deps.prompt('Mode', defaultMode);

  const defaultValidation = discovery.context.validation_presets.full.join(', ') || 'npm test';
  const validationCommandsRaw = await deps.prompt('Validation Commands (comma-separated)', defaultValidation);
  const validationCommands = validationCommandsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  const defaultSafety = 'Never delete the project directory or run destructive commands, Never push to remote without explicit user approval';
  const safetyRulesRaw = await deps.prompt('Safety Rules (comma-separated)', defaultSafety);
  const safetyRules = safetyRulesRaw.split(',').map((s) => s.trim()).filter(Boolean);

  console.log('\nScaffolding workspace with the following configuration:');
  console.log(`- Spec: ${spec}`);
  console.log(`- Providers: ${enabledProviders.join(', ')}`);
  console.log(`- Language: ${language}`);
  console.log(`- Primary Provider: ${provider}`);
  console.log(`- Mode: ${mode}`);
  console.log(`- Validation Commands: ${validationCommands.join(', ')}`);
  console.log(`- Safety Rules: ${safetyRules.join(', ')}`);
  console.log('');

  const result = await deps.scaffold({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    specFiles: [spec],
    enabledProviders,
    language,
    provider,
    mode,
    validationCommands,
    safetyRules,
  });

  console.log(`Setup complete. Config written to: ${result.config_path}`);
}

export async function setupCommand(options: SetupCommandOptions = {}) {
  let rl: readline.Interface | null = null;
  const deps = {
    discover: discoverWorkspace,
    scaffold: scaffoldWorkspace,
    prompt: async (question: string, defaultValue: string) => {
      if (!rl) {
        rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
      }
      return defaultPromptUser(rl, question, defaultValue);
    },
  };

  try {
    await setupCommandWithDeps(options, deps);
  } finally {
    if (rl) {
      (rl as readline.Interface).close();
    }
  }
}
