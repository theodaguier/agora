/**
 * Questions asked by a bot as a form (```questions``` block): several
 * questions at once, single choice, multiple choice or free text.
 * Answers come back to the bot as a message from the employee.
 */
import { z } from "zod";

const option = z.object({ label: z.string().trim().min(1).max(80), description: z.string().trim().max(160).optional() });

export const questionsSchema = z.object({
  title: z.string().trim().max(120).optional(),
  questions: z
    .array(
      z
        .object({
          label: z.string().trim().min(1).max(200),
          hint: z.string().trim().max(200).optional(),
          type: z.enum(["single", "multi", "text"]).default("single"),
          options: z.array(option).max(8).default([]),
          required: z.boolean().default(true),
        })
        .refine((q) => q.type === "text" || q.options.length >= 2, "au moins deux options"),
    )
    .min(1)
    .max(8),
});

export type Questions = z.infer<typeof questionsSchema>;

export const QUESTIONS_PROMPT = [
  "# Poser des questions",
  "Quand il te manque des informations pour avancer, pose tes questions avec ce bloc, seul, à la fin de ta réponse : l'app affiche un formulaire et te renvoie les réponses.",
  "```questions",
  '{"title": "…", "questions": [{"label": "…", "type": "single", "options": [{"label": "…", "description": "…"}]}, {"label": "…", "type": "multi", "options": [{"label": "…"}, {"label": "…"}]}, {"label": "…", "type": "text", "required": false}]}',
  "```",
  "- `type` : `single` (un choix), `multi` (plusieurs choix) ou `text` (réponse libre). Les choix proposent toujours aussi une réponse libre.",
  "- Regroupe tes questions en un seul bloc (8 au plus). N'utilise pas l'outil clarify.",
].join("\n");
