/**
 * Artifacts written by a bot in an ```artifact block (@agora/core previews.ts; ```preview still reads).
 * The app renders them while they stream; at the end of the reply each becomes an HTML file of the
 * conversation (shown with the message and in its files, downloadable, readable by the bots' file
 * tools) and the next version of the artifact its slug names (artifacts.ts), which can be shared.
 */
import { artifactSlug, previewFileName, type LivePreview, type PreviewRef } from "@agora/core";
import { ARTIFACT_SCRIPT_HOSTS, recordVersion } from "./artifacts";
import { MAX_FILE, storeAttachment } from "./attachments";

export const PREVIEW_PROMPT = [
  "# Artefacts (pages HTML)",
  "Quand on te demande une page, une maquette, un écran, un mini-outil, un tableau de bord ou un document à voir ou à partager, écris la page complète dans ce bloc, dans ta réponse : l'app l'affiche en direct pendant que tu l'écris, la garde comme artefact de la conversation, et la personne peut la partager par lien.",
  "```artifact slug=nom-court",
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>…</title><style>/* mise en page seulement */</style></head><body><main class="ag-page"><header class="ag-header"><h1>…</h1><p>…</p></header>…</main><script>…</script></body></html>',
  "```",
  "- `slug` : un identifiant court en minuscules et tirets, propre à cette page (`tableau-ventes-q3`). Pour la modifier, renvoie la page entière modifiée avec le même slug : elle devient la version suivante du même artefact, et son lien de partage montre la nouvelle. Un autre slug crée un autre artefact. Plusieurs pages : un bloc chacune.",
  `- Un seul fichier autonome. Le JavaScript s'exécute une fois le bloc fermé (scripts dans la page ou bibliothèques depuis ${ARTIFACT_SCRIPT_HOSTS.join(", ")}, avec une version exacte). Rien d'autre n'est chargé : pas d'autre domaine de script. Les images, styles et polices en \`https://\` s'affichent ; \`fetch\` vers une API publique en https fonctionne, sans cookies ni accès à l'app.`,
  "- Le design est celui d'Agora, fourni automatiquement : la page reçoit la feuille de style de l'app (police Geist, couleurs, thème clair ou sombre de la personne). N'écris ni couleur, ni police, ni ombre, ni fond : ton CSS ne fait que la mise en page (grilles, largeurs, espacements). Les titres, paragraphes, champs, listes déroulantes, boutons et tableaux HTML ont déjà le style Agora.",
  "- Composants Agora, en classes : `ag-page` (colonne centrée), `ag-header` (h1 + p en gris), `ag-card` avec `ag-card-header` (+ `ag-bordered`), `ag-card-title`, `ag-card-description`, `ag-card-action`, `ag-card-footer` ; `ag-stat` avec `ag-stat-label`, `ag-stat-value`, `ag-stat-note` ; `ag-grid`, `ag-row`, `ag-stack` ; boutons `ag-button` (+ `ag-button-outline`, `ag-button-secondary`, `ag-button-ghost`, `ag-button-destructive`, `ag-button-sm`) ; `ag-badge` (+ `ag-badge-outline`, `ag-dot`) ; `ag-tabs` (boutons avec `aria-selected`) ; `ag-progress` ; textes `ag-muted`, `ag-subtle`, `ag-mono`, `ag-tabular` ; sens `ag-success`, `ag-warning`, `ag-danger`, `ag-brand`.",
  "- Couleurs en JavaScript (graphiques) : lis les variables CSS (`getComputedStyle(document.documentElement).getPropertyValue('--chart-2')`, `--foreground`, `--muted-foreground`, `--border`, `--brand`, `--success`). Les données sont en niveaux d'encre (`--chart-1` à `--chart-5`) ; la couleur ne sert qu'à porter un sens.",
  "- Pars du modèle qui correspond, sans inventer de mise en page :",
  '  · Tableau de bord : `<main class="ag-page"><header class="ag-header"><h1>Titre</h1><p>Période, unité</p></header><div class="ag-grid"><div class="ag-card"><div class="ag-stat"><span class="ag-stat-label">Libellé</span><span class="ag-stat-value">Valeur</span><span class="ag-stat-note">Comparaison</span></div></div>…</div><div class="ag-card"><div class="ag-card-header ag-bordered"><div class="ag-card-title">Graphique</div><div class="ag-card-description">Unité</div></div><div style="position:relative;height:240px"><canvas></canvas></div></div><div class="ag-card"><table>…</table></div></main>`',
  '  · Outil ou calculateur : `<main class="ag-page"><header class="ag-header">…</header><div class="ag-card"><div class="ag-card-header ag-bordered"><div class="ag-card-title">Paramètres</div></div><div class="fields"><label>Nom<input></label><label>Choix<select>…</select></label></div><div class="ag-card-footer"><span class="ag-muted">Résumé</span><button>Action</button></div></div><div class="ag-grid">résultats en ag-stat</div></main>` (`.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}`)',
  '  · Document ou compte rendu : `<main class="ag-page" style="max-width:720px"><header class="ag-header"><h1>…</h1><p>Auteur, date</p></header><section class="ag-stack"><h2>…</h2><p>…</p><table>…</table></section></main>` : titres, paragraphes et tableaux nus, sans carte autour de chaque section.',
  "- Une seule action principale par carte (`button` plein) ; les autres en `ag-button-outline` ou `ag-button-ghost`, à droite. Pas d'emoji, pas de dégradé, pas de bloc décoratif, pas de texte de remplissage : uniquement les vraies données.",
  "- La page s'exécute isolée : pas de `localStorage` fiable, pas de formulaire envoyé ailleurs. Garde l'état en mémoire.",
  "- Commence par `<head>` et le `<style>`, puis la page de haut en bas : elle se construit sous les yeux de la personne. Mets les scripts à la fin.",
  "- `<title>` : le nom de l'artefact (« Tableau des ventes — T3 »).",
  "- Écris-la toi-même dans ce bloc : pas de fichier sur disque, de sous-agent, de dépôt ni de lien à la place. Ton texte autour reste court, ne répète pas la page et ne mentionne pas le bloc.",
].join("\n");

/**
 * Saves the pages of a reply as files of the conversation (in the bot's profile in a direct
 * conversation, like an upload) and as versions of their artifacts. One that can't be saved is
 * left out; one saved without its version stays a plain mockup.
 */
export async function savePreviews(previews: LivePreview[], ctx: { conversationId: string; turnId: string; directProfile: string | null }) {
  const saved: { attachment: { id: string; name: string; mime: string; size: number }; preview: PreviewRef }[] = [];
  for (const [index, p] of previews.entries()) {
    const body = new Blob([p.html], { type: "text/html" });
    // Same index as in the streamed reply: the app follows the page by it.
    if (!p.html.trim() || body.size > MAX_FILE) continue;
    const row = await storeAttachment(ctx.conversationId, ctx.directProfile, previewFileName(p.title), "text/html", body).catch((err) => {
      console.error("previews: save", err);
      return null;
    });
    if (!row) continue;
    const slug = p.slug || artifactSlug(p.title) || `page-${index + 1}`;
    const version = await recordVersion(ctx.conversationId, slug, p.title, row.id).catch((err) => {
      console.error("previews: artifact version", err);
      return null;
    });
    saved.push({
      attachment: { id: row.id, name: row.name, mime: row.mime, size: row.size },
      preview: { id: row.id, title: p.title, key: `${ctx.turnId}:${index}`, ...version },
    });
  }
  return saved;
}
