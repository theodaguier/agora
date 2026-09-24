import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Chip, Popover, Surface, Typography, useToast } from "heroui-native";
import { useContext, type ComponentProps, type ReactNode } from "react";
import { Linking, View, type ViewProps } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useResolveClassNames } from "uniwind";
import { attachmentSource, Image, saveAttachment } from "@/components/attachment-files";
import {
  CodeIcon,
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileSlidesIcon,
  FileTableIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderIcon,
  GlobeIcon,
  PaletteIcon,
  type IconComponent,
  type IconProps,
} from "@/components/icons";
import { useConversationFile } from "@/lib/conversation-files";
import { defineMessages } from "@/lib/i18n";
import { basename, fileKind } from "@/lib/files";
import { withTap } from "@/lib/haptics";
import { isFolderPath, splitEntities, type Repo } from "@/lib/links";
import { cx, TextStyleContext, boxText, FILE_ICONS, LinkClassContext } from "@/components/text-style";
import { contentKeys } from "@/lib/utils";

/*
 * apps/web/src/components/TextEntities.tsx. What the web shows on hover shows on a tap here
 * (an image's preview, in a sheet); a click becomes a tap.
 */

const messages = defineMessages({
  en: { copyPath: "Copy path", copyName: "Copy name", pathCopied: "Path copied", nameCopied: "Name copied" },
  fr: { copyPath: "Copier le chemin", copyName: "Copier le nom", pathCopied: "Chemin copié", nameCopied: "Nom copié" },
});

/* ---------- Inherited text style ---------- */

/** Adds classes to the inherited text style of what's inside. */
export function TextStyle({ className, children }: { className?: string; children: ReactNode }) {
  const inherited = useContext(TextStyleContext);
  return <TextStyleContext.Provider value={cx(inherited, className)}>{children}</TextStyleContext.Provider>;
}

/** Starts over from the base style: what's shown in a sheet isn't inside the message's text. */
export function ResetTextStyle({ children }: { children: ReactNode }) {
  return <TextStyleContext.Provider value={undefined}>{children}</TextStyleContext.Provider>;
}

/** HeroUI's Typography with the inherited style. */
export function Text({ className, ...props }: ComponentProps<typeof Typography>) {
  const inherited = useContext(TextStyleContext);
  return <Typography className={cx("text-body text-foreground", inherited, className)} {...props} />;
}

/* ---------- Text metrics ---------- */

/**
 * The web sizes chips in `em`, relative to the text around them; React Native only takes pixels.
 * `em(0.88)`: 0.88 times the font size of the text around (TextStyleContext).
 */
export function useEm() {
  const inherited = useContext(TextStyleContext);
  const { fontSize } = useResolveClassNames(cx("text-body", inherited)) as { fontSize?: number };
  return (k: number) => Math.round((fontSize ?? 17) * k * 100) / 100;
}

/**
 * A box inside a line of text (chip, mention, task). React Native sits its bottom on the baseline,
 * where the web centers it on the text: it is lowered by `drop` em (the descent of the text).
 */
export function InlineBox({ drop = 0.27, className, style, ...props }: ViewProps & { drop?: number }) {
  const em = useEm();
  return <View className={cx("flex-row items-center", className)} style={[{ transform: [{ translateY: em(drop) }] }, style]} {...props} />;
}

/* ---------- Chips ---------- */

const chipIcon = "text-muted";

/** The inside of a chip: its icon, then its label as code at 0.88em, like the web's `chipClass`. */
function ChipLabel({ icon: Icon, mono = true, children }: { icon?: IconComponent; mono?: boolean; children: ReactNode }) {
  const em = useEm();
  const k = mono ? 0.88 : 1;
  return (
    <>
      {Icon && <Icon className={chipIcon} size={em(k * 1.05)} />}
      {mono ? (
        <Typography type="code" className="shrink" style={boxText(em, k)}>
          {children}
        </Typography>
      ) : (
        <Chip.Label className="shrink" style={boxText(em, k)}>
          {children}
        </Chip.Label>
      )}
    </>
  );
}

/**
 * A file named in a message: a path, a name ("rapport.pdf") or a web address of a file.
 * A web address, or a name matching a file of the conversation, opens it (an image shows its
 * preview in a sheet, as it does on hover on the web); otherwise the file is on someone's computer,
 * which the phone can't reach, and a tap copies the path or the name.
 */
export function FileChip({ name, path, url, children }: { name: string; path?: string; url?: string; children: ReactNode }) {
  const t = messages;
  const { toast } = useToast();
  const sent = useConversationFile(basename(path ?? name));
  const kind = fileKind(name);
  const Icon = path && isFolderPath(path) ? FolderIcon : FILE_ICONS[kind];

  if (url || sent) {
    if (kind === "image") {
      return (
        <InlineBox>
          <Popover presentation="bottom-sheet">
            <Popover.Trigger asChild>
              <Chip size="sm" variant="secondary" color="default" accessibilityRole="imagebutton" accessibilityLabel={name}>
                <ChipLabel icon={Icon}>{children}</ChipLabel>
              </Chip>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Overlay />
              <Popover.Content presentation="bottom-sheet" contentContainerClassName="gap-3 px-4 pb-8">
                <ResetTextStyle>
                  <Popover.Title numberOfLines={1}>{name}</Popover.Title>
                  <Surface variant="secondary" className="overflow-hidden p-0">
                    <Image source={url ? { uri: url } : attachmentSource(sent!)} contentFit="contain" className="h-80 w-full" accessibilityLabel={name} />
                  </Surface>
                </ResetTextStyle>
              </Popover.Content>
            </Popover.Portal>
          </Popover>
        </InlineBox>
      );
    }
    // A web address opens in the browser; a file of the conversation is downloaded, then handed to the share sheet.
    const open = () => (url ? Linking.openURL(url) : saveAttachment(sent!));
    return (
      <InlineBox>
        <Chip size="sm" variant="secondary" color="default" accessibilityRole="link" accessibilityLabel={name} onPress={open}>
          <ChipLabel icon={Icon}>{children}</ChipLabel>
        </Chip>
      </InlineBox>
    );
  }

  const copy = () => {
    Clipboard.setStringAsync(path ?? name).then(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: path ? t.pathCopied : t.nameCopied });
    });
  };
  // The web's tooltip ("Copy path", then "Copied") becomes the accessibility label, then a toast.
  return (
    <InlineBox>
      <Chip
        size="sm"
        variant="secondary"
        color="default"
        accessibilityRole="button"
        accessibilityLabel={path ? t.copyPath : t.copyName}
        onPress={copy}
      >
        <ChipLabel icon={Icon}>{children}</ChipLabel>
      </Chip>
    </InlineBox>
  );
}

/** A file or folder path, as written. */
export function PathChip({ path, children }: { path: string; children: ReactNode }) {
  return (
    <FileChip name={basename(path)} path={path}>
      {children}
    </FileChip>
  );
}

/** GitHub's mark (the web's @lobehub/icons-static-svg github.svg), in the text color. */
function GitHubLogo({ className, size = 16 }: IconProps) {
  const { color } = useResolveClassNames(className ?? "") as { color?: string };
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" color={color} fill="currentColor">
      <Path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </Svg>
  );
}

/**
 * A repository, as GitHub shows one in text: its logo, "owner/name" and the issue or commit pointed to.
 * `label`: shown as written instead ("git@github.com:…", a clone address meant to be copied).
 */
export function RepoChip({ url, repo, label }: { url: string; repo: Repo; label?: string }) {
  const em = useEm();
  const Logo = repo.host === "github" ? GitHubLogo : CodeIcon;
  return (
    <InlineBox>
      <Chip size="sm" variant="secondary" color="default" accessibilityRole="link" accessibilityLabel={url} onPress={withTap(() => Linking.openURL(url))}>
        <Logo className="text-foreground" size={em(1)} />
        <Chip.Label className="shrink" style={boxText(em, 1)}>
          {label ?? (
            <>
              {repo.owner}/{repo.name}
              {repo.ref && (
                <Typography color="muted" style={boxText(em, 1)}>
                  {repo.ref}
                </Typography>
              )}
            </>
          )}
        </Chip.Label>
      </Chip>
    </InlineBox>
  );
}

/** A port or a local address ("3001", "localhost:5173"): opens it in the browser. */
export function PortChip({ url, children }: { url: string; children: ReactNode }) {
  return (
    <InlineBox>
      <Chip size="sm" variant="secondary" color="default" accessibilityRole="link" accessibilityLabel={url} onPress={withTap(() => Linking.openURL(url))}>
        <ChipLabel icon={GlobeIcon}>{children}</ChipLabel>
      </Chip>
    </InlineBox>
  );
}

/**
 * A small square of the color, before its value: the color is the message's content (a value written
 * in it), not a style of the app. The value is checked as hex before it reaches the style.
 */
export function Swatch({ color }: { color: string }) {
  const em = useEm();
  const size = em(0.88 * 0.85);
  return <Surface className="mr-1 p-0" style={{ width: size, height: size, backgroundColor: color }} />;
}

/** A color value in text: its swatch, then the value in monospace. */
export function ColorValue({ color, children }: { color: string; children: ReactNode }) {
  const em = useEm();
  return (
    <Text type="code" style={{ fontSize: em(0.88) }}>
      {/^#[0-9a-f]{6,8}$/i.test(color) && (
        <InlineBox drop={0.08}>
          <Swatch color={color} />
        </InlineBox>
      )}
      {children}
    </Text>
  );
}

/**
 * A link inside text, in HeroUI's link color; web pages open in the browser, "mailto:" and "tel:" in
 * their app. The color goes through the inherited style, so that bold or code inside the link keeps it.
 */
export function TextLink({ url, children }: { url?: string; children: ReactNode }) {
  return (
    <TextStyle className={useContext(LinkClassContext)}>
      <Text accessibilityRole="link" onPress={url ? () => Linking.openURL(url) : undefined}>
        {children}
      </Text>
    </TextStyle>
  );
}

/** Plain text with its web addresses, emails and phone numbers as links, its paths and colors marked. */
export function EntityText({ text }: { text: string }) {
  const parts = splitEntities(text);
  const keys = contentKeys(parts, (p) => (typeof p === "string" ? `t:${p}` : `${p.kind}:${p.text}`));
  return <>{parts.map((p, i) => {
    if (typeof p === "string") return p;
    switch (p.kind) {
      case "link":
      case "phone":
        return (
          <TextLink key={keys[i]} url={p.url}>
            {p.text}
          </TextLink>
        );
      case "repo":
        return <RepoChip key={keys[i]} url={p.url} repo={p} label={p.text.startsWith("git@") ? p.text : undefined} />;
      case "port":
        return (
          <PortChip key={keys[i]} url={p.url}>
            {p.text}
          </PortChip>
        );
      case "file":
        return (
          <FileChip key={keys[i]} name={p.name} url={p.url}>
            {p.url ? p.name : p.text}
          </FileChip>
        );
      case "path":
        return (
          <PathChip key={keys[i]} path={p.path}>
            {p.text}
          </PathChip>
        );
      case "color":
        return (
          <ColorValue key={keys[i]} color={p.color}>
            {p.text}
          </ColorValue>
        );
    }
  })}</>;
}
