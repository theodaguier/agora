import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ARTIFACT_SHARE_MODES, type ArtifactDto, type ArtifactShareMode } from "@agora/core";
import type { ReactElement } from "react";
import { BuildingIcon, CopyIcon, ExternalLinkIcon, GlobeIcon, HistoryIcon, LockIcon } from "@/components/icons";
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

const MODE_ICON = { private: LockIcon, org: BuildingIcon, link: GlobeIcon } satisfies Record<ArtifactShareMode, unknown>;

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
            <Button variant="outline" size="sm" disabled={!artifact}>
              {t.share}
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
                const Icon = MODE_ICON[mode];
                return (
                  <DropdownMenuRadioItem key={mode} value={mode} disabled={!artifact.canShare || share.isPending}>
                    <Icon />
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

/** The version shown, chosen among the artifact's (the latest when `value` is undefined). */
export function ArtifactVersionMenu({ artifactId, value, onChange }: { artifactId: string; value: number | undefined; onChange: (version: number | undefined) => void }) {
  const t = useT(messages);
  const { data: artifact } = useQuery(artifactQuery(artifactId));
  const versions = artifact?.versions ?? [];
  const latest = versions[0]?.version;
  const shown = value ?? latest;
  if (versions.length < 2) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            {shown ? `v${shown}` : t.versions}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t.versions}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(shown)} onValueChange={(v) => onChange(Number(v) === latest ? undefined : Number(v))}>
            {versions.map((v) => (
              <DropdownMenuRadioItem key={v.version} value={String(v.version)}>
                <HistoryIcon />
                <span className="flex-1">
                  {t.version(v.version)}
                  {v.version === latest && <span className="text-muted-foreground"> · {t.latest}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{listTime(new Date(v.createdAt))}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
