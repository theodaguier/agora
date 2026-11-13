import type { ComponentType, ReactNode, SVGProps } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import Claude from "@lobehub/icons-static-svg/icons/claude-color.svg?react";
import ClaudeCode from "@lobehub/icons-static-svg/icons/claudecode-color.svg?react";
import Codex from "@lobehub/icons-static-svg/icons/codex-color.svg?react";
import FigmaColor from "@lobehub/icons-static-svg/icons/figma-color.svg?react";
import GitHub from "@lobehub/icons-static-svg/icons/github.svg?react";
import GoogleColor from "@lobehub/icons-static-svg/icons/google-color.svg?react";
import Notion from "@lobehub/icons-static-svg/icons/notion.svg?react";
import MicrosoftColor from "@lobehub/icons-static-svg/icons/microsoft-color.svg?react";
import Vercel from "@lobehub/icons-static-svg/icons/vercel.svg?react";
import Amp from "@lobehub/icons-static-svg/icons/amp-color.svg?react";
import Cursor from "@lobehub/icons-static-svg/icons/cursor.svg?react";
import Goose from "@lobehub/icons-static-svg/icons/goose.svg?react";
import Kiro from "@lobehub/icons-static-svg/icons/kiro-color.svg?react";
import OpenCode from "@lobehub/icons-static-svg/icons/opencode.svg?react";
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
  claude: ClaudeCode,
  codex: Codex,
  cursor: Cursor,
  opencode: OpenCode,
  amp: Amp,
  goose: Goose,
  kiro: Kiro,
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

/** Code sessions as a whole, whoever codes them: Claude Code's and Codex's logos, the second over the first's edge. */
export function CodeEnginesLogo({ className }: { className?: string }) {
  return (
    // The pair as wide as one icon (16 px), so the label lines up with the others.
    <span aria-hidden className={cn("flex w-4 shrink-0 items-center *:not-first:-ml-2", className)}>
      <ModelLogo provider="claude" className="size-3!" />
      <ModelLogo provider="codex" className="size-3! rounded-full ring-1 ring-sidebar" />
    </span>
  );
}

/**
 * Integrations as an app folder (iOS): four of the most connected (Google, GitHub, Figma, Notion) in a
 * 16 px tile, so it takes an icon's place and the label stays in line. Shown when the instance has no
 * logo.dev key to show its own connectors' logos.
 */
export function KnownIntegrationsLogo({ className }: { className?: string }) {
  return <IntegrationsFolder className={className} logos={[GoogleColor, GitHub, FigmaColor, Notion]} />;
}

/** Up to four logos in a 16 px tile, two by two. */
export function IntegrationsFolder({ logos, className }: { logos: (Logo | ReactNode)[]; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-4 shrink-0 grid-cols-2 place-items-center gap-px rounded-sm bg-accent p-px", className)}>
      {logos.slice(0, 4).map((L, i) => {
        if (typeof L === "function") {
          const Icon = L as Logo;
          return <Icon key={i} className="size-1.5! text-foreground" />;
        }
        return <span key={i} className="flex size-1.5 *:size-1.5!">{L as ReactNode}</span>;
      })}
    </span>
  );
}

/** Where a bot's data comes from (« GitHub », « Gmail », « google-drive »): the bundled logo, and the brand's site for logo.dev. */
const SOURCES: [RegExp, { logo?: Logo; mono?: boolean; domain: string }][] = [
  [/github/i, { logo: GitHub, mono: true, domain: "github.com" }],
  [/gmail|google|gcal|agenda|drive|sheets|docs/i, { logo: GoogleColor, domain: "google.com" }],
  [/figma/i, { logo: FigmaColor, domain: "figma.com" }],
  [/notion/i, { logo: Notion, mono: true, domain: "notion.so" }],
  [/outlook|microsoft|teams|onedrive/i, { logo: MicrosoftColor, domain: "microsoft.com" }],
  [/vercel/i, { logo: Vercel, mono: true, domain: "vercel.com" }],
  [/slack/i, { domain: "slack.com" }],
  [/linear/i, { domain: "linear.app" }],
  [/stripe/i, { domain: "stripe.com" }],
  [/hubspot/i, { domain: "hubspot.com" }],
  [/posthog/i, { domain: "posthog.com" }],
  [/grafana/i, { domain: "grafana.com" }],
  [/postgres/i, { domain: "postgresql.org" }],
];

/**
 * The logo of the integration a bot called (its block's source): bundled when we ship it, else the
 * brand's through logo.dev, else `fallback` (the kind of data's icon).
 */
export function SourceLogo({ source, fallback, className }: { source?: string | null; fallback: ReactNode; className?: string }) {
  const known = source ? SOURCES.find(([re]) => re.test(source))?.[1] : undefined;
  if (known?.logo) {
    const L = known.logo;
    return <L aria-hidden className={cn("size-4 shrink-0", known.mono && "text-foreground", className)} />;
  }
  return <BrandLogo domain={known?.domain} server={source} fallback={fallback} className={cn("size-4 shrink-0 rounded-sm", className)} />;
}
