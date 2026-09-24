import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileSlidesIcon,
  FileTableIcon,
  FileTextIcon,
  FileVideoIcon,
  PaletteIcon,
  type IconComponent,
} from "@/components/icons";
import type { FileKind } from "./files";

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

