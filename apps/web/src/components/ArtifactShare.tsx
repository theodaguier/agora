import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ARTIFACT_SHARE_MODES, type ArtifactDto, type ArtifactShareMode } from "@agora/core";
import type { ReactElement } from "react";
import type { StatusTone } from "@agora/core";
import { BuildingIcon, CopyIcon, ExternalLinkIcon, GlobeIcon, LockIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { defineMessages, useT } from "@/i18n";
import { artifactQuery, artifactShareUrl, artifactsQuery, setArtifactShare } from "@/lib/artifacts";
import { listTime } from "@/lib/dates";
import { copyText } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { toneColor, toneText } from "@/components/views/tone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const messages = defineMessages({
  en: {
    share: "Share",
    access: "Who can open the link",
    modes: { private: "Conversation members", org: "Everyone in the organization", link: "Anyone with the link" } satisfies Record<ArtifactShareMode, string>,
    copy: "Copy link",
    open: "Open link",
    changed: { private: "Only the conversation's members can open it now", org: "Everyone in the organization can open it now", link: "Anyone with the link can open it now" } satisfies Record<ArtifactShareMode, string>,
    readOnly: "Only the conversation's members can change this.",
    versions: "Versions",
    version: (n: number) => `Version ${n}`,
    latest: "latest",
  },
  fr: {
    share: "Partager",
    access: "Qui peut ouvrir le lien",
    modes: { private: "Membres de la conversation", org: "Toute l'organisation", link: "Toute personne disposant du lien" },
    copy: "Copier le lien",
    open: "Ouvrir le lien",
    changed: { private: "Seuls les membres de la conversation peuvent l'ouvrir", org: "Toute l'organisation peut l'ouvrir", link: "Toute personne disposant du lien peut l'ouvrir" },
    readOnly: "Seuls les membres de la conversation peuvent le modifier.",
    versions: "Versions",
    version: (n: number) => `Version ${n}`,
    latest: "dernière",
  },
});

export const SHARE_MODE_ICON = { private: LockIcon, org: BuildingIcon, link: GlobeIcon } satisfies Record<ArtifactShareMode, unknown>;

/** How open the link is: green when kept in the conversation, blue in the organization, orange to anyone with it. */
export const SHARE_TONE = { private: "success", org: "info", link: "warning" } satisfies Record<ArtifactShareMode, StatusTone>;

const accessMessages = defineMessages({
  en: { access: { private: "Only this conversation can open it", org: "Everyone in the organization can open it", link: "Anyone with the link can open it" } satisfies Record<ArtifactShareMode, string> },
  fr: { access: { private: "Seule cette conversation peut l'ouvrir", org: "Toute l'organisation peut l'ouvrir", link: "Toute personne disposant du lien peut l'ouvrir" } },
});

/** Who can open the artifact, in its mode's tone (a block's footer note). */
export function ArtifactAccess({ artifactId }: { artifactId: string }) {
  const t = useT(accessMessages);
  const { data: artifact } = useQuery(artifactQuery(artifactId));
  const Icon = artifact ? SHARE_MODE_ICON[artifact.shareMode] : null;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs", artifact ? toneText[SHARE_TONE[artifact.shareMode]] : "text-muted-foreground")}>
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="truncate">{artifact ? t.access[artifact.shareMode] : ""}</span>
    </span>
  );
}

/** Who the share link opens to, and the link itself. */
export function ArtifactShareMenu({ artifactId, trigger }: { artifactId: string; trigger?: ReactElement }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const { data: artifact } = useQuery(artifactQuery(artifactId));
  const share = useMutation({
    mutationFn: (mode: ArtifactShareMode) => setArtifactShare(artifactId, mode),
    onSuccess: (a) => {
      qc.setQueryData(artifactQuery(artifactId).queryKey, a);
      void qc.invalidateQueries({ queryKey: artifactsQuery.queryKey });
    },
    meta: { success: (a: ArtifactDto) => t.changed[a.shareMode] },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <Button variant="ghost" size="icon-sm" aria-label={t.share} title={t.share} disabled={!artifact}>
              <GlobeIcon />
            </Button>
          )
        }
      />
      {artifact && (
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{artifact.canShare ? t.access : t.readOnly}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={share.isPending ? share.variables : artifact.shareMode} onValueChange={(v) => share.mutate(v as ArtifactShareMode)}>
              {ARTIFACT_SHARE_MODES.map((mode) => {
                const Icon = SHARE_MODE_ICON[mode];
                return (
                  <DropdownMenuRadioItem key={mode} value={mode} disabled={!artifact.canShare || share.isPending}>
                    <Icon {...toneColor[SHARE_TONE[mode]]} />
                    {t.modes[mode]}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void copyText(artifactShareUrl(artifact))}>
            <CopyIcon />
            {t.copy}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.open(artifactShareUrl(artifact), "_blank", "noopener")}>
            <ExternalLinkIcon />
            {t.open}
          </DropdownMenuItem>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}

/** The version shown, a Select of the artifact's versions (the latest when `value` is undefined). */
export function ArtifactVersionSelect({ artifactId, value, onChange }: { artifactId: string; value: number | undefined; onChange: (version: number | undefined) => void }) {
  const t = useT(messages);
  const { data: artifact } = useQuery(artifactQuery(artifactId));
  const versions = artifact?.versions ?? [];
  const latest = versions[0]?.version;
  const shown = value ?? latest;
  // One version: nothing to choose.
  if (versions.length < 2 || shown === undefined) return null;
  return (
    <Select
      items={versions.map((v) => ({ value: String(v.version), label: t.version(v.version) }))}
      value={String(shown)}
      onValueChange={(v) => v && onChange(Number(v) === latest ? undefined : Number(v))}
    >
      {/* The trigger says the version only; the list adds when each was written. */}
      <SelectTrigger size="sm" aria-label={t.versions}>
        <SelectValue>{(v: string) => t.version(Number(v))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.version} value={String(v.version)}>
            {t.version(v.version)}
            <span className="text-subtle-foreground">{v.version === latest ? t.latest : listTime(new Date(v.createdAt))}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
