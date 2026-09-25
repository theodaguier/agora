import type { ComponentType, SVGProps } from "react";
import Claude from "@lobehub/icons-static-svg/icons/claude-color.svg?react";
import ClaudeCode from "@lobehub/icons-static-svg/icons/claudecode-color.svg?react";
import Codex from "@lobehub/icons-static-svg/icons/codex-color.svg?react";
import DeepSeek from "@lobehub/icons-static-svg/icons/deepseek-color.svg?react";
import Gemini from "@lobehub/icons-static-svg/icons/gemini-color.svg?react";
import GithubCopilot from "@lobehub/icons-static-svg/icons/githubcopilot.svg?react";
import Grok from "@lobehub/icons-static-svg/icons/grok.svg?react";
import HuggingFace from "@lobehub/icons-static-svg/icons/huggingface-color.svg?react";
import Kimi from "@lobehub/icons-static-svg/icons/kimi-color.svg?react";
import Meta from "@lobehub/icons-static-svg/icons/meta-color.svg?react";
import Minimax from "@lobehub/icons-static-svg/icons/minimax-color.svg?react";
import Mistral from "@lobehub/icons-static-svg/icons/mistral-color.svg?react";
import Nous from "@lobehub/icons-static-svg/icons/nousresearch.svg?react";
import Ollama from "@lobehub/icons-static-svg/icons/ollama.svg?react";
import OpenAI from "@lobehub/icons-static-svg/icons/openai.svg?react";
import OpenRouter from "@lobehub/icons-static-svg/icons/openrouter.svg?react";
import Qwen from "@lobehub/icons-static-svg/icons/qwen-color.svg?react";
import XAI from "@lobehub/icons-static-svg/icons/xai.svg?react";
import Zai from "@lobehub/icons-static-svg/icons/zai.svg?react";
import Zhipu from "@lobehub/icons-static-svg/icons/zhipu-color.svg?react";
import { SparklesIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type Logo = ComponentType<SVGProps<SVGSVGElement>>;

/** Official logos (LobeHub, MIT) by Hermes provider slug. */
const providers: Record<string, Logo> = {
  "claude-code": ClaudeCode,
  codex: Codex,
  anthropic: Claude,
  openai: OpenAI,
  "openai-codex": OpenAI,
  gemini: Gemini,
  google: Gemini,
  deepseek: DeepSeek,
  kimi: Kimi,
  "kimi-coding": Kimi,
  moonshot: Kimi,
  minimax: Minimax,
  openrouter: OpenRouter,
  mistral: Mistral,
  xai: XAI,
  grok: Grok,
  qwen: Qwen,
  alibaba: Qwen,
  nous: Nous,
  copilot: GithubCopilot,
  zai: Zai,
  zhipu: Zhipu,
  huggingface: HuggingFace,
  ollama: Ollama,
};

/** A model's vendor from its identifier ("anthropic/claude-…" via OpenRouter, "gpt-5", "sonnet"…). */
const vendors: [RegExp, Logo][] = [
  [/^anthropic\/|claude|opus|sonnet|haiku|fable/i, Claude],
  [/^openai\/|^gpt|^o\d|codex/i, OpenAI],
  [/^google\/|gemini|gemma/i, Gemini],
  [/deepseek/i, DeepSeek],
  [/^moonshot|kimi/i, Kimi],
  [/minimax/i, Minimax],
  [/mistral|codestral|devstral/i, Mistral],
  [/^x-?ai\/|grok/i, XAI],
  [/qwen/i, Qwen],
  [/^meta|llama/i, Meta],
  [/hermes|^nous/i, Nous],
  [/^z-?ai\/|glm/i, Zai],
];

function providerLogo(provider: string): Logo | undefined {
  return providers[provider.toLowerCase()];
}

/** The model vendor's logo, else the provider's, else a neutral icon. */
export function ModelLogo({ model, provider, className }: { model?: string; provider: string; className?: string }) {
  const Logo = (model && vendors.find(([re]) => re.test(model))?.[1]) || providerLogo(provider) || SparklesIcon;
  return <Logo aria-hidden className={cn("size-4 shrink-0", className)} />;
}
