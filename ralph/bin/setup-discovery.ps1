#!/usr/bin/env pwsh

param(
    [ValidateSet('discover', 'scaffold')]
    [string]$Command = 'discover',

    [ValidateSet('json', 'text')]
    [string]$Output = 'json',

    [string]$ProjectRoot,
    [string]$Language,
    [ValidateSet('claude', 'codex', 'gemini', 'copilot', 'round-robin')]
    [string]$Provider,
    [string[]]$EnabledProviders,
    [string[]]$RoundRobinOrder,
    [string[]]$SpecFiles,
    [string[]]$ValidationCommands,
    [string[]]$SafetyRules,
    [string]$Mode = 'plan-build-review'
)

$ErrorActionPreference = 'Stop'

function Resolve-ProjectRoot {
    param([string]$RootOverride)
    if ($RootOverride) {
        return (Resolve-Path -Path $RootOverride).Path
    }

    try {
        $gitRoot = (& git rev-parse --show-toplevel 2>$null)
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($gitRoot)) {
            return (Resolve-Path -Path $gitRoot.Trim()).Path
        }
    } catch {
    }

    return (Get-Location).Path
}

function Get-ProjectHash {
    param([string]$AbsolutePath)

    $normalized = [IO.Path]::GetFullPath($AbsolutePath).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $bytes = [Text.Encoding]::UTF8.GetBytes($normalized.ToLowerInvariant())
    $hashBytes = [Security.Cryptography.SHA256]::HashData($bytes)
    $hex = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })
    return $hex.Substring(0, 8)
}

function Normalize-List {
    param([string[]]$Items)
    $normalized = @()
    foreach ($item in $Items) {
        if ([string]::IsNullOrWhiteSpace($item)) { continue }
        foreach ($part in ($item -split ',')) {
            $trimmed = $part.Trim()
            if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
                $normalized += $trimmed
            }
        }
    }
    return $normalized
}

function Convert-ToRelativePath {
    param(
        [string]$BasePath,
        [string]$Path
    )

    try {
        $base = [IO.Path]::GetFullPath($BasePath)
        $target = [IO.Path]::GetFullPath($Path)

        $baseUri = [Uri]((if ($base.EndsWith([IO.Path]::DirectorySeparatorChar)) { $base } else { "$base$([IO.Path]::DirectorySeparatorChar)" }))
        $targetUri = [Uri]$target
        $relative = $baseUri.MakeRelativeUri($targetUri).ToString()
        return [Uri]::UnescapeDataString($relative).Replace('/', [IO.Path]::DirectorySeparatorChar)
    } catch {
        return $Path
    }
}

function Get-GlobalConfigPath {
    return (Join-Path $HOME '.ralph/config.yml')
}

function Get-DefaultModelMap {
    $path = Get-GlobalConfigPath
    $models = @{
        claude = 'opus'
        codex = 'gpt-5.3-codex'
        gemini = 'gemini-3.1-pro-preview'
        copilot = 'gpt-5.3-codex'
    }

    if (-not (Test-Path $path)) { return $models }

    $lines = Get-Content -Path $path
    $inModels = $false
    foreach ($line in $lines) {
        if ($line -match '^models:\s*$') {
            $inModels = $true
            continue
        }

        if (-not $inModels) { continue }
        if ($line -match '^\S') { break }

        if ($line -match '^\s{2}([a-z0-9_-]+):\s*([^#]+?)\s*(?:#.*)?$') {
            $key = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            if ($key -and $value) {
                $models[$key] = $value
            }
        }
    }

    return $models
}

function Get-DefaultProvider {
    $path = Get-GlobalConfigPath
    if (-not (Test-Path $path)) { return 'claude' }

    $line = Get-Content -Path $path | Where-Object { $_ -match '^default_provider:\s*' } | Select-Object -First 1
    if ($line -match '^default_provider:\s*(.+?)\s*$') {
        return $Matches[1].Trim()
    }

    return 'claude'
}

function Get-RoundRobinDefaults {
    $path = Get-GlobalConfigPath
    $defaults = @('claude', 'codex', 'gemini', 'copilot')
    if (-not (Test-Path $path)) { return $defaults }

    $lines = Get-Content -Path $path
    $inSection = $false
    $providers = @()
    foreach ($line in $lines) {
        if ($line -match '^round_robin_order:\s*$') {
            $inSection = $true
            continue
        }

        if (-not $inSection) { continue }
        if ($line -match '^\S') { break }

        if ($line -match '^\s*-\s*([a-z0-9_-]+)\s*$') {
            $providers += $Matches[1].Trim()
        }
    }

    if ($providers.Count -eq 0) { return $defaults }
    return $providers
}

function Get-InstalledProviders {
    $all = @('claude', 'codex', 'gemini', 'copilot')
    $installed = @()
    $missing = @()

    foreach ($provider in $all) {
        if (Get-Command $provider -ErrorAction SilentlyContinue) {
            $installed += $provider
        } else {
            $missing += $provider
        }
    }

    return @{
        installed = $installed
        missing = $missing
    }
}

function Detect-Language {
    param([string]$Root)

    $score = @{
        'node-typescript' = 0
        'python' = 0
        'go' = 0
        'rust' = 0
        'dotnet' = 0
    }

    $signals = @()

    $packageJson = Join-Path $Root 'package.json'
    if (Test-Path $packageJson) { $score['node-typescript'] += 4; $signals += 'package.json' }
    if (Test-Path (Join-Path $Root 'tsconfig.json')) { $score['node-typescript'] += 3; $signals += 'tsconfig.json' }
    if (Test-Path (Join-Path $Root 'pnpm-lock.yaml')) { $score['node-typescript'] += 2; $signals += 'pnpm-lock.yaml' }
    if (Test-Path (Join-Path $Root 'yarn.lock')) { $score['node-typescript'] += 2; $signals += 'yarn.lock' }

    if (Test-Path (Join-Path $Root 'pyproject.toml')) { $score['python'] += 4; $signals += 'pyproject.toml' }
    if (Test-Path (Join-Path $Root 'requirements.txt')) { $score['python'] += 3; $signals += 'requirements.txt' }
    if (Test-Path (Join-Path $Root 'setup.py')) { $score['python'] += 2; $signals += 'setup.py' }

    if (Test-Path (Join-Path $Root 'go.mod')) { $score['go'] += 5; $signals += 'go.mod' }
    if (Test-Path (Join-Path $Root 'Cargo.toml')) { $score['rust'] += 5; $signals += 'Cargo.toml' }

    $hasSln = (Get-ChildItem -Path $Root -Filter '*.sln' -File -ErrorAction SilentlyContinue | Select-Object -First 1)
    $hasCsproj = (Get-ChildItem -Path $Root -Filter '*.csproj' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($hasSln) { $score['dotnet'] += 4; $signals += '*.sln' }
    if ($hasCsproj) { $score['dotnet'] += 4; $signals += '*.csproj' }

    $best = 'other'
    $bestScore = 0
    foreach ($entry in $score.GetEnumerator()) {
        if ($entry.Value -gt $bestScore) {
            $best = $entry.Key
            $bestScore = $entry.Value
        }
    }

    return @{
        language = $best
        confidence = if ($bestScore -ge 5) { 'high' } elseif ($bestScore -ge 3) { 'medium' } else { 'low' }
        signals = $signals
    }
}

function Get-PackageJsonScripts {
    param([string]$Root)

    $path = Join-Path $Root 'package.json'
    if (-not (Test-Path $path)) { return @{} }

    try {
        $pkg = Get-Content -Raw -Path $path | ConvertFrom-Json
        $scripts = @{}
        if ($pkg.scripts) {
            foreach ($prop in $pkg.scripts.PSObject.Properties) {
                $scripts[$prop.Name] = [string]$prop.Value
            }
        }
        return $scripts
    } catch {
        return @{}
    }
}

function Build-ValidationPresets {
    param(
        [string]$Language,
        [string]$Root
    )

    switch ($Language) {
        'node-typescript' {
            $scripts = Get-PackageJsonScripts -Root $Root
            $tests = if ($scripts.ContainsKey('test')) { 'npm test' } else { 'npx vitest run' }
            $typecheck = if ($scripts.ContainsKey('typecheck')) { 'npm run typecheck' } elseif (Test-Path (Join-Path $Root 'tsconfig.json')) { 'npx tsc --noEmit' } else { $null }
            $lint = if ($scripts.ContainsKey('lint')) { 'npm run lint' } else { 'npx eslint .'
            }
            $build = if ($scripts.ContainsKey('build')) { 'npm run build' } else { $null }

            $testsAndTypesList = @($typecheck, $tests) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
            $fullList = @($typecheck, $lint, $tests, $build) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

            return @{
                tests_only = @($tests)
                tests_and_types = $testsAndTypesList
                full = $fullList
            }
        }
        'python' {
            return @{
                tests_only = @('pytest')
                tests_and_types = @('mypy .', 'pytest')
                full = @('mypy .', 'ruff check .', 'pytest')
            }
        }
        'go' {
            return @{
                tests_only = @('go test ./...')
                tests_and_types = @('go vet ./...', 'go test ./...')
                full = @('go vet ./...', 'golangci-lint run', 'go test ./...')
            }
        }
        'rust' {
            return @{
                tests_only = @('cargo test')
                tests_and_types = @('cargo clippy -- -D warnings', 'cargo test')
                full = @('cargo clippy -- -D warnings', 'cargo test', 'cargo build --release')
            }
        }
        'dotnet' {
            return @{
                tests_only = @('dotnet test')
                tests_and_types = @('dotnet build', 'dotnet test')
                full = @('dotnet build', 'dotnet test')
            }
        }
        default {
            return @{
                tests_only = @()
                tests_and_types = @()
                full = @()
            }
        }
    }
}

function Discover-SpecCandidates {
    param([string]$Root)

    $ordered = @(
        'SPEC.md',
        'README.md',
        'docs/SPEC.md',
        'docs/spec.md',
        'requirements.md',
        'PRD.md',
        'specs/' ,
        'docs/'
    )

    $found = New-Object System.Collections.Generic.List[string]
    foreach ($relative in $ordered) {
        $absolute = Join-Path $Root $relative
        if (Test-Path $absolute) {
            $normalized = $relative.Replace('\\', '/').TrimStart('./')
            if (-not $found.Contains($normalized)) {
                $found.Add($normalized)
            }
        }
    }

    $docsMd = Get-ChildItem -Path (Join-Path $Root 'docs') -Filter '*.md' -File -ErrorAction SilentlyContinue |
        Select-Object -First 8
    foreach ($file in $docsMd) {
        $rel = Convert-ToRelativePath -BasePath $Root -Path $file.FullName
        $rel = $rel.Replace('\\', '/')
        if (-not $found.Contains($rel)) {
            $found.Add($rel)
        }
    }

    return @($found)
}

function Get-ContextFiles {
    param([string]$Root)

    $items = @('TODO.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md')
    $result = @{}
    foreach ($item in $items) {
        $result[$item] = Test-Path (Join-Path $Root $item)
    }
    return $result
}

function Get-ExistingProjectConfig {
    param(
        [string]$ProjectHash
    )

    $projectDir = Join-Path $HOME (".ralph/projects/{0}" -f $ProjectHash)
    $configPath = Join-Path $projectDir 'config.yml'
    return @{
        project_dir = $projectDir
        config_path = $configPath
        exists = (Test-Path $configPath)
    }
}

function New-DiscoveryResult {
    param([string]$Root)

    $resolvedRoot = Resolve-ProjectRoot -RootOverride $Root
    $projectName = Split-Path -Path $resolvedRoot -Leaf
    $projectHash = Get-ProjectHash -AbsolutePath $resolvedRoot

    $isGitRepo = $false
    $gitBranch = $null
    try {
        & git -C $resolvedRoot rev-parse --is-inside-work-tree *> $null
        if ($LASTEXITCODE -eq 0) {
            $isGitRepo = $true
            $gitBranch = (& git -C $resolvedRoot rev-parse --abbrev-ref HEAD 2>$null).Trim()
        }
    } catch {
    }

    $languageDetection = Detect-Language -Root $resolvedRoot
    $validationPresets = Build-ValidationPresets -Language $languageDetection.language -Root $resolvedRoot
    $providers = Get-InstalledProviders
    $models = Get-DefaultModelMap
    $existing = Get-ExistingProjectConfig -ProjectHash $projectHash

    return [ordered]@{
        project = [ordered]@{
            root = $resolvedRoot
            name = $projectName
            hash = $projectHash
            is_git_repo = $isGitRepo
            git_branch = $gitBranch
        }
        setup = [ordered]@{
            project_dir = $existing.project_dir
            config_path = $existing.config_path
            config_exists = $existing.exists
            templates_dir = (Join-Path $HOME '.ralph/templates')
        }
        context = [ordered]@{
            detected_language = $languageDetection.language
            language_confidence = $languageDetection.confidence
            language_signals = $languageDetection.signals
            validation_presets = $validationPresets
            spec_candidates = [string[]](Discover-SpecCandidates -Root $resolvedRoot)
            context_files = (Get-ContextFiles -Root $resolvedRoot)
        }
        providers = [ordered]@{
            installed = $providers.installed
            missing = $providers.missing
            default_provider = (Get-DefaultProvider)
            default_models = $models
            round_robin_default = (Get-RoundRobinDefaults)
        }
        discovered_at = (Get-Date).ToString('o')
    }
}

function ConvertTo-YamlSafe {
    param([string]$Value)
    if ($null -eq $Value) { return "''" }
    $escaped = $Value.Replace("'", "''")
    return "'$escaped'"
}

function Resolve-ProviderHints {
    param([string]$SelectedProvider)

    switch ($SelectedProvider) {
        'claude' {
            return '- Claude hint: Use parallel subagents when large searches are needed; summarize before coding.'
        }
        'codex' {
            return '- Codex hint: Prefer stdin prompt mode and keep outputs concise and action-focused.'
        }
        'gemini' {
            return '- Gemini hint: Keep prompts explicit and deterministic; re-check assumptions before writing code.'
        }
        'copilot' {
            return '- Copilot hint: Keep edits surgical and validate with focused checks after changes.'
        }
        'round-robin' {
            return '- Round-robin hint: Keep context handoff explicit in TODO.md and REVIEW_LOG.md between providers.'
        }
        default {
            return ''
        }
    }
}

function Write-ProjectConfigAndPrompts {
    param(
        [hashtable]$Discovery,
        [string]$SelectedLanguage,
        [string]$SelectedProvider,
        [string[]]$SelectedEnabledProviders,
        [string[]]$SelectedRoundRobinOrder,
        [string[]]$SelectedSpecFiles,
        [string[]]$SelectedValidationCommands,
        [string[]]$SelectedSafetyRules,
        [string]$SelectedMode
    )

    $projectRoot = $Discovery.project.root
    $projectName = $Discovery.project.name
    $projectHash = $Discovery.project.hash
    $projectDir = Join-Path $HOME (".ralph/projects/{0}" -f $projectHash)
    $promptsDir = Join-Path $projectDir 'prompts'
    $configPath = Join-Path $projectDir 'config.yml'
    $templatesDir = Join-Path $HOME '.ralph/templates'

    if (-not (Test-Path $templatesDir)) {
        throw "Templates directory not found: $templatesDir"
    }

    New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
    New-Item -ItemType Directory -Path $promptsDir -Force | Out-Null

    $models = $Discovery.providers.default_models

    $enabled = Normalize-List -Items $SelectedEnabledProviders
    if ($enabled.Count -eq 0) {
        if ($Discovery.providers.installed.Count -gt 0) {
            $enabled = @($Discovery.providers.installed)
        } else {
            $enabled = @('claude')
        }
    }

    $roundRobin = Normalize-List -Items $SelectedRoundRobinOrder
    if ($SelectedProvider -eq 'round-robin' -and $roundRobin.Count -eq 0) {
        $roundRobin = @($enabled)
    }
    if ($roundRobin.Count -eq 0) {
        $roundRobin = @($enabled)
    }

    $specFiles = Normalize-List -Items $SelectedSpecFiles
    if ($specFiles.Count -eq 0) {
        $specFiles = @($Discovery.context.spec_candidates | Select-Object -First 1)
    }

    $validation = Normalize-List -Items $SelectedValidationCommands
    if ($validation.Count -eq 0) {
        $validation = @($Discovery.context.validation_presets.full)
    }

    $safety = Normalize-List -Items $SelectedSafetyRules
    if ($safety.Count -eq 0) {
        $safety = @(
            'Never delete the project directory or run destructive commands',
            'Never push to remote without explicit user approval'
        )
    }

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("project_name: $(ConvertTo-YamlSafe $projectName)")
    $lines.Add("project_root: $(ConvertTo-YamlSafe $projectRoot)")
    $lines.Add("language: $(ConvertTo-YamlSafe $SelectedLanguage)")
    $lines.Add("provider: $(ConvertTo-YamlSafe $SelectedProvider)")
    $lines.Add("mode: $(ConvertTo-YamlSafe $SelectedMode)")
    $lines.Add('spec_files:')
    foreach ($spec in $specFiles) {
        $lines.Add("  - $(ConvertTo-YamlSafe $spec)")
    }
    $lines.Add('validation_commands: |')
    foreach ($cmd in $validation) {
        $lines.Add("  $cmd")
    }
    $lines.Add('safety_rules: |')
    foreach ($rule in $safety) {
        $lines.Add("  - $rule")
    }

    $lines.Add('')
    $lines.Add('enabled_providers:')
    foreach ($providerName in $enabled) {
        $lines.Add("  - $(ConvertTo-YamlSafe $providerName)")
    }

    $lines.Add('')
    $lines.Add('models:')
    foreach ($providerName in @('claude', 'codex', 'gemini', 'copilot')) {
        $modelValue = if ($models.ContainsKey($providerName)) { [string]$models[$providerName] } else { '' }
        $lines.Add("  ${providerName}: $(ConvertTo-YamlSafe $modelValue)")
    }

    $lines.Add('')
    $lines.Add('round_robin_order:')
    foreach ($providerName in $roundRobin) {
        $lines.Add("  - $(ConvertTo-YamlSafe $providerName)")
    }

    $lines.Add('')
    $lines.Add("created_at: $(ConvertTo-YamlSafe ((Get-Date).ToString('o')))")

    Set-Content -Path $configPath -Encoding utf8 -Value $lines

    $specInline = ($specFiles -join ', ')
    $validationBlock = ($validation | ForEach-Object { "- $_" }) -join [Environment]::NewLine
    $safetyBlock = ($safety | ForEach-Object { "- $_" }) -join [Environment]::NewLine
    $providerHints = Resolve-ProviderHints -SelectedProvider $SelectedProvider

    foreach ($name in @('plan', 'build', 'review')) {
        $templatePath = Join-Path $templatesDir ("PROMPT_{0}.md" -f $name)
        $destinationPath = Join-Path $promptsDir ("PROMPT_{0}.md" -f $name)
        if (-not (Test-Path $templatePath)) {
            throw "Template not found: $templatePath"
        }

        $content = Get-Content -Raw -Path $templatePath
        $content = $content.Replace('{{SPEC_FILES}}', $specInline)
        $content = $content.Replace('{{REFERENCE_FILES}}', '')
        $content = $content.Replace('{{VALIDATION_COMMANDS}}', $validationBlock)
        $content = $content.Replace('{{SAFETY_RULES}}', $safetyBlock)
        $content = $content.Replace('{{PROVIDER_HINTS}}', $providerHints)

        Set-Content -Path $destinationPath -Encoding utf8 -Value $content
    }

    return [ordered]@{
        config_path = $configPath
        prompts_dir = $promptsDir
        project_dir = $projectDir
        project_hash = $projectHash
    }
}

$discovery = New-DiscoveryResult -Root $ProjectRoot

if ($Command -eq 'discover') {
    if ($Output -eq 'json') {
        $discovery | ConvertTo-Json -Depth 8
    } else {
        Write-Host "Project: $($discovery.project.name) [$($discovery.project.hash)]"
        Write-Host "Root: $($discovery.project.root)"
        Write-Host "Detected language: $($discovery.context.detected_language) ($($discovery.context.language_confidence))"
        Write-Host "Providers installed: $($discovery.providers.installed -join ', ')"
        Write-Host "Spec candidates: $($discovery.context.spec_candidates -join ', ')"
    }
    exit 0
}

$resolvedLanguage = if ($Language) { $Language } else { $discovery.context.detected_language }
$resolvedProvider = if ($Provider) { $Provider } else { $discovery.providers.default_provider }

$scaffold = Write-ProjectConfigAndPrompts `
    -Discovery $discovery `
    -SelectedLanguage $resolvedLanguage `
    -SelectedProvider $resolvedProvider `
    -SelectedEnabledProviders $EnabledProviders `
    -SelectedRoundRobinOrder $RoundRobinOrder `
    -SelectedSpecFiles $SpecFiles `
    -SelectedValidationCommands $ValidationCommands `
    -SelectedSafetyRules $SafetyRules `
    -SelectedMode $Mode

if ($Output -eq 'json') {
    $scaffold | ConvertTo-Json -Depth 6
} else {
    Write-Host "Wrote config: $($scaffold.config_path)"
    Write-Host "Wrote prompts: $($scaffold.prompts_dir)"
}
