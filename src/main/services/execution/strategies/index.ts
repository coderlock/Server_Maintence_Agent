/**
 * Barrel exports for the execution strategies module.
 * Sprint 9 additions: PromptStreamParser, sessionSetup, promptUtils
 */

export { ExecutionEmitter } from './ExecutionEmitter';
export { BatchStrategy } from './BatchStrategy';
export { RealTerminalStrategy } from './RealTerminalStrategy';
export { MarkerStreamParser } from './MarkerStreamParser';           // RETAINED — marker fallback path
export { PromptStreamParser } from './PromptStreamParser';           // Sprint 9 — invisible OSC detection
export { stripAnsi } from './ansiStripper';
export { generateMarkerId, wrapCommandWithMarkers } from './markerUtils'; // RETAINED — marker fallback path
export {                                                              // Sprint 9
  extractOSCExitCode,
  stripOSCSequences,
  stripCommandEcho,
  stripTrailingPrompt,
} from './promptUtils';
export {                                                              // Sprint 9
  initializeSession,
  detectShellType,
  detectActualHostname,
  buildPromptRegex,
  buildFallbackPromptRegex,
  buildBashSetupCommand,
  buildZshSetupCommand,
  injectSessionSetup,
} from './sessionSetup';
export type { ExecutionHandle } from './ExecutionStrategy';
export type { ExecutionStrategy } from './ExecutionStrategy';
export type { MarkerFeedResult } from './MarkerStreamParser';
export type { SSHExecutorFn } from './BatchStrategy';
export type { PromptStreamParserConfig, PromptFeedResult } from './PromptStreamParser'; // Sprint 9
export type { ShellSessionInfo } from './sessionSetup';              // Sprint 9
