import {
  createConfigStore,
  loadDaemonConfig,
  loadOverridesConfig,
  type ConfigStore,
  type DaemonPaths,
} from "@aloop/daemon-config";

export function loadInitialConfig(paths: DaemonPaths): ConfigStore {
  const daemonResult = loadDaemonConfig(paths.daemonConfigFile);
  if (!daemonResult.ok) {
    throw new Error(
      `daemon.yml invalid (${paths.daemonConfigFile}):\n  ${daemonResult.errors.join("\n  ")}`,
    );
  }
  const overridesResult = loadOverridesConfig(paths.overridesFile);
  if (!overridesResult.ok) {
    throw new Error(
      `overrides.yml invalid (${paths.overridesFile}):\n  ${overridesResult.errors.join("\n  ")}`,
    );
  }
  return createConfigStore({
    daemon: daemonResult.value,
    overrides: overridesResult.value,
    paths,
  });
}
