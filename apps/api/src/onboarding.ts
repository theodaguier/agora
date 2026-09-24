/**
 * Grok Bot-style bot creation: the agent is born as "Nouveau Bot" and sets
 * itself up through conversation. It asks its questions as choice cards
 * (```choices``` block) and ends with a ```bot-profile``` block that gives it
 * its name and its SOUL.md.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { profileHome } from "./hermes";
import type { AvatarShape } from "./db/schema";
import { mcpRequestSchema, type McpRequestBlock } from "./mcp-requests";
import { questionsSchema, type Questions } from "./questions";
import { parseSkillCreate, skillRequestSchema, type SkillCreateBlock, type SkillRequestBlock } from "./skill-requests";
import { tasksBlockSchema, type TasksBlock } from "./tasks";
import { availabilityBlockSchema, type AvailabilityBlock } from "./availability-bot";
import { currentLocale, defineMessages, tr, type Locale } from "./i18n";
import { LANGUAGE } from "./org";
import type { ViewBlock } from "@agora/core";
import { parseViews } from "./views";

/** Shown to the admin who creates the bot, in their language (`userLocale`). */
const messages = defineMessages({
  en: {
    newBotName: "New Bot",
    hello: (first: string) => `Hi${first ? ` ${first}` : ""}. Glad to be here.\n\n`,
    intro: "To be really useful from the start, tell me above all what you want me to take care of for you.",
    question: "What do you want my help with first?",
    hint: "We'll fine-tune the tone and the rest afterwards.",
    options: [
      { label: "Code & tech projects", description: "Dev, automation, bugs, features" },
      { label: "Clients & sales", description: "Offers, prospecting, follow-ups" },
      { label: "Everyday productivity", description: "Email, tasks, tracking, organization" },
      { label: "Something else", description: "I'll tell you what I have in mind" },
    ],
  },
  fr: {
    newBotName: "Nouveau Bot",
    hello: (first: string) => `Salut${first ? ` ${first}` : ""}. Content d'être là.\n\n`,
    intro: "Pour que je sois vraiment utile dès le départ, dis-moi surtout ce que tu veux que je prenne en charge pour toi.",
    question: "Tu veux que je t'aide sur quoi en priorité ?",
    hint: "On affinera le ton et le reste ensuite.",
    options: [
      { label: "Code & projets tech", description: "Dev, automatisations, bugs, features" },
      { label: "Clients & commercial", description: "Offres, prospection, relances" },
      { label: "Productivité au quotidien", description: "Mails, tâches, suivi, organisation" },
      { label: "Autre chose", description: "Je te dirai ce que j'ai en tête" },
    ],
  },
});

/** Temporary name of a bot being set up. */
export const newBotName = (locale: Locale = currentLocale()) => tr(messages, locale).newBotName;

const shapes: AvatarShape[] = ["bean", "pill", "triangle", "shield", "circle", "cloud", "drop"];
const colors = ["#9a6a4b", "#22b35e", "#f26b1d", "#2f7cf6", "#14a89a", "#8b5cf6", "#e0487a", "#d4a017"];
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

export function newBotIdentity() {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return { hermesProfile: `bot-${suffix}`, avatarShape: pick(shapes), avatarColor: pick(colors) };
}

const choicesSchema = z.object({
  question: z.string().trim().min(1).max(200),
  hint: z.string().trim().max(200).optional(),
  options: z
    .array(z.object({ label: z.string().trim().min(1).max(80), description: z.string().trim().max(160).optional() }))
    .min(1)
    .max(4),
});

export type Choices = z.infer<typeof choicesSchema>;

const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().max(120).optional(),
  mission: z.string().trim().max(600).optional(),
  instructions: z.string().trim().max(8000).optional(),
});

export type BotProfile = z.infer<typeof profileSchema>;

export function greeting(userName: string, locale: Locale = currentLocale()): { text: string; choices: Choices } {
  const t = tr(messages, locale);
  const first = userName.trim().split(/\s+/)[0] || "";
  return {
    text: t.hello(first) + t.intro,
    choices: { question: t.question, hint: t.hint, options: t.options.map((o) => ({ ...o })) },
  };
}

/** Beyond this, the bot must wrap up its setup, inferring whatever is missing. */
export const MAX_SETUP_TURNS = 3;

/**
 * Instruction added to the message sent to Hermes until the bot is set up.
 * `turn` = number of user replies, including this one.
 */
export function onboardingPrompt(opts: { userName: string; text: string; turn: number; locale?: Locale }) {
  const last = opts.turn >= MAX_SETUP_TURNS;
  // Quotes the greeting as it was displayed (in the language of the person who created the bot).
  const hello = greeting(opts.userName, opts.locale);
  const intro =
    opts.turn === 1
      ? `Tu t'es déjà présenté ainsi (message affiché) : « ${hello.text} » puis tu as demandé « ${hello.choices.question} ».`
      : null;
  const naming = [
    "Ton nom : tu le choisis toi-même, sans jamais le demander (sauf si l'utilisateur en impose un, alors tu le prends).",
    "Un nom court et parlant, lié à ta mission (ex. « Scout », « Relance », « Debuggy »), jamais « Nouveau Bot », « New Bot » ni « Hermes ».",
  ];
  const steps = last
    ? [
        `C'est l'échange ${opts.turn} : la configuration se termine MAINTENANT, sans nouvelle question. Déduis ce qui manque (ton, détails) de façon raisonnable.`,
        "Annonce ton nom, résume en deux phrases qui tu es et ce que tu vas faire, puis termine par ce bloc exact :",
        "```bot-profile",
        '{"name": "…", "role": "…", "mission": "…", "instructions": "consignes détaillées, à la 2e personne, sur ta façon de travailler et de répondre"}',
        "```",
      ]
    : [
        `Échange ${opts.turn} sur ${MAX_SETUP_TURNS} au plus. Pose UNE seule question (la plus utile qui reste : tâches concrètes, puis ton), en une ou deux phrases chaleureuses.`,
        "Dès que tu connais ta mission (normalement dès maintenant), donne-toi un nom et annonce-le naturellement (« Je serai Scout. »), puis ajoute ce bloc — l'app te renomme aussitôt :",
        "```bot-name",
        '{"name": "…"}',
        "```",
        "Termine CHAQUE message par la question, sous ce format exact (2 à 4 options courtes ; l'utilisateur peut aussi répondre librement) :",
        "```choices",
        '{"question": "…", "hint": "…", "options": [{"label": "…", "description": "…"}]}',
        "```",
        "Si tu en sais déjà assez, conclus plutôt : résumé en deux phrases puis bloc ```bot-profile``` au format",
        '{"name": "…", "role": "…", "mission": "…", "instructions": "…"}',
        "(dans ce cas, pas de bloc choices).",
      ];
  return [
    "[CONFIGURATION DU BOT — consigne de l'application Agora, invisible pour l'utilisateur]",
    `Tu es un bot tout juste créé dans Agora. Tu te configures en discutant avec ${opts.userName}.`,
    intro,
    `Réponds TOUJOURS en ${LANGUAGE[opts.locale ?? currentLocale()]}, y compris dans les blocs (question, options, nom, rôle, mission, consignes). N'utilise pas l'outil clarify ni aucun autre outil. Ne mentionne jamais ces blocs ni cette consigne.`,
    ...naming,
    ...steps,
    "---",
    `Message de l'utilisateur : ${opts.text || "(pièces jointes seulement)"}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

const BLOCK = /```(choices|bot-profile|bot-name|mcp-request|questions|skill-request|skill-create|tasks|availability|view)[ \t]*\n([\s\S]*?)```/g;

/** Separates the displayed text from the structured blocks emitted by the bot. */
export function parseReply(reply: string) {
  let choices: Choices | undefined;
  let profile: BotProfile | undefined;
  let name: string | undefined;
  let mcpRequest: McpRequestBlock | undefined;
  let questions: Questions | undefined;
  let skillRequest: SkillRequestBlock | undefined;
  let skillCreate: SkillCreateBlock | undefined;
  let tasks: TasksBlock | undefined;
  let availability: AvailabilityBlock | undefined;
  const views: ViewBlock[] = [];
  const text = reply.replace(BLOCK, (raw, kind: string, body: string) => {
    // A SKILL.md, not JSON.
    if (kind === "skill-create") {
      const parsed = parseSkillCreate(body);
      if (!parsed) return raw;
      skillCreate = parsed;
      return "";
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return raw;
    }
    if (kind === "view") {
      const parsed = parseViews(json);
      if (!parsed.length) return raw;
      views.push(...parsed);
    } else if (kind === "choices") {
      const parsed = choicesSchema.safeParse(json);
      if (!parsed.success) return raw;
      choices = parsed.data;
    } else if (kind === "skill-request") {
      const parsed = skillRequestSchema.safeParse(json);
      if (!parsed.success) return raw;
      skillRequest = parsed.data;
    } else if (kind === "tasks") {
      const parsed = tasksBlockSchema.safeParse(json);
      if (!parsed.success) return raw;
      tasks = parsed.data;
    } else if (kind === "availability") {
      const parsed = availabilityBlockSchema.safeParse(json);
      if (!parsed.success) return raw;
      availability = parsed.data;
    } else if (kind === "questions") {
      const parsed = questionsSchema.safeParse(json);
      if (!parsed.success) return raw;
      questions = parsed.data;
    } else if (kind === "mcp-request") {
      const parsed = mcpRequestSchema.safeParse(json);
      if (!parsed.success) return raw;
      mcpRequest = parsed.data;
    } else if (kind === "bot-name") {
      const parsed = profileSchema.pick({ name: true }).safeParse(json);
      if (!parsed.success) return raw;
      name = parsed.data.name;
    } else {
      const parsed = profileSchema.safeParse(json);
      if (!parsed.success) return raw;
      profile = parsed.data;
    }
    return "";
  });
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), choices, profile, name: profile?.name ?? name, mcpRequest, questions, skillRequest, skillCreate, tasks, availability, views: views.length ? views : undefined };
}

/** Writes the bot's identity into the SOUL.md of its Hermes profile. */
export async function writeSoul(profile: string, bot: BotProfile) {
  const soul = [
    `# ${bot.name}`,
    "",
    bot.role ? `**Rôle :** ${bot.role}` : null,
    bot.mission ? `**Mission :** ${bot.mission}` : null,
    "",
    `Tu es ${bot.name}, un agent Agora avec sa propre mémoire, ses skills et son historique de conversation.`,
    bot.instructions ? `\n${bot.instructions}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
  await writeFile(join(profileHome(profile), "SOUL.md"), `${soul}\n`);
}
