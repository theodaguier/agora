/**
 * Questions asked by a bot as a form (```questions``` block): several
 * questions at once, single choice, multiple choice or free text.
 * Answers come back to the bot as a message from the employee.
 *
 * Lenient on purpose: a label a bit too long or a stray option must not
 * turn the whole form into a raw JSON code block in the conversation.
 */
import { z } from "zod";

/** Trims and cuts at `max` characters instead of rejecting. */
const clipped = (max: number) =>
  z.string().transform((s) => {
    const t = s.trim();
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
  });

const option = z.preprocess(
  (o) => (typeof o === "string" ? { label: o } : o),
  z.object({ label: clipped(80).pipe(z.string().min(1)), description: clipped(160).optional() }),
);

const TYPES: Record<string, "single" | "multi" | "text"> = {
  single: "single",
  radio: "single",
  multi: "multi",
  multiple: "multi",
  checkbox: "multi",
  text: "text",
  free: "text",
  open: "text",
};

const question = z.preprocess(
  (q) => {
    if (!q || typeof q !== "object") return q;
    const { question: alias, multiSelect, ...rest } = q as Record<string, unknown>;
    const type = typeof rest.type === "string" ? TYPES[rest.type.toLowerCase()] : multiSelect === true ? "multi" : undefined;
    const options = Array.isArray(rest.options) ? rest.options.slice(0, 8) : rest.options;
    return { ...rest, label: rest.label ?? alias, type, options };
  },
  z
    .object({
      label: clipped(200).pipe(z.string().min(1)),
      hint: clipped(200).optional(),
      type: z.enum(["single", "multi", "text"]).default("single"),
      options: z.array(option).default([]),
      required: z.boolean().default(true),
    })
    // A choice with fewer than two options is asked as free text.
    .transform((q) => (q.type !== "text" && q.options.length < 2 ? { ...q, type: "text" as const, options: [] } : q)),
);

export const questionsSchema = z.object({
  title: clipped(120).optional(),
  questions: z.preprocess((qs) => (Array.isArray(qs) ? qs.slice(0, 8) : qs), z.array(question).min(1)),
});

export type Questions = z.infer<typeof questionsSchema>;

export const QUESTIONS_PROMPT = [
  "# Poser des questions",
  "Quand il te manque des informations pour avancer, pose tes questions avec ce bloc, seul, à la fin de ta réponse : l'app affiche un formulaire et te renvoie les réponses.",
  "```questions",
  '{"title": "…", "questions": [{"label": "…", "type": "single", "options": [{"label": "…", "description": "…"}]}, {"label": "…", "type": "multi", "options": [{"label": "…"}, {"label": "…"}]}, {"label": "…", "type": "text", "required": false}]}',
  "```",
  "- `type` : `single` (un choix), `multi` (plusieurs choix) ou `text` (réponse libre). Les choix proposent toujours aussi une réponse libre.",
  "- Libellés courts : une option tient en quelques mots (80 caractères au plus), le détail va dans `description`.",
  "- Regroupe tes questions en un seul bloc (8 au plus). N'utilise pas l'outil clarify.",
].join("\n");
