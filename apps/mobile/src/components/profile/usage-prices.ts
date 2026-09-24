import { queryOptions } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { api } from "@/lib/api";
import { defineMessages } from "@/lib/i18n";

/* The admin's model prices of apps/web/src/components/Usage.tsx (`Prices`, `PriceRow`). */

export type PriceSource = "admin" | "models.dev" | "engine";
export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type ModelPriceRow = { provider: string; model: string; price: Price | null; source: PriceSource; catalogue: Price | null };

export const PRICE_FIELDS = ["input", "output", "cacheRead", "cacheWrite"] as const;

export const pricesQuery = queryOptions({ queryKey: ["usage", "prices"], queryFn: () => api<ModelPriceRow[]>("/usage/prices") });

export const priceHref = (row: Pick<ModelPriceRow, "provider" | "model">) =>
  ({ pathname: "/profile/usage-price", params: { provider: row.provider, model: row.model } }) as Href;

export const pricesMessages = defineMessages({
  en: {
    prices: "Model prices",
    pricesIntro: "In USD per million tokens. By default, the public models.dev price; enter your own (e.g. a subscription billed at a flat rate) to correct estimates, past ones included.",
    model: "Model",
    input: "Input",
    output: "Output",
    cacheRead: "Cache read",
    cacheWrite: "Cache write",
    priceSource: { admin: "Custom", "models.dev": "models.dev", engine: "No price" } as Record<PriceSource, string>,
    engineNote: "Without a price, the engine's own estimate is used, if any.",
    save: "Save",
    saving: "Saving…",
    reset: "Reset",
    resetDone: "Price reset",
    resetTitle: (model: string) => `Reset the price of ${model}?`,
    resetBody: "Your price will be deleted; costs will use the models.dev price again.",
    noModels: "No model used yet.",
  },
  fr: {
    prices: "Prix des modèles",
    pricesIntro:
      "En dollars par million de tokens. Par défaut, le prix public de models.dev ; saisis le tien (un abonnement au forfait, par exemple) pour corriger les estimations, passées comprises.",
    model: "Modèle",
    input: "Entrée",
    output: "Sortie",
    cacheRead: "Lecture cache",
    cacheWrite: "Écriture cache",
    priceSource: { admin: "Saisi", "models.dev": "models.dev", engine: "Sans prix" },
    engineNote: "Sans prix, c'est l'estimation du moteur qui compte, s'il en donne une.",
    save: "Enregistrer",
    saving: "Enregistrement…",
    reset: "Rétablir",
    resetDone: "Prix rétabli",
    resetTitle: (model: string) => `Rétablir le prix de ${model} ?`,
    resetBody: "Ton prix sera supprimé ; les coûts reprendront le prix de models.dev.",
    noModels: "Aucun modèle utilisé pour l'instant.",
  },
});
