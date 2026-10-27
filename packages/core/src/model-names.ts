/** Brands whose spelling isn't a plain capital: the rest of a word just gets its first letter up. */
const BRANDS: Record<string, string> = {
  gpt: "GPT",
  glm: "GLM",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  llama: "Llama",
  gemini: "Gemini",
  gemma: "Gemma",
  claude: "Claude",
  mistral: "Mistral",
  codestral: "Codestral",
  grok: "Grok",
  kimi: "Kimi",
  minimax: "MiniMax",
  phi: "Phi",
  oss: "OSS",
};

/**
 * A model as people read it, from the id a provider gives it: `claude-sonnet-4-5` → "Claude Sonnet 4.5",
 * `glm-5.3` → "GLM 5.3", `gpt-5-codex` → "GPT-5 Codex", `anthropic/claude-opus-4-1-20250805` → "Claude Opus 4.1".
 * Only for ids without a label of their own: a label from the provider always wins.
 */
export function modelName(id: string): string {
  const bare = id.split("/").pop() ?? id;
  const words = bare
    .split(/[-_:\s]+/)
    .filter(Boolean)
    // A brand glued to its version (llama3.1, qwen2.5) reads apart.
    .flatMap((w) => {
      const m = /^([a-z]+)(\d[\d.]*)$/i.exec(w);
      return m && BRANDS[m[1]!.toLowerCase()] ? [m[1]!, m[2]!] : [w];
    })
    // A release date says nothing to a reader.
    .filter((w) => !/^\d{6,8}$/.test(w));
  const out: string[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    // Version parts in a row read as one number: 4 5 → 4.5.
    if (/^\d+$/.test(w) && prev && /^\d+(\.\d+)*$/.test(prev)) {
      out[out.length - 1] = `${prev}.${w}`;
      continue;
    }
    // GPT keeps its version glued, as OpenAI writes it: GPT-5, GPT-4.1.
    if (/^\d/.test(w) && prev === "GPT") {
      out[out.length - 1] = `GPT-${w}`;
      continue;
    }
    const lower = w.toLowerCase();
    // A size (7b, 120b) in capitals; a lone letter-and-number name (o3, k2) stays lower only as the first word.
    if (/^\d+(\.\d+)?b$/i.test(w)) out.push(w.toUpperCase());
    else if (/^[a-z]\d/i.test(w)) out.push(out.length ? w.toUpperCase() : lower);
    else out.push(BRANDS[lower] ?? w.charAt(0).toUpperCase() + w.slice(1));
  }
  return out.join(" ").replace(/^GPT-(\d[\d.]*) (\d[\d.]*)$/, "GPT-$1.$2") || id;
}

/** Brands whose spelling a capital first letter doesn't give. */
const CONNECTOR_BRANDS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  hubspot: "HubSpot",
  linkedin: "LinkedIn",
  posthog: "PostHog",
  youtube: "YouTube",
  openai: "OpenAI",
  paypal: "PayPal",
  alltrails: "AllTrails",
  clickup: "ClickUp",
  mongodb: "MongoDB",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  sqlite: "SQLite",
  monday: "monday.com",
  sendgrid: "SendGrid",
  mailchimp: "Mailchimp",
  wordpress: "WordPress",
  bigquery: "BigQuery",
  dynamodb: "DynamoDB",
  elevenlabs: "ElevenLabs",
  pagerduty: "PagerDuty",
  servicenow: "ServiceNow",
  docusign: "DocuSign",
  quickbooks: "QuickBooks",
  stackoverflow: "Stack Overflow",
  npm: "npm",
  aws: "AWS",
  gcp: "GCP",
  mcp: "MCP",
  api: "API",
};

/**
 * A connector as people read it, from the slug a registry gives it: `github` → "GitHub",
 * `google-drive` → "Google Drive". Only for connectors: skills keep their identifier.
 */
export function connectorName(slug: string): string {
  const known = CONNECTOR_BRANDS[slug.toLowerCase()];
  if (known) return known;
  if (/[A-Z]/.test(slug) || /\s/.test(slug)) return slug;
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => CONNECTOR_BRANDS[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * A tool call as people read it: an MCP tool by its connector, then what it does
 * ("mcp__figma__use_figma" → "Figma", "use figma"), a built-in one by its label when there is one.
 */
export function toolLabel(tool: string, names: Record<string, string>): { name: string; action: string | null } {
  if (names[tool]) return { name: names[tool]!, action: null };
  const m = /^mcp__(.+?)__(.+)$/.exec(tool);
  if (m) return { name: connectorName(m[1]!), action: m[2]!.replace(/_+/g, " ") };
  return { name: names[tool] ?? tool, action: null };
}
