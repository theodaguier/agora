import {
  siAirtable,
  siAsana,
  siDiscord,
  siFigma,
  siGithub,
  siGitlab,
  siGmail,
  siGooglecalendar,
  siGoogledocs,
  siGoogledrive,
  siGooglemaps,
  siGooglesheets,
  siGrafana,
  siHubspot,
  siJira,
  siLinear,
  siNotion,
  siPosthog,
  siPostgresql,
  siResend,
  siSentry,
  siShopify,
  siStripe,
  siSupabase,
  siTodoist,
  siTrello,
  siVercel,
  siZoom,
  type SimpleIcon,
} from "simple-icons";

/**
 * Brand marks shipped with the app (simple-icons, CC0): an integration shows its logo even where
 * logo.dev isn't set up. Matched on the connector's or source's name, or its domain.
 */
const BRANDS: [RegExp, SimpleIcon][] = [
  [/gmail/i, siGmail],
  [/google.?maps|maps\.google|^google\.com$/i, siGooglemaps],
  [/calendar|agenda|gcal/i, siGooglecalendar],
  [/drive/i, siGoogledrive],
  [/sheets/i, siGooglesheets],
  [/docs\.google|google.?docs/i, siGoogledocs],
  [/github/i, siGithub],
  [/gitlab/i, siGitlab],
  [/stripe/i, siStripe],
  [/linear/i, siLinear],
  [/notion/i, siNotion],
  [/figma/i, siFigma],
  [/hubspot/i, siHubspot],
  [/posthog/i, siPosthog],
  [/grafana/i, siGrafana],
  [/postgres/i, siPostgresql],
  [/supabase/i, siSupabase],
  [/airtable/i, siAirtable],
  [/asana/i, siAsana],
  [/jira|atlassian/i, siJira],
  [/trello/i, siTrello],
  [/todoist/i, siTodoist],
  [/discord/i, siDiscord],
  [/shopify/i, siShopify],
  [/resend/i, siResend],
  [/sentry/i, siSentry],
  [/vercel/i, siVercel],
  [/zoom/i, siZoom],
];

export const brandIcon = (...names: (string | null | undefined)[]): SimpleIcon | undefined => {
  for (const name of names) {
    if (!name) continue;
    const hit = BRANDS.find(([re]) => re.test(name));
    if (hit) return hit[1];
  }
  return undefined;
};

/** A near-black mark (GitHub, Notion, Vercel) would vanish on the dark theme: drawn in the text's colour. */
export const isInkBrand = (hex: string) => {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 60;
};
