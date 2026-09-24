import { createContext } from "react";
import { FileArchiveIcon, FileAudioIcon, FileCodeIcon, FileIcon, FileImageIcon, FileSlidesIcon, FileTableIcon, FileTextIcon, FileVideoIcon, PaletteIcon, type IconComponent } from "@/components/icons";
import { type FileKind } from "@/lib/files";
import { linkClass } from "@/lib/links";

/** `cn` of lib/utils, which already knows the iOS text styles of global.css (`text-body` is a size, not a color). */
export { cn as cx } from "@/lib/utils";

/**
 * Text in React Native only inherits from a parent Text, not from a View: the classes a block sets
 * for the text inside it (a quote's color, a table's size) go through this context, like CSS
 * inheritance on the web. Base: iOS body text in `foreground`.
 */
export const TextStyleContext = createContext<string | undefined>(undefined);

/** Font size and line height of text inside an inline box, `k` em high: the web's content box of an inline element. */
export const boxText = (em: (k: number) => number, k: number) => ({ fontSize: em(k), lineHeight: Math.round(em(k) * 1.25) });

export const FILE_ICONS: Record<FileKind, IconComponent> = {
  image: FileImageIcon,
  video: FileVideoIcon,
  audio: FileAudioIcon,
  pdf: FileTextIcon,
  document: FileTextIcon,
  spreadsheet: FileTableIcon,
  presentation: FileSlidesIcon,
  archive: FileArchiveIcon,
  code: FileCodeIcon,
  design: PaletteIcon,
  file: FileIcon,
};

/** Color of links in a text: HeroUI's link color, or another one on a colored bubble (white on the accent). */
export const LinkClassContext = createContext(linkClass);

/** The text sits on the accent color (a bubble of yours): links and mentions turn white. */
export const OnAccentContext = createContext(false);
