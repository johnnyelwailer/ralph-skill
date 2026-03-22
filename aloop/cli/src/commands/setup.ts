import * as readline from 'node:readline';
import { discoverWorkspace, scaffoldWorkspace, type DiscoveryResult, type ScaffoldResult, type ScaffoldOptions } from './project.js';
import { getProposedAuthMethod, type AuthStrategy } from './devcontainer.js';

export type DataPrivacy = 'private' | 'public';

/** Provider-level ZDR constraint warnings for private-mode users. */
const ZDR_PROVIDER_WARNINGS: Record<string, string> = {
  claude: 'ZDR requires an org agreement with Anthropic. Verify your org has ZDR enabled. https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#zero-data-retention',
  gemini: 'ZDR requires project-level approval from Google. https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance',
  codex: 'ZDR requires a sales agreement with OpenAI. Note: images are excluded from ZDR. https://platform.openai.com/docs/models',
  copilot: 'ZDR requires Business or Enterprise plan. https://docs.github.com/en/copilot/managing-copilot/managing-copilot-as-an-individual-subscriber/about-github-copilot-free',
};

export function getZdrWarnings(enabledProviders: string[]): string[] {
  const warnings: string[] = [];
  for (const provider of enabledProviders) {
    const warning = ZDR_PROVIDER_WARNINGS[provider];
    if (warning) {
      warnings.push(`${provider}: ${warning}`);
    }
  }
  return warnings;
}

export interface SetupCommandOptions {
  projectRoot?: string;
  homeDir?: string;
  nonInteractive?: boolean;
  spec?: string;
  provider?: string;
  providers?: string;
  mode?: string;
  autonomyLevel?: string;
  dataPrivacy?: string;
  devcontainerAuthStrategy?: string;
}

function parseDataPrivacy(value: string | undefined): DataPrivacy | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'private' || normalized === 'public') {
    return normalized;
  }
  throw new Error(`Invalid data privacy: ${value} (must be private or public)`);
}

type DevcontainerAuthStrategy = 'mount-first' | 'env-first' | 'env-only';

function parseDevcontainerAuthStrategy(value: string | undefined): DevcontainerAuthStrategy | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'mount-first' || normalized === 'env-first' || normalized === 'env-only') {
    return normalized as DevcontainerAuthStrategy;
  }
  throw new Error(`Invalid devcontainer auth strategy: ${value} (must be mount-first, env-first, or env-only)`);
}

export type PromptFunction = (question: string, defaultValue: string) => Promise<string>;

type AutonomyLevel = 'cautious' | 'balanced' | 'autonomous';

function parseAutonomyLevel(value: string | undefined): AutonomyLevel | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'cautious' || normalized === 'balanced' || normalized === 'autonomous') {
    return normalized;
  }
  throw new Error(`Invalid autonomy level: ${value} (must be cautious, balanced, or autonomous)`);
}

type SetupMode = 'loop' | 'orchestrate';
type SetupConfirmation = 'confirm' | 'adjust' | 'cancel';

function parseSetupMode(value: string | undefined): SetupMode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'loop' || normalized === 'orchestrate' || normalized === 'single') {
    return (normalized === 'loop' || normalized === 'single') ? 'loop' : 'orchestrate';
  }
  throw new Error(`Invalid setup mode: ${value} (must be loop or orchestrate)`);
}

function mapSetupModeToLoopMode(value: SetupMode | undefined): string | undefined {
  if (!value) return undefined;
  if (value === 'orchestrate') {
    return 'orchestrate';
  }
  return 'plan-build-review';
}

function parseSetupConfirmation(value: string | undefined): SetupConfirmation | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'confirm' || normalized === 'adjust' || normalized === 'cancel') {
    return normalized;
  }
  throw new Error(`Invalid setup confirmation: ${value} (must be confirm, adjust, or cancel)`);
}

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
  const providerListInput = options.providers ?? options.provider;
  const parsedProviderList = providerListInput
    ? providerListInput.split(',').map(p => p.trim()).filter(Boolean)
    : undefined;

  const discovery = await deps.discover({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
  });

  if (options.nonInteractive) {
    console.log('Running setup in non-interactive mode...');
    const setupMode = parseSetupMode(options.mode);
    const result = await deps.scaffold({
      projectRoot: options.projectRoot,
      homeDir: options.homeDir,
      specFiles: options.spec ? [options.spec] : undefined,
      enabledProviders: parsedProviderList,
      mode: mapSetupModeToLoopMode(setupMode),
      autonomyLevel: parseAutonomyLevel(options.autonomyLevel),
      dataPrivacy: parseDataPrivacy(options.dataPrivacy),
      devcontainerAuthStrategy: parseDevcontainerAuthStrategy(options.devcontainerAuthStrategy),
    });
    console.log(`Setup complete. Config written to: ${result.config_path}`);
    return;
  }

  console.log('\n--- Aloop Interactive Setup ---\n');

  let spec = options.spec || discovery.context.spec_candidates[0] || 'SPEC.md';
  let enabledProviders = ((parsedProviderList?.join(',')) || discovery.providers.installed.join(',') || 'claude')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let language = discovery.context.detected_language;
  let provider = enabledProviders[0] || discovery.providers.default_provider;

  const recommendedMode = discovery.mode_recommendation?.recommended_mode;
  const recommendationReasons = discovery.mode_recommendation?.reasoning || [];
  if (recommendedMode && recommendationReasons.length > 0) {
    console.log('\n  Mode recommendation:');
    for (const reason of recommendationReasons) {
      console.log(`    ${reason}`);
    }
    console.log('');
  }

  let mode = recommendedMode === 'orchestrate' ? 'orchestrate' : 'plan-build-review';
  let autonomyLevel = parseAutonomyLevel(options.autonomyLevel ?? 'balanced') ?? 'balanced';
  let dataPrivacy = parseDataPrivacy(options.dataPrivacy ?? 'private') ?? 'private';
  let devcontainerAuthStrategy: DevcontainerAuthStrategy | undefined =
    parseDevcontainerAuthStrategy(options.devcontainerAuthStrategy ?? (discovery.devcontainer.enabled ? 'mount-first' : undefined));
  let validationCommands = (discovery.context.validation_presets.full.join(', ') || 'npm test')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let safetyRules = 'Never delete the project directory or run destructive commands, Never push to remote without explicit user approval'
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  while (true) {
    spec = await deps.prompt('Spec File', spec);
    const providersRaw = await deps.prompt('Enabled Providers (comma-separated)', enabledProviders.join(',') || 'claude');
    enabledProviders = providersRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const providerDefault = enabledProviders[0] || discovery.providers.default_provider;
    if (!enabledProviders.includes(provider)) {
      provider = providerDefault;
    }

    language = await deps.prompt('Language', language);
    provider = await deps.prompt('Primary Provider', providerDefault);
    mode = await deps.prompt('Mode', mode);
    autonomyLevel = parseAutonomyLevel(
      await deps.prompt('Autonomy Level (cautious|balanced|autonomous)', autonomyLevel),
    ) ?? 'balanced';
    dataPrivacy = parseDataPrivacy(
      await deps.prompt('Data Privacy (private|public)', dataPrivacy),
    ) ?? 'private';

    if (discovery.devcontainer.enabled) {
      devcontainerAuthStrategy = parseDevcontainerAuthStrategy(
        await deps.prompt(
          'Devcontainer Auth Strategy (mount-first|env-first|env-only)',
          devcontainerAuthStrategy ?? 'mount-first',
        ),
      ) ?? 'mount-first';
    }

    const validationCommandsRaw = await deps.prompt('Validation Commands (comma-separated)', validationCommands.join(', '));
    validationCommands = validationCommandsRaw.split(',').map((s) => s.trim()).filter(Boolean);

    const safetyRulesRaw = await deps.prompt('Safety Rules (comma-separated)', safetyRules.join(', '));
    safetyRules = safetyRulesRaw.split(',').map((s) => s.trim()).filter(Boolean);

    console.log('\nScaffolding workspace with the following configuration:');
    console.log(`- Spec: ${spec}`);
    console.log(`- Providers: ${enabledProviders.join(', ')}`);
    console.log(`- Language: ${language}`);
    console.log(`- Primary Provider: ${provider}`);
    console.log(`- Mode: ${mode}`);
    console.log(`- Autonomy Level: ${autonomyLevel}`);
    console.log(`- Data Privacy: ${dataPrivacy}`);
    console.log(`- ZDR Mode: ${dataPrivacy === 'private' ? 'Enabled' : 'Disabled'}`);
    if (dataPrivacy === 'private') {
      const zdrWarnings = getZdrWarnings(enabledProviders);
      for (const warning of zdrWarnings) {
        console.log(`  ⚠ ${warning}`);
      }
    }
    if (mode === 'orchestrate') {
      console.log('- Trunk Branch: agent/trunk');
    }
    if (discovery.devcontainer.enabled) {
      console.log(`- Devcontainer Auth Strategy: ${devcontainerAuthStrategy}`);
      console.log('- Proposed Provider Auth:');
      for (const p of enabledProviders) {
        console.log(`    ${p}: ${getProposedAuthMethod(p, devcontainerAuthStrategy!)}`);
      }
    }
    console.log(`- Validation Commands: ${validationCommands.join(', ')}`);
    console.log(`- Safety Rules: ${safetyRules.join(', ')}`);
    console.log('');

    const confirmation = parseSetupConfirmation(
      await deps.prompt('Setup Confirmation (confirm|adjust|cancel)', 'confirm'),
    ) ?? 'confirm';
    if (confirmation === 'confirm') {
      break;
    }
    if (confirmation === 'cancel') {
      console.log('Setup cancelled. No files were written.');
      return;
    }
    console.log('Adjusting setup selections...\n');
  }

  const result = await deps.scaffold({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    specFiles: [spec],
    enabledProviders,
    language,
    provider,
    mode,
    autonomyLevel,
    dataPrivacy,
    devcontainerAuthStrategy,
    validationCommands,
    safetyRules,
  });

  console.log(`Setup complete. Config written to: ${result.config_path}`);

  if (enabledProviders.includes('opencode')) {
    console.log('');
    console.log('Shipped OpenCode agents installed to .opencode/agents/:');
    console.log('  code-critic       — Deep code review for subtle bugs and security issues');
    console.log('  error-analyst     — Parses error logs and stack traces to suggest fixes');
    console.log('  vision-reviewer   — Analyzes screenshots for layout and visual issues');
    console.log('');
    console.log('Run them with: opencode run --agent <name>');
  }
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
