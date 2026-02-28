import React, { useState, useEffect, useCallback } from 'react';
import { X, Eye, EyeOff, CheckCircle, XCircle, Loader2, Save } from 'lucide-react';
import { Button } from '../ui';
import { useSettingsStore } from '../../store/settingsStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ApiKeyStatus = 'idle' | 'validating' | 'valid' | 'invalid';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, loadSettings, updateSettings } = useSettingsStore();

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>('idle');
  const [apiKeyError, setApiKeyError] = useState('');
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [hasStoredKey, setHasStoredKey] = useState(false);

  // Local copies of editable settings
  const [temperature, setTemperature] = useState(settings.aiTemperature);
  const [maxTokens, setMaxTokens] = useState(settings.aiMaxTokens);
  const [model, setModel] = useState(settings.aiModel);
  const [provider, setProvider] = useState<'openai' | 'moonshot' | 'anthropic'>(settings.aiProvider ?? 'openai');
  const [defaultMode, setDefaultMode] = useState(settings.defaultMode);
  const [confirmDangerous, setConfirmDangerous] = useState(settings.confirmDangerousCommands);
  const [executionOutputMode, setExecutionOutputMode] = useState<'batch' | 'real-terminal'>(settings.executionOutputMode ?? 'batch');
  const [idleWarningSeconds, setIdleWarningSeconds] = useState(settings.idleWarningSeconds ?? 15);
  const [idleStalledSeconds, setIdleStalledSeconds] = useState(settings.idleStalledSeconds ?? 45);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Load current API key status on open
  useEffect(() => {
    if (!isOpen) return;
    loadSettings();
    setApiKeyInput('');
    setApiKeyStatus('idle');
    setApiKeyError('');
    window.electronAPI.settings.getApiKey().then((result: any) => {
      setHasStoredKey(result.hasKey);
      setMaskedKey(result.maskedKey);
    });
  }, [isOpen, loadSettings]);

  // Sync local state when settings load
  useEffect(() => {
    setTemperature(settings.aiTemperature);
    setMaxTokens(settings.aiMaxTokens);
    setModel(settings.aiModel);
    setProvider(settings.aiProvider ?? 'moonshot');
    setDefaultMode(settings.defaultMode);
    setConfirmDangerous(settings.confirmDangerousCommands);
    setExecutionOutputMode(settings.executionOutputMode ?? 'batch');
    setIdleWarningSeconds(settings.idleWarningSeconds ?? 15);
    setIdleStalledSeconds(settings.idleStalledSeconds ?? 45);
  }, [settings]);

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return;
    setApiKeyStatus('validating');
    setApiKeyError('');

    // Persist the selected provider first so the main process validates with the right provider
    await window.electronAPI.settings.update({ aiProvider: provider });

    const result = await window.electronAPI.settings.setApiKey(apiKeyInput.trim()) as any;
    if (result.success) {
      setApiKeyStatus('valid');
      setHasStoredKey(true);
      setApiKeyInput('');
      // Refresh masked key
      const keyInfo = await window.electronAPI.settings.getApiKey() as any;
      setMaskedKey(keyInfo.maskedKey);
    } else {
      setApiKeyStatus('invalid');
      setApiKeyError(result.error ?? 'Validation failed');
    }
  }, [apiKeyInput, provider]);

  const handleSaveSettings = useCallback(async () => {
    // If the user typed a new API key but didn't click the key Save button,
    // save the key as part of the overall save action.
    if (apiKeyInput.trim()) {
      await handleSaveApiKey();
    }

    await updateSettings({
      aiProvider: provider,
      aiTemperature: temperature,
      aiMaxTokens: maxTokens,
      aiModel: model,
      defaultMode,
      confirmDangerousCommands: confirmDangerous,
      executionOutputMode,
      idleWarningSeconds,
      idleStalledSeconds,
    });
    setSettingsSaved(true);
    setTimeout(() => {
      setSettingsSaved(false);
      onClose();
    }, 1000);
  }, [updateSettings, apiKeyInput, handleSaveApiKey, temperature, maxTokens, model, defaultMode, confirmDangerous, executionOutputMode, idleWarningSeconds, idleStalledSeconds, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-vscode-border rounded-lg w-full max-w-lg mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-vscode-border">
          <h2 className="text-base font-semibold text-vscode-text">Settings</h2>
          <button
            onClick={onClose}
            className="text-vscode-text-secondary hover:text-vscode-text p-1 rounded hover:bg-[#3e3e3e] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* ── AI Provider ───────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-vscode-text-secondary uppercase tracking-wider mb-3">
              AI Provider
            </h3>

            <div className="space-y-3">
              {/* Provider selector */}
              <div>
                <label className="block text-xs text-vscode-text-secondary mb-1.5">Provider</label>
                <select
                  value={provider}
                  onChange={e => {
                    const p = e.target.value as 'openai' | 'moonshot' | 'anthropic';
                    setProvider(p);
                    // Reset model to a sensible default for the selected provider
                    if (p === 'openai') setModel('gpt-4o');
                    else if (p === 'anthropic') setModel('claude-opus-4-5');
                    else setModel('kimi-k2.5');
                  }}
                  className="w-full bg-[#3c3c3c] text-vscode-text text-sm rounded px-3 py-2 outline-none border border-transparent focus:border-vscode-accent"
                >
                  <option value="openai">OpenAI</option>
                  <option value="moonshot">Moonshot (Kimi)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                </select>
              </div>

              {/* Current key status */}
              {hasStoredKey && !apiKeyInput && (
                <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded px-3 py-2">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span>API key configured: <code className="font-mono text-xs">{maskedKey}</code></span>
                </div>
              )}

              {/* API key input */}
              <div>
                <label className="block text-xs text-vscode-text-secondary mb-1.5">
                  {provider === 'openai' ? 'OpenAI API Key' : provider === 'anthropic' ? 'Anthropic API Key' : 'Moonshot API Key'}{hasStoredKey && <span className="text-yellow-400"> (enter new key to replace)</span>}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={e => { setApiKeyInput(e.target.value); setApiKeyStatus('idle'); }}
                      placeholder={provider === 'openai' ? 'sk-...' : 'sk-...'}
                      className="w-full bg-[#3c3c3c] text-vscode-text text-sm rounded px-3 py-2 pr-9 outline-none border border-transparent focus:border-vscode-accent placeholder-vscode-text-secondary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vscode-text-secondary hover:text-vscode-text"
                    >
                      {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveApiKey}
                    disabled={!apiKeyInput.trim() || apiKeyStatus === 'validating'}
                  >
                    {apiKeyStatus === 'validating' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : apiKeyStatus === 'valid' ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                {apiKeyStatus === 'invalid' && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-400">
                    <XCircle className="h-3.5 w-3.5" />
                    <span>{apiKeyError}</span>
                  </div>
                )}
                {apiKeyStatus === 'valid' && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-green-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>API key saved and validated</span>
                  </div>
                )}
                <p className="mt-1 text-[11px] text-vscode-text-secondary">
                  Get your key at{' '}
                  {provider === 'openai' ? (
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-vscode-accent hover:underline">
                      platform.openai.com
                    </a>
                  ) : provider === 'anthropic' ? (
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-vscode-accent hover:underline">
                      console.anthropic.com
                    </a>
                  ) : (
                    <a href="https://platform.moonshot.ai/" target="_blank" rel="noreferrer" className="text-vscode-accent hover:underline">
                      platform.moonshot.ai
                    </a>
                  )}
                </p>
              </div>

              {/* Model selection */}
              <div>
                <label className="block text-xs text-vscode-text-secondary mb-1.5">Model</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full bg-[#3c3c3c] text-vscode-text text-sm rounded px-3 py-2 outline-none border border-transparent focus:border-vscode-accent"
                >
                  {provider === 'openai' ? (
                    <>
                      <optgroup label="GPT-5">
                        <option value="gpt-5">gpt-5 — Flagship model</option>
                        <option value="gpt-5-mini">gpt-5-mini — Fast &amp; affordable</option>
                      </optgroup>
                      <optgroup label="GPT-4o">
                        <option value="gpt-4o">gpt-4o — Latest multimodal (recommended)</option>
                        <option value="gpt-4o-mini">gpt-4o-mini — Fast &amp; affordable</option>
                      </optgroup>
                      <optgroup label="GPT-4.1">
                        <option value="gpt-4.1">gpt-4.1 — Flagship model</option>
                        <option value="gpt-4.1-mini">gpt-4.1-mini — Cost-efficient</option>
                        <option value="gpt-4.1-nano">gpt-4.1-nano — Fastest &amp; cheapest</option>
                      </optgroup>
                      <optgroup label="o-series (Reasoning)">
                        <option value="o3">o3 — Advanced reasoning</option>
                        <option value="o4-mini">o4-mini — Fast reasoning</option>
                      </optgroup>
                    </>
                  ) : provider === 'anthropic' ? (
                    <>
                      <optgroup label="Claude 4 (Latest)">
                        <option value="claude-opus-4-5">claude-opus-4-5 — Most capable (recommended)</option>
                        <option value="claude-sonnet-4-5">claude-sonnet-4-5 — Balanced speed &amp; intelligence</option>
                      </optgroup>
                      <optgroup label="Claude 3.5">
                        <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet — High intelligence</option>
                        <option value="claude-3-5-haiku-20241022">claude-3-5-haiku — Fast &amp; affordable</option>
                      </optgroup>
                      <optgroup label="Claude 3">
                        <option value="claude-3-opus-20240229">claude-3-opus — Powerful, complex tasks</option>
                        <option value="claude-3-haiku-20240307">claude-3-haiku — Fastest &amp; most compact</option>
                      </optgroup>
                    </>
                  ) : (
                    <>
                      <optgroup label="Kimi K2.5 (Latest)">
                        <option value="kimi-k2.5">kimi-k2.5 — Multimodal, reasoning (recommended)</option>
                      </optgroup>
                      <optgroup label="Kimi K2">
                        <option value="kimi-k2-turbo-preview">kimi-k2-turbo-preview — Fast &amp; capable</option>
                        <option value="kimi-k2-thinking-turbo">kimi-k2-thinking-turbo — Extended reasoning</option>
                      </optgroup>
                      <optgroup label="Moonshot V1 (Legacy)">
                        <option value="moonshot-v1-8k">moonshot-v1-8k — Fast, 8K context</option>
                        <option value="moonshot-v1-32k">moonshot-v1-32k — Balanced, 32K context</option>
                        <option value="moonshot-v1-128k">moonshot-v1-128k — Max context, 128K</option>
                        <option value="moonshot-v1-auto">moonshot-v1-auto — Auto context length</option>
                      </optgroup>
                    </>
                  )}
                </select>
              </div>

              {/* Temperature */}
              <div>
                <label className="block text-xs text-vscode-text-secondary mb-1.5">
                  Temperature: <span className="text-vscode-text font-mono">{temperature}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-vscode-accent"
                />
                <div className="flex justify-between text-[11px] text-vscode-text-secondary mt-0.5">
                  <span>Precise (0)</span>
                  <span>Creative (1)</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Behaviour ─────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-vscode-text-secondary uppercase tracking-wider mb-3">
              Behaviour
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-vscode-text-secondary mb-1.5">Default Mode</label>
                <div className="flex gap-2">
                  {(['manual', 'agent'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setDefaultMode(m)}
                      className={`flex-1 py-2 rounded text-sm border transition-colors ${
                        defaultMode === m
                          ? 'bg-vscode-accent border-vscode-accent text-white'
                          : 'bg-[#3c3c3c] border-vscode-border text-vscode-text hover:border-vscode-accent'
                      }`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmDangerous}
                  onChange={e => setConfirmDangerous(e.target.checked)}
                  className="w-4 h-4 accent-vscode-accent"
                />
                <div>
                  <span className="text-sm text-vscode-text">Confirm dangerous commands</span>
                  <p className="text-xs text-vscode-text-secondary">
                    Require approval before executing commands marked as dangerous
                  </p>
                </div>
              </label>

              {/* ── Execution Output Mode ──────────────────────────── */}
              <div>
                <label className="block text-xs text-vscode-text-secondary mb-1.5">Command Output Mode</label>
                <select
                  value={executionOutputMode}
                  onChange={e => setExecutionOutputMode(e.target.value as 'batch' | 'real-terminal')}
                  className="w-full bg-[#3c3c3c] text-vscode-text text-sm rounded px-3 py-2 outline-none border border-transparent focus:border-vscode-accent"
                >
                  <option value="batch">Standard (Separate Channel)</option>
                  <option value="real-terminal">Real Terminal (Live Session)</option>
                </select>
                <p className="mt-1.5 text-[11px] text-vscode-text-secondary leading-relaxed">
                  {executionOutputMode === 'batch'
                    ? 'Commands run in a background SSH channel. Output appears after each command completes. stderr is separate from stdout.'
                    : 'Commands run directly in your terminal session. Output appears in real time with full colour and formatting. stderr is merged with stdout.'}
                </p>
              </div>

              {/* ── Idle Timer Thresholds (Sprint 8) ─────────────── */}
              <div>
                <label className="block text-xs text-vscode-text-secondary mb-1.5">
                  Soft Stall Warning (seconds)
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={idleWarningSeconds}
                  onChange={(e) =>
                    setIdleWarningSeconds(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  className="w-full bg-[#3c3c3c] text-vscode-text text-sm rounded px-3 py-2 outline-none border border-transparent focus:border-vscode-accent"
                />
                <p className="mt-1.5 text-[11px] text-vscode-text-secondary leading-relaxed">
                  Show a warning when a command produces no output for this many seconds.
                  Set to 0 to disable. Default: 15
                </p>
              </div>

              <div>
                <label className="block text-xs text-vscode-text-secondary mb-1.5">
                  Hard Stall Threshold (seconds)
                </label>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={idleStalledSeconds}
                  onChange={(e) => {
                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                    if (val > 0 && idleWarningSeconds > 0 && val <= idleWarningSeconds) {
                      setIdleStalledSeconds(idleWarningSeconds + 5);
                    } else {
                      setIdleStalledSeconds(val);
                    }
                  }}
                  className="w-full bg-[#3c3c3c] text-vscode-text text-sm rounded px-3 py-2 outline-none border border-transparent focus:border-vscode-accent"
                />
                <p className="mt-1.5 text-[11px] text-vscode-text-secondary leading-relaxed">
                  Trigger AI stall analysis when no output is received for this many seconds.
                  Must be greater than the soft stall warning. Set to 0 to disable. Default: 45
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-vscode-border">
          <span className={`text-xs transition-opacity ${settingsSaved ? 'text-green-400 opacity-100' : 'opacity-0'}`}>
            ✓ Settings saved
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="default" size="sm" onClick={handleSaveSettings}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
