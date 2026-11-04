import { useState, type ReactNode } from "react";
import type { VaultItem, VaultItemKind, VaultSummary } from "@agora/core";
import { BrandLogo } from "@/components/BrandLogo";
import { FinanceIntegrationIcon, KeyIcon, UserIcon, type IconComponent } from "@/components/icons";
import { ItemMedia } from "@/components/ui/item";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";

/** Words of the Coffre-fort shared by its screen, its dialogs and the thread card. */
export const safeMessages = defineMessages({
  en: {
    personal: "Personal",
    kinds: { login: "Login", card: "Payment card", contact: "Contact details" } as Record<VaultItemKind, string>,
    newKind: { login: "New login", card: "New payment card", contact: "New contact details" } as Record<VaultItemKind, string>,
    editKind: { login: "Edit login", card: "Edit payment card", contact: "Edit contact details" } as Record<VaultItemKind, string>,
    tabs: { all: "All", login: "Logins", card: "Payments", contact: "Contact details" } as Record<"all" | VaultItemKind, string>,
    newItem: "New item",
    field: {
      title: "Title",
      website: "Website",
      username: "Username",
      password: "Password",
      notes: "Notes",
      holder: "Cardholder",
      number: "Card number",
      card: "Card",
      expiry: "Expiry",
      cvc: "Security code",
      name: "Full name",
      email: "Email",
      phone: "Phone",
      address: "Address",
      company: "Company",
    },
    cardEnding: (brand: string, last4: string) => `${brand} •••• ${last4}`.trim(),
  },
  fr: {
    personal: "Personnel",
    kinds: { login: "Identifiant", card: "Carte de paiement", contact: "Coordonnées" },
    newKind: { login: "Nouvel identifiant", card: "Nouvelle carte de paiement", contact: "Nouvelles coordonnées" },
    editKind: { login: "Modifier l'identifiant", card: "Modifier la carte de paiement", contact: "Modifier les coordonnées" },
    tabs: { all: "Tout", login: "Identifiants", card: "Paiements", contact: "Coordonnées" },
    newItem: "Nouvel élément",
    field: {
      title: "Titre",
      website: "Site web",
      username: "Nom d'utilisateur",
      password: "Mot de passe",
      notes: "Notes",
      holder: "Titulaire",
      number: "Numéro de carte",
      card: "Carte",
      expiry: "Expiration",
      cvc: "Code de sécurité",
      name: "Nom complet",
      email: "E-mail",
      phone: "Téléphone",
      address: "Adresse",
      company: "Entreprise",
    },
    cardEnding: (brand: string, last4: string) => `${brand} •••• ${last4}`.trim(),
  },
});

/** "https://www.mon-marche.fr/login" → "mon-marche.fr": what the logo and the rows show. */
export function domainOf(website: string | null | undefined): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** The address to open, https when none was typed. */
export const hrefOf = (website: string) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? website : `https://${website}`);

const KIND_ICON: Record<VaultItemKind, IconComponent> = { login: KeyIcon, card: FinanceIntegrationIcon, contact: UserIcon };

/** A login's site: its website, else a title that is a domain (« mon-marche.fr »). */
export function siteOf(item: Pick<VaultItem, "kind" | "website" | "title">): string | null {
  if (item.kind !== "login") return null;
  return domainOf(item.website) ?? (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(item.title.trim()) ? item.title.trim().toLowerCase().replace(/^www\./, "") : null);
}

/** The site's favicon, fetched by the API (the browser never calls the site), else `fallback`. */
function Favicon({ domain, fallback }: { domain: string; fallback: ReactNode }) {
  const src = `/api/integrations/favicon?domain=${encodeURIComponent(domain)}`;
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return fallback;
  return <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(src)} className="size-full object-contain p-1.5" />;
}

/** A login's site logo on a white tile (logo.dev when set up, else the site's favicon), else the kind's icon. */
export function ItemLogo({ item, className }: { item: Pick<VaultItem, "kind" | "website" | "title">; className?: string }) {
  const Icon = KIND_ICON[item.kind];
  const icon = <Icon className="size-4 text-muted-foreground" />;
  const domain = siteOf(item);
  return (
    <ItemMedia variant="image" className={cn("bg-background", className)}>
      {domain ? <BrandLogo domain={domain} fallback={<Favicon domain={domain} fallback={icon} />} /> : icon}
    </ItemMedia>
  );
}

/** The line under an item's title: the username, the card's last digits or the contact's email. */
export function useItemSubtitle() {
  const t = useT(safeMessages);
  return (item: Pick<VaultItem, "kind" | "fields" | "website">) => {
    const f = item.fields;
    if (item.kind === "login") return f.username || domainOf(item.website) || "";
    if (item.kind === "card") return f.last4 ? t.cardEnding(f.brand ?? "", f.last4) : f.holder || "";
    return f.email || f.phone || f.name || "";
  };
}

/** A vault's name as people read it: the personal one in their language. */
export function useVaultName() {
  const t = useT(safeMessages);
  return (vault: Pick<VaultSummary, "kind" | "name">) => (vault.kind === "personal" ? t.personal : vault.name);
}

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!#$%&*+-=?@_";

/** A uniform random integer in [0, n), n ≤ 256 (rejection sampling: no modulo bias). */
function randomBelow(n: number): number {
  const max = 256 - (256 % n);
  const byte = new Uint8Array(1);
  do crypto.getRandomValues(byte);
  while (byte[0]! >= max);
  return byte[0]! % n;
}

/** A strong random password: 20 characters, every class present, no look-alike characters. */
export function generatePassword(length = 20): string {
  const pick = (set: string) => set[randomBelow(set.length)]!;
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
