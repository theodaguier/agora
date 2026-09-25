/** Display name of known Hermes providers; the raw slug otherwise. */
const names: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  anthropic: "Anthropic",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex",
  gemini: "Google Gemini",
  google: "Google",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  "kimi-coding": "Kimi",
  moonshot: "Moonshot",
  minimax: "MiniMax",
  openrouter: "OpenRouter",
  mistral: "Mistral",
  xai: "xAI",
  qwen: "Qwen",
  nous: "Nous Research",
  copilot: "GitHub Copilot",
  zai: "Z.ai",
  zhipu: "Zhipu",
  huggingface: "Hugging Face",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  "opencode-free": "OpenCode Free",
};

export const providerName = (provider: string) => names[provider.toLowerCase()] ?? provider;

