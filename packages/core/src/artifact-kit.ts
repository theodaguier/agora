/**
 * Agora's look inside an artifact. Every page a bot writes gets this stylesheet before its own
 * (withArtifactKit): the app's tokens (index.css, Figma « Agora · Couleurs »), Geist, and the
 * shadcn components of the app (Card, Button, Input, Badge, Table…) as `ag-` classes, with the
 * same measures as their .tsx. Plain elements (headings, fields, buttons, tables) already look like
 * the app's, so a page written without a class is an Agora page; the bot only lays it out.
 */

export type ArtifactTheme = "light" | "dark";

const LIGHT = `--background:oklch(1 0 0);--foreground:oklch(0.145 0 0);--card:oklch(1 0 0);--card-foreground:oklch(0.145 0 0);--popover:oklch(1 0 0);--primary:oklch(0.205 0 0);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.97 0 0);--secondary-foreground:oklch(0.205 0 0);--muted:oklch(0.97 0 0);--muted-foreground:oklch(0.556 0 0);--subtle-foreground:oklch(0.708 0 0);--accent:oklch(0.97 0 0);--destructive:oklch(0.577 0.245 27.325);--border:oklch(0.922 0 0);--input:oklch(0.922 0 0);--ring:oklch(0.708 0 0);--chart-1:oklch(0.87 0 0);--chart-2:oklch(0.556 0 0);--chart-3:oklch(0.439 0 0);--chart-4:oklch(0.371 0 0);--chart-5:oklch(0.269 0 0);--brand:#0a84ff;--success:#1fa855;--warning:#f97316;color-scheme:light;`;

const DARK = `--background:#17181a;--foreground:#f2f2f2;--card:#1d1e21;--card-foreground:#f2f2f2;--popover:#1d1e21;--primary:#f2f2f2;--primary-foreground:#17181a;--secondary:#27282b;--secondary-foreground:#f2f2f2;--muted:#232427;--muted-foreground:#8b8d93;--subtle-foreground:#5f6168;--accent:#27282b;--destructive:#e0786f;--border:#2a2b2f;--input:#2a2b2f;--ring:#5f6168;--chart-1:oklch(0.87 0 0);--chart-2:oklch(0.556 0 0);--chart-3:oklch(0.439 0 0);--chart-4:oklch(0.371 0 0);--chart-5:oklch(0.269 0 0);--brand:#7ba1f6;--success:#6cbb62;--warning:#e9a45f;color-scheme:dark;`;

/** The components, as the app's ui/*.tsx draw them (base-nova): 13 px interface text, 8 px radii, hairline borders. */
const COMPONENTS = `
:root{--radius:0.625rem;--font-sans:"Geist","Geist Variable",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;--font-mono:"Geist Mono","Geist Mono Variable",ui-monospace,monospace}
*,*::before,*::after{box-sizing:border-box;border-color:var(--border)}
html{font-family:var(--font-sans);font-size:16px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{margin:0;padding:24px;background:var(--background);color:var(--foreground);font-size:.8125rem;line-height:1.125rem}
h1,h2,h3,h4{margin:0;font-weight:500;letter-spacing:-.01em}
h1{font-size:1.375rem;line-height:1.75rem}h2{font-size:1rem;line-height:1.375rem}h3{font-size:.875rem;line-height:1.25rem}
p{margin:0}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}
code,pre,kbd{font-family:var(--font-mono);font-size:.75rem}
code{background:var(--muted);border-radius:calc(var(--radius)*.5);padding:.1rem .3rem}
pre{background:var(--muted);border-radius:var(--radius);padding:.75rem;overflow:auto}
hr{border:0;border-top:1px solid var(--border);margin:1rem 0}
::selection{background:color-mix(in oklch,var(--brand) 30%,transparent)}
:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in oklch,var(--ring) 50%,transparent)}
.ag-muted{color:var(--muted-foreground)}.ag-subtle{color:var(--subtle-foreground)}.ag-mono{font-family:var(--font-mono)}.ag-tabular{font-variant-numeric:tabular-nums}
.ag-stack{display:flex;flex-direction:column;gap:12px}.ag-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ag-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.ag-page{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
.ag-header{display:flex;flex-direction:column;gap:4px}.ag-header p{color:var(--muted-foreground)}
.ag-card{display:flex;flex-direction:column;gap:12px;overflow:hidden;border-radius:calc(var(--radius)*1.5);background:var(--card);color:var(--card-foreground);padding:12px 0;font-size:.875rem;box-shadow:0 0 0 1px color-mix(in oklch,var(--foreground) 10%,transparent)}
.ag-card>*{padding-left:12px;padding-right:12px}
.ag-card-header{display:grid;gap:4px;grid-template-columns:1fr auto;align-items:start}
.ag-card-header.ag-bordered{border-bottom:1px solid var(--border);padding-bottom:12px}
.ag-card-title{font-size:.875rem;line-height:1.375;font-weight:500;grid-column:1}
.ag-card-description{color:var(--muted-foreground);font-size:.8125rem;grid-column:1}
.ag-card-action{grid-column:2;grid-row:1/span 2;justify-self:end}
.ag-card-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;border-top:1px solid var(--border);background:color-mix(in oklch,var(--muted) 50%,transparent);padding-top:12px;padding-bottom:12px;margin-bottom:-12px}
.ag-stat{display:flex;flex-direction:column;gap:2px}.ag-stat-label{color:var(--muted-foreground);font-size:.8125rem}
.ag-stat-value{font-size:1.375rem;line-height:1.75rem;font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ag-stat-note{color:var(--subtle-foreground);font-size:.75rem}
button,.ag-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 10px;border-radius:var(--radius);border:1px solid transparent;background:var(--primary);color:var(--primary-foreground);font:inherit;font-size:.875rem;font-weight:500;white-space:nowrap;cursor:pointer;transition:background .15s,color .15s,transform .1s;text-decoration:none}
button:hover,.ag-button:hover{background:color-mix(in oklch,var(--primary) 80%,transparent);text-decoration:none}
button:active,.ag-button:active{transform:translateY(1px)}
button:disabled,.ag-button:disabled{opacity:.5;pointer-events:none}
.ag-button-outline{background:var(--background);color:var(--foreground);border-color:var(--border)}
.ag-button-outline:hover{background:var(--muted)}
.ag-button-secondary{background:var(--secondary);color:var(--secondary-foreground)}
.ag-button-secondary:hover{background:color-mix(in oklch,var(--secondary),var(--foreground) 5%)}
.ag-button-ghost{background:transparent;color:var(--foreground)}.ag-button-ghost:hover{background:var(--muted)}
.ag-button-destructive{background:color-mix(in oklch,var(--destructive) 10%,transparent);color:var(--destructive)}
.ag-button-destructive:hover{background:color-mix(in oklch,var(--destructive) 20%,transparent)}
.ag-button-sm{height:28px;padding:0 10px;font-size:.8rem;border-radius:min(calc(var(--radius)*.75),12px)}
input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea,.ag-input{height:32px;width:100%;min-width:0;border-radius:var(--radius);border:1px solid var(--input);background:transparent;color:var(--foreground);padding:4px 10px;font:inherit;font-size:.875rem;outline:none;transition:border-color .15s,box-shadow .15s}
textarea{height:auto;min-height:64px;padding:8px 10px;resize:vertical}
input::placeholder,textarea::placeholder{color:var(--muted-foreground)}
input:focus-visible,select:focus-visible,textarea:focus-visible{border-color:var(--ring);box-shadow:0 0 0 3px color-mix(in oklch,var(--ring) 50%,transparent)}
input[type=checkbox],input[type=radio],input[type=range]{accent-color:var(--primary)}
label,.ag-label{display:flex;flex-direction:column;gap:6px;font-size:.875rem;font-weight:500}
.ag-field-description{color:var(--muted-foreground);font-weight:400;font-size:.8125rem}
.ag-badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;background:var(--secondary);color:var(--secondary-foreground);font-size:.75rem;font-weight:500;white-space:nowrap}
.ag-badge-outline{background:transparent;border:1px solid var(--border);color:var(--foreground)}
.ag-dot{width:6px;height:6px;border-radius:999px;background:var(--muted-foreground)}
.ag-success{color:var(--success)}.ag-warning{color:var(--warning)}.ag-danger{color:var(--destructive)}.ag-brand{color:var(--brand)}
table,.ag-table{width:100%;border-collapse:collapse;font-size:.8125rem;font-variant-numeric:tabular-nums}
th{height:32px;padding:0 8px;text-align:left;font-weight:500;color:var(--muted-foreground);border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:8px;border-bottom:1px solid var(--border)}
tbody tr:hover{background:color-mix(in oklch,var(--muted) 50%,transparent)}tbody tr:last-child td{border-bottom:0}
.ag-separator{height:1px;background:var(--border);border:0;margin:0}
.ag-tabs{display:inline-flex;gap:2px;padding:3px;border-radius:var(--radius);background:var(--muted)}
.ag-tabs>button{height:26px;background:transparent;color:var(--muted-foreground);border-radius:calc(var(--radius)*.75)}
.ag-tabs>button:hover{background:transparent;color:var(--foreground)}
.ag-tabs>button[aria-selected=true]{background:var(--background);color:var(--foreground);box-shadow:0 1px 2px rgb(0 0 0/.08)}
.ag-progress{height:6px;border-radius:999px;background:var(--muted);overflow:hidden}.ag-progress>span{display:block;height:100%;background:var(--primary)}
`;

const FONTS = `@import url("https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap");`;

/** The stylesheet: one palette when the app says which, else the reader's system setting. */
export function artifactKitCss(theme?: ArtifactTheme) {
  const palette = theme ? `:root{${theme === "dark" ? DARK : LIGHT}}` : `:root{${LIGHT}}@media (prefers-color-scheme:dark){:root{${DARK}}}`;
  return `${FONTS}${palette}${COMPONENTS}`;
}

/**
 * The page with the kit ahead of its own styles (its own CSS still wins): after `<head>`, else
 * after `<html>` or the doctype, never before the doctype (that would switch it to quirks mode).
 */
export function withArtifactKit(html: string, theme?: ArtifactTheme) {
  const style = `<style id="agora-kit">${artifactKitCss(theme)}</style>`;
  const at = /<head[^>]*>/i.exec(html) ?? /<html[^>]*>/i.exec(html) ?? /<!doctype[^>]*>/i.exec(html);
  return at ? html.slice(0, at.index + at[0].length) + style + html.slice(at.index + at[0].length) : style + html;
}

/** A theme from a query string value, or none. */
export const artifactTheme = (raw: string | undefined): ArtifactTheme | undefined => (raw === "dark" || raw === "light" ? raw : undefined);
