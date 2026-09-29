/**
 * HTML mockups written by a bot in a ```preview block (@agora/core previews.ts).
 * The app renders them while they stream; at the end of the reply each becomes
 * an HTML file of the conversation, shown with the message and in its files,
 * downloadable, and readable by the bots' file tools.
 */
import { previewFileName, type LivePreview, type PreviewRef } from "@agora/core";
import { MAX_FILE, storeAttachment } from "./attachments";

export const PREVIEW_PROMPT = [
  "# Maquettes HTML",
  "Quand on te demande une maquette, un wireframe, une page ou un écran à voir, écris la page complète dans ce bloc, dans ta réponse : l'app l'affiche en direct pendant que tu l'écris, puis la garde comme fichier de la conversation, téléchargeable.",
  "```preview",
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>…</title><style>…</style></head><body>…</body></html>',
  "```",
  "- Un seul fichier autonome : tout le CSS dans `<style>`, polices système. Pas de JavaScript ni de gestionnaire `on…` : ils ne s'exécutent pas. Pas de feuille de style, de police ou de script externe : ils sont bloqués. Les images en `https://` s'affichent.",
  "- Commence par `<head>` et le `<style>`, puis la page de haut en bas : elle se construit sous les yeux de la personne.",
  "- `<title>` : le nom de la maquette (« Accueil — variante B »).",
  "- Pour la corriger, renvoie la page entière modifiée dans un nouveau bloc. Plusieurs pages : un bloc chacune.",
  "- Écris-la toi-même dans ce bloc : pas de fichier sur disque, de sous-agent, de dépôt ni de lien à la place. Ton texte autour reste court, ne répète pas la page et ne mentionne pas le bloc.",
].join("\n");

/**
 * Saves the mockups of a reply as files of the conversation (in the bot's profile in a
 * direct conversation, like an upload). One that can't be saved is left out.
 */
export async function savePreviews(previews: LivePreview[], ctx: { conversationId: string; turnId: string; directProfile: string | null }) {
  const saved: { attachment: { id: string; name: string; mime: string; size: number }; preview: PreviewRef }[] = [];
  for (const [index, p] of previews.entries()) {
    const body = new Blob([p.html], { type: "text/html" });
    // Same index as in the streamed reply: the app follows the mockup by it.
    if (!p.html.trim() || body.size > MAX_FILE) continue;
    const row = await storeAttachment(ctx.conversationId, ctx.directProfile, previewFileName(p.title), "text/html", body).catch((err) => {
      console.error("previews: save", err);
      return null;
    });
    if (!row) continue;
    saved.push({
      attachment: { id: row.id, name: row.name, mime: row.mime, size: row.size },
      preview: { id: row.id, title: p.title, key: `${ctx.turnId}:${index}` },
    });
  }
  return saved;
}
