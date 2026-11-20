import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { defineMessages, useLocale, useT } from "@/i18n";
import { ModelLogo } from "@/components/ProviderLogo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { planLimitsQuery } from "@/lib/queries";
import type { PlanLimits, PlanWindow } from "@/lib/api";

const WEEK = 7 * 24 * 60;

const messages = defineMessages({
  en: {
    names: { "claude-code": "Claude Code", codex: "Codex" } as Record<PlanLimits["id"], string>,
    window: (w: PlanWindow) => (w.model ? `${w.model}, week` : w.windowMins >= WEEK ? "Week" : `Session (${Math.round(w.windowMins / 60)} h)`),
    resets: (w: PlanWindow): string => (w.windowMins >= WEEK ? "New week" : "New session"),
    plan: "Plan",
    account: "Account",
    updated: (time: string) => `Updated at ${time}`,
  },
  fr: {
    names: { "claude-code": "Claude Code", codex: "Codex" } as Record<PlanLimits["id"], string>,
    window: (w: PlanWindow) => (w.model ? `${w.model}, semaine` : w.windowMins >= WEEK ? "Semaine" : `Session (${Math.round(w.windowMins / 60)} h)`),
    resets: (w: PlanWindow) => (w.windowMins >= WEEK ? "Nouvelle semaine" : "Nouvelle session"),
    plan: "Forfait",
    account: "Compte",
    updated: (time: string) => `Mis à jour à ${time}`,
  },
});

const planName = (plan: string | null) => (plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null);

/**
 * The « Abonnements » group of the sidebar (Figma, Atelier page, sidebar 543:4): one row per coding
 * subscription installed on the machine (Claude Code, Codex), its logo, its name, and a double ring
 * on the right, the week outside, the session inside. Hovering a row opens its details.
 */
export function usePlans() {
  return useQuery(planLimitsQuery).data?.plans ?? [];
}

/** The group's rows. */
export function PlanRows({ plans }: { plans: PlanLimits[] }) {
  return plans.map((p) => <PlanRow key={p.id} plan={p} />);
}

/**
 * The provider's own windows decide the rings: its weekly one outside, its session (the shortest
 * window, 5 hours for Claude and Codex) inside. A provider with a single window gets one ring.
 */
function rings(plan: PlanLimits) {
  const general = plan.windows.filter((w) => !w.model).sort((a, b) => b.windowMins - a.windowMins);
  const week = general[0];
  const session = general.length > 1 ? general[general.length - 1] : undefined;
  return { week, session };
}

/**
 * Green while there's room, yellow past the middle, red at the limit: drawn along the ring (or
 * the bar), so the closer to the limit, the redder its tip. Mixed in oklch: no muddy middle.
 */
const STOPS = "var(--success) 0%, var(--warning) 60%, var(--destructive) 100%";
const RING = (width: number) => `radial-gradient(farthest-side, transparent calc(100% - ${width}px), #000 calc(100% - ${width}px))`;

/** One ring, `size` px wide and 1.5 px thick, centred in the glyph. */
function Ring({ size, pct }: { size: number; pct: number }) {
  const box = { width: size, height: size, maskImage: RING(1.5), WebkitMaskImage: RING(1.5) };
  const used = Math.min(100, Math.max(0, pct));
  const cut = `conic-gradient(#000 ${used}%, transparent 0)`;
  return (
    <>
      <span className="absolute rounded-full bg-border" style={box} />
      {used > 0 && (
        <span
          className="absolute rounded-full"
          style={{
            ...box,
            background: `conic-gradient(in oklch, ${STOPS})`,
            maskImage: `${RING(1.5)}, ${cut}`,
            WebkitMaskImage: `${RING(1.5)}, ${cut}`,
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        />
      )}
    </>
  );
}

/** The card's bars: the same gradient, stretched over the whole track so the tip shows how close the limit is. */
const barStyle = (pct: number) => ({
  background: `linear-gradient(to right in oklch, ${STOPS})`,
  backgroundSize: `${pct > 0 ? 10000 / Math.min(100, pct) : 100}% 100%`,
});

function PlanRow({ plan }: { plan: PlanLimits }) {
  const t = useT(messages);
  // To the right of the sidebar, like the user menu: nothing in the list is hidden.
  const { isMobile } = useSidebar();
  const trigger = useRef<HTMLLIElement>(null);
  const pastSidebar = () => {
    const el = trigger.current;
    const bar = el?.closest('[data-slot="sidebar-inner"], [data-slot="sidebar"]');
    return el && bar ? bar.getBoundingClientRect().right - el.getBoundingClientRect().right + 8 : 8;
  };
  const { week, session } = rings(plan);
  return (
    <HoverCard>
      <HoverCardTrigger render={<SidebarMenuItem ref={trigger} />}>
        <SidebarMenuButton className="h-7.5 gap-2.5 text-ui" render={<div />}>
          <ModelLogo provider={plan.id} className="size-4" />
          <span className="min-w-0 flex-1 truncate">{t.names[plan.id]}</span>
          <span className="relative flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
            {week && <Ring size={14} pct={week.usedPercent} />}
            {session && <Ring size={8} pct={session.usedPercent} />}
          </span>
        </SidebarMenuButton>
      </HoverCardTrigger>
      <HoverCardContent side={isMobile ? "top" : "right"} align="start" sideOffset={isMobile ? 4 : pastSidebar} className="flex w-72 flex-col gap-4">
        <PlanDetails plan={plan} />
      </HoverCardContent>
    </HoverCard>
  );
}

function PlanDetails({ plan }: { plan: PlanLimits }) {
  const t = useT(messages);
  const locale = useLocale();
  const when = (iso: string) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return d.toLocaleString(locale, sameDay ? { hour: "2-digit", minute: "2-digit" } : { weekday: "long", hour: "2-digit", minute: "2-digit" });
  };
  const name = planName(plan.plan);
  return (
    <>
      <div className="flex items-center gap-2">
        <ModelLogo provider={plan.id} />
        <span className="font-medium">{t.names[plan.id]}</span>
      </div>
      {plan.windows.map((w) => (
        <ProgressPrimitive.Root key={`${w.windowMins}-${w.model}`} value={Math.min(100, w.usedPercent)} locale={locale} className="flex flex-wrap gap-x-3 gap-y-1.5">
          <ProgressLabel className="font-normal">{t.window(w)}</ProgressLabel>
          <ProgressValue />
          {/* bg-muted is the popover's own colour in dark mode: the track would vanish. */}
          <ProgressTrack className="bg-border">
            <ProgressIndicator style={barStyle(w.usedPercent)} />
          </ProgressTrack>
        </ProgressPrimitive.Root>
      ))}
      <Separator />
      {/* Label on the left, value on the right, like the model menu's rows (Figma, section 12). */}
      <dl className="flex flex-col gap-2">
        {plan.windows
          .filter((w) => w.resetsAt && !w.model)
          .map((w) => (
            <Row key={w.windowMins} label={t.resets(w)} value={when(w.resetsAt!)} />
          ))}
        {name && <Row label={t.plan} value={name} />}
        {plan.account && <Row label={t.account} value={plan.account} />}
      </dl>
      <p className="text-xs text-muted-foreground">{t.updated(new Date(plan.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }))}</p>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}
