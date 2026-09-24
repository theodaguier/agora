import { circle, createIcon } from "./create-icon";
import { Dot, Hole } from "./shapes";

// Interface icons, solid rounded. A shape is filled and its details are hollowed out
// (`cut`); only what is a line by nature stays a stroke (arrows, chevrons, crosses).
// Stay on the 24px grid with ~2px of padding.

const gear =
  "M9.24 5.17Q9.84 4.92 9.99 4.3L10.18 3.5Q10.47 2.32 11.68 2.32L12.32 2.32Q13.53 2.32 13.82 3.5L14.01 4.3Q14.16 4.92 14.76 5.17L14.88 5.22Q15.47 5.47 16.02 5.13L16.72 4.71Q17.76 4.07 18.62 4.93L19.07 5.38Q19.93 6.24 19.29 7.28L18.87 7.98Q18.53 8.53 18.78 9.12L18.83 9.24Q19.08 9.84 19.7 9.99L20.5 10.18Q21.68 10.47 21.68 11.68L21.68 12.32Q21.68 13.53 20.5 13.82L19.7 14.01Q19.08 14.16 18.83 14.76L18.78 14.88Q18.53 15.47 18.87 16.02L19.29 16.72Q19.93 17.76 19.07 18.62L18.62 19.07Q17.76 19.93 16.72 19.29L16.02 18.87Q15.47 18.53 14.88 18.78L14.76 18.83Q14.16 19.08 14.01 19.7L13.82 20.5Q13.53 21.68 12.32 21.68L11.68 21.68Q10.47 21.68 10.18 20.5L9.99 19.7Q9.84 19.08 9.24 18.83L9.12 18.78Q8.53 18.53 7.98 18.87L7.28 19.29Q6.24 19.93 5.38 19.07L4.93 18.62Q4.07 17.76 4.71 16.72L5.13 16.02Q5.47 15.47 5.22 14.88L5.17 14.76Q4.92 14.16 4.3 14.01L3.5 13.82Q2.32 13.53 2.32 12.32L2.32 11.68Q2.32 10.47 3.5 10.18L4.3 9.99Q4.92 9.84 5.17 9.24L5.22 9.12Q5.47 8.53 5.13 7.98L4.71 7.28Q4.07 6.24 4.93 5.38L5.38 4.93Q6.24 4.07 7.28 4.71L7.98 5.13Q8.53 5.47 9.12 5.22Z";
const hexagon =
  "M10.41 3.34Q12 2.5 13.59 3.34L18.91 6.16Q20.5 7 20.5 8.8L20.5 15.2Q20.5 17 18.91 17.84L13.59 20.66Q12 21.5 10.41 20.66L5.09 17.84Q3.5 17 3.5 15.2L3.5 8.8Q3.5 7 5.09 6.16Z";
const triangle = "M10.76 5.29Q12 3 13.24 5.29L20.26 18.21Q21.5 20.5 18.9 20.5L5.1 20.5Q2.5 20.5 3.74 18.21Z";
const pin =
  "M9.5 3h5v4.9c0 .38.1.75.3 1.08L17 12.6c.4.66-.08 1.9-.85 1.9h-8.3c-.77 0-1.25-1.24-.85-1.9l2.2-3.62c.2-.33.3-.7.3-1.08z";

// — Actions & status

export const CheckIcon = createIcon("check", { line: <path d="M5 13.5l3.8 3.8L19 7" /> });

export const CheckCircleIcon = createIcon("check-circle", {
  fill: <circle cx="12" cy="12" r="10" />,
  cut: <path d="M8 12.5l2.7 2.7L16 9.5" />,
});

export const CloseIcon = createIcon("close", { line: <path d="M18 6L6 18M6 6l12 12" /> });

export const CloseCircleIcon = createIcon("close-circle", {
  fill: <circle cx="12" cy="12" r="10" />,
  cut: <path d="M14.5 9.5l-5 5m0-5l5 5" />,
});

export const PlusIcon = createIcon("plus", { line: <path d="M12 4.5v15M4.5 12h15" /> });

export const MoreIcon = createIcon("more", {
  solid: (
    <>
      <Dot cx={5.5} cy={12} r={1.75} />
      <Dot cx={12} cy={12} r={1.75} />
      <Dot cx={18.5} cy={12} r={1.75} />
    </>
  ),
});

export const SearchIcon = createIcon("search", {
  solid: <circle cx="11" cy="11" r="8" />,
  line: <path d="M17.5 17.5L21 21" />,
});

export const CopyIcon = createIcon("copy", {
  fill: <rect x="2.5" y="2.5" width="13" height="13" rx="3.5" />,
  cut: <rect x="8.5" y="8.5" width="13" height="13" rx="3.5" strokeWidth={3.5} />,
  solid: <rect x="8.5" y="8.5" width="13" height="13" rx="3.5" />,
});

export const DownloadIcon = createIcon("download", {
  line: (
    <>
      <path d="M12 3.5V16M7.5 11.5s3.3 4.5 4.5 4.5 4.5-4.5 4.5-4.5" />
      <path d="M3.5 16v1a3.5 3.5 0 0 0 3.5 3.5h10a3.5 3.5 0 0 0 3.5-3.5v-1" />
    </>
  ),
});

export const ExternalLinkIcon = createIcon("external-link", {
  fill: <rect x="2.5" y="5.5" width="16" height="16" rx="4" />,
  cut: <path d="M12.5 11.5L21 3M14.5 3H21v6.5" strokeWidth={5} />,
  line: <path d="M12.5 11.5L21 3M14.5 3H21v6.5" />,
});

export const TrashIcon = createIcon("trash", {
  fill: (
    <path d="M19 6.5l-.6 9.3c-.2 2.6-.2 3.9-.9 4.8a3.9 3.9 0 0 1-1.2 1.1c-.9.5-2.2.5-4.8.5s-3.9 0-4.8-.5a3.9 3.9 0 0 1-1.2-1.1c-.7-.9-.7-2.2-.9-4.8L4.9 6.5z" />
  ),
  cut: <path d="M9.5 16.5v-5M14.5 16.5v-5" />,
  line: <path d="M3 5h18M8.5 5l.8-1.8a2 2 0 0 1 1.8-1.2h1.8a2 2 0 0 1 1.8 1.2l.8 1.8" />,
});

export const ReplyIcon = createIcon("reply", {
  line: <path d="M9 5.5s-5.5 4.2-5.5 5.5 5.5 5.5 5.5 5.5M4 11h9a7 7 0 0 1 7 7v1.5" />,
});

export const ForwardIcon = createIcon("forward", {
  line: <path d="M15 5.5s5.5 4.2 5.5 5.5-5.5 5.5-5.5 5.5M20 11h-9a7 7 0 0 0-7 7v1.5" />,
});

export const UndoIcon = createIcon("undo", { line: <path d="M4 3.5v4.5h4.5M4.6 8A9 9 0 1 1 3 12" /> });

export const RedoIcon = createIcon("redo", { line: <path d="M20 3.5v4.5h-4.5M19.4 8A9 9 0 1 0 21 12" /> });

export const RefreshIcon = createIcon("refresh", {
  line: <path d="M3.5 12a8.5 8.5 0 0 1 15-5.5l2 2.5M20.5 4v5h-5M20.5 12a8.5 8.5 0 0 1-15 5.5l-2-2.5M3.5 20v-5h5" />,
});

export const LoaderIcon = createIcon("loader", { line: <path d="M21 12a9 9 0 1 1-6.2-8.56" /> });

export const PinIcon = createIcon("pin", {
  solid: <path d={pin} />,
  line: <path d="M8 3h8M12 14.5v6.5" />,
});

export const PinOffIcon = createIcon("pin-off", {
  fill: <path d={pin} />,
  cut: <path d="M3.5 3.5l17 17" strokeWidth={5} />,
  line: <path d="M8 3h8M12 17v4M3.5 3.5l17 17" />,
});

export const LogOutIcon = createIcon("log-out", {
  fill: <path d="M15 4.5A2.5 2.5 0 0 0 12.5 2H7a3.5 3.5 0 0 0-3.5 3.5v13A3.5 3.5 0 0 0 7 22h5.5a2.5 2.5 0 0 0 2.5-2.5z" />,
  cut: <path d="M9.5 12H21M18 8.5s3 2.6 3 3.5-3 3.5-3 3.5" strokeWidth={5} />,
  line: <path d="M9.5 12H21M18 8.5s3 2.6 3 3.5-3 3.5-3 3.5" />,
});

// — Arrows & chevrons

export const ArrowUpIcon = createIcon("arrow-up", { line: <path d="M12 20V4.5M6 10s4.4-6 6-6 6 6 6 6" /> });

export const ChevronDownIcon = createIcon("chevron-down", { line: <path d="M18 9s-4.4 6-6 6-6-6-6-6" /> });
export const ChevronUpIcon = createIcon("chevron-up", { line: <path d="M18 15s-4.4-6-6-6-6 6-6 6" /> });
export const ChevronLeftIcon = createIcon("chevron-left", { line: <path d="M15 6s-6 4.4-6 6 6 6 6 6" /> });
export const ChevronRightIcon = createIcon("chevron-right", { line: <path d="M9 6s6 4.4 6 6-6 6-6 6" /> });

export const ChevronsLeftIcon = createIcon("chevrons-left", {
  line: <path d="M11.5 18s-6-4.4-6-6 6-6 6-6M18.5 18s-6-4.4-6-6 6-6 6-6" />,
});

export const ChevronsRightIcon = createIcon("chevrons-right", {
  line: <path d="M12.5 18s6-4.4 6-6-6-6-6-6M5.5 18s6-4.4 6-6-6-6-6-6" />,
});

// — Objects & places

export const ClockIcon = createIcon("clock", {
  fill: <circle cx="12" cy="12" r="10" />,
  cut: <path d="M12 7.5V12l3 2" />,
});

/** Do not disturb. */
export const MoonIcon = createIcon("moon", {
  solid: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a.6.6 0 0 0-.8-.7A9.5 9.5 0 1 0 21.2 15a.6.6 0 0 0-.7-.8Z" />,
});

export const PlugIcon = createIcon("plug", {
  solid: <path d="M6 8.5A1.5 1.5 0 0 1 7.5 7h9A1.5 1.5 0 0 1 18 8.5V11a6 6 0 0 1-12 0z" />,
  line: <path d="M9.5 7V2.5M14.5 7V2.5M12 16.5v5" />,
});

export const PackageIcon = createIcon("package", {
  fill: <path d={hexagon} />,
  cut: <path d="M3.8 7.3L12 12l8.2-4.7M12 12v9.2M7.8 4.8l8.4 4.6" />,
});

export const LayersIcon = createIcon("layers", {
  solid: (
    <path d="M10.6 3.2a3.2 3.2 0 0 1 2.8 0l6.3 3.1c1 .5 1 1.9 0 2.4l-6.3 3.1a3.2 3.2 0 0 1-2.8 0L4.3 8.7c-1-.5-1-1.9 0-2.4z" />
  ),
  line: <path d="M3.5 12.5l7.1 3.5a3.2 3.2 0 0 0 2.8 0l7.1-3.5M3.5 17l7.1 3.5a3.2 3.2 0 0 0 2.8 0l7.1-3.5" />,
});

export const BookOpenIcon = createIcon("book-open", {
  fill: <path d="M12 6.5C10.5 5 8 4 3 4v14c5 0 7.5 1 9 2.5 1.5-1.5 4-2.5 9-2.5V4c-5 0-7.5 1-9 2.5z" />,
  cut: <path d="M12 6.5v14" />,
});

export const PuzzleIcon = createIcon("puzzle", {
  solid: (
    <path d="M4 9.5A2.5 2.5 0 0 1 6.5 7h3.2a2.4 2.4 0 1 1 4.6 0h2.2A2.5 2.5 0 0 1 19 9.5v2.7a2.4 2.4 0 1 1 0 4.6v1.7a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 4 18.5z" />
  ),
});

export const TaskListIcon = createIcon("task-list", {
  fill: (
    <>
      <rect x="2.5" y="3.5" width="6.5" height="6.5" rx="2" />
      <rect x="2.5" y="14" width="6.5" height="6.5" rx="2" />
    </>
  ),
  cut: (
    <>
      <path d="M4.3 6.9l1.2 1.2 1.9-2.2" strokeWidth={1.5} />
      <Hole d="M4.5 17a1 1 0 0 1 1-1h.5a1 1 0 0 1 1 1v.5a1 1 0 0 1-1 1h-.5a1 1 0 0 1-1-1z" />
    </>
  ),
  line: <path d="M12.5 6.75h8.5M12.5 17.25h8.5" />,
});

export const KeyboardIcon = createIcon("keyboard", {
  fill: <rect x="2" y="4.5" width="20" height="15" rx="4" />,
  cut: (
    <>
      <path d="M7.5 15h9" />
      <Hole d={circle(6.5, 9.5, 1)} />
      <Hole d={circle(10.2, 9.5, 1)} />
      <Hole d={circle(13.8, 9.5, 1)} />
      <Hole d={circle(17.5, 9.5, 1)} />
    </>
  ),
});

export const CommandIcon = createIcon("command", {
  line: <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />,
});

export const FileTextIcon = createIcon("file-text", {
  fill: <path d="M14 2H8a4.5 4.5 0 0 0-4.5 4.5v11A4.5 4.5 0 0 0 8 22h8a4.5 4.5 0 0 0 4.5-4.5V8.5z" />,
  cut: <path d="M14 2.5V6a2.5 2.5 0 0 0 2.5 2.5H20M8 13h8M8 17h5" />,
});

export const FilesIcon = createIcon("files", {
  fill: <rect x="8.5" y="2" width="12" height="15.5" rx="3.5" />,
  cut: <rect x="3.5" y="6.5" width="12" height="15.5" rx="3.5" strokeWidth={3.5} />,
  solid: <rect x="3.5" y="6.5" width="12" height="15.5" rx="3.5" />,
});

// A sheet with its folded corner; each kind of file hollows its sign out of the lower half.
const sheet = "M14 2H8a4.5 4.5 0 0 0-4.5 4.5v11A4.5 4.5 0 0 0 8 22h8a4.5 4.5 0 0 0 4.5-4.5V8.5z";
const fold = "M14 2.5V6a2.5 2.5 0 0 0 2.5 2.5H20";

export const FileIcon = createIcon("file", { fill: <path d={sheet} />, cut: <path d={fold} /> });

export const FileImageIcon = createIcon("file-image", {
  fill: <path d={sheet} />,
  cut: (
    <>
      <path d={fold} />
      <path d="M7 18.5l2.6-2.8a1.3 1.3 0 0 1 1.9 0L15 19.5" />
      <Hole d={circle(14.8, 13.3, 1.4)} />
    </>
  ),
});

export const FileVideoIcon = createIcon("file-video", {
  fill: <path d={sheet} />,
  cut: (
    <>
      <path d={fold} />
      <Hole d="M10 12.6v5.3a.9.9 0 0 0 1.35.78l4.2-2.65a.9.9 0 0 0 0-1.56l-4.2-2.65A.9.9 0 0 0 10 12.6z" />
    </>
  ),
});

export const FileAudioIcon = createIcon("file-audio", {
  fill: <path d={sheet} />,
  cut: (
    <>
      <path d={fold} />
      <path d="M11.5 17.5v-5.8l3.5-1" />
      <Hole d={circle(9.9, 17.6, 1.7)} />
    </>
  ),
});

export const FileTableIcon = createIcon("file-table", {
  fill: <path d={sheet} />,
  cut: <path d={`${fold}M7.5 12h9v6.5h-9zM7.5 15.25h9M11.5 12v6.5`} />,
});

export const FileSlidesIcon = createIcon("file-slides", {
  fill: <path d={sheet} />,
  cut: <path d={`${fold}M7.5 12h9v5h-9zM10.5 19h3`} />,
});

export const FileCodeIcon = createIcon("file-code", {
  fill: <path d={sheet} />,
  cut: <path d={`${fold}M9.5 12.5l-2 2.25 2 2.25M14.5 12.5l2 2.25-2 2.25`} />,
});

export const FileArchiveIcon = createIcon("file-archive", {
  fill: <path d={sheet} />,
  cut: (
    <>
      <path d={`${fold}M10 3.5v1M12 6v1M10 8.5v1M12 11v1`} />
      <Hole d="M9.6 14h2.8v2.8a1.4 1.4 0 0 1-2.8 0z" />
    </>
  ),
});

export const FolderIcon = createIcon("folder", {
  fill: <path d="M2.5 7.5A3.5 3.5 0 0 1 6 4h2.6a2.5 2.5 0 0 1 1.9.9l1 1.2a2.5 2.5 0 0 0 1.9.9H18a3.5 3.5 0 0 1 3.5 3.5v6A3.5 3.5 0 0 1 18 20H6a3.5 3.5 0 0 1-3.5-3.5z" />,
  cut: <path d="M2.5 10.5h19" />,
});

export const InboxIcon = createIcon("inbox", {
  fill: <rect x="2.5" y="3.5" width="19" height="17" rx="4.5" />,
  cut: <path d="M2.5 13.5h4.2a1.3 1.3 0 0 1 1.2.8l.3.8a2 2 0 0 0 1.9 1.4h3.8a2 2 0 0 0 1.9-1.4l.3-.8a1.3 1.3 0 0 1 1.2-.8h4.2" />,
});

export const KeyIcon = createIcon("key", {
  fill: <circle cx="8" cy="15.5" r="5.5" />,
  cut: <Hole d={circle(6.8, 16.7, 1.5)} />,
  line: <path d="M12 11.5L20.5 3M18 5.5L20.5 8M15 8.5l2 2" />,
});

export const LockIcon = createIcon("lock", {
  fill: <rect x="3.5" y="9.5" width="17" height="12" rx="4" />,
  cut: <path d="M12 14.5v2.5" />,
  line: <path d="M7.5 9.5V7.5a4.5 4.5 0 0 1 9 0v2" />,
});

export const MailIcon = createIcon("mail", {
  fill: <rect x="2" y="4" width="20" height="16" rx="4.5" />,
  cut: <path d="M6.5 9l4.2 2.8a2.3 2.3 0 0 0 2.6 0L17.5 9" />,
});

export const MicIcon = createIcon("mic", {
  solid: <rect x="8" y="2" width="8" height="13" rx="4" />,
  line: <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />,
});

export const WaveformIcon = createIcon("waveform", { line: <path d="M3 10.5v3M7.5 7v10M12 3.5v17M16.5 7v10M21 10.5v3" /> });

export const AtIcon = createIcon("at", {
  line: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" />
    </>
  ),
});

export const PaletteIcon = createIcon("palette", {
  fill: (
    <path d="M12 22A10 10 0 1 1 22 12c0 2.4-2 3.9-4.2 3.9h-1.7c-1.3 0-2.1 1.4-1.4 2.5l.3.5c.9 1.4-.3 3.1-3 3.1z" />
  ),
  cut: (
    <>
      <Hole d={circle(7.5, 12, 1.4)} />
      <Hole d={circle(9, 7.5, 1.4)} />
      <Hole d={circle(14.5, 7.5, 1.4)} />
    </>
  ),
});

export const ChartIcon = createIcon("chart", {
  fill: <rect x="2.5" y="2.5" width="19" height="19" rx="5" />,
  cut: <path d="M8 16.5v-4M12 16.5v-9M16 16.5v-6" />,
});

export const GridIcon = createIcon("grid", {
  solid: (
    <>
      <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2.75" />
      <rect x="13" y="2.5" width="8.5" height="8.5" rx="2.75" />
      <rect x="2.5" y="13" width="8.5" height="8.5" rx="2.75" />
      <rect x="13" y="13" width="8.5" height="8.5" rx="2.75" />
    </>
  ),
});

export const PanelLeftIcon = createIcon("panel-left", {
  fill: <rect x="2" y="3" width="20" height="18" rx="4.5" />,
  cut: <path d="M9 3v18" />,
});

export const SettingsIcon = createIcon("settings", {
  fill: <path d={gear} />,
  cut: <Hole d={circle(12, 12, 3.25)} />,
});

export const SlidersIcon = createIcon("sliders", {
  solid: (
    <>
      <circle cx="15" cy="7" r="3" />
      <circle cx="10" cy="17" r="3" />
    </>
  ),
  line: <path d="M3 7h9.5M17.5 7H21M3 17h4.5M12.5 17H21" />,
});

// — People & agents

export const SmartphoneIcon = createIcon("smartphone", {
  fill: <rect x="5.5" y="2" width="13" height="20" rx="3.5" />,
  cut: <path d="M10.5 18.5h3" />,
});

export const CameraIcon = createIcon("camera", {
  fill: (
    <path d="M9.2 3.5h5.6c.9 0 1.6.5 2 1.3l.6 1.2h1.1c2 0 3.5 1.6 3.5 3.5v7.5c0 2-1.6 3.5-3.5 3.5H5.5C3.6 20.5 2 19 2 17V9.5C2 7.6 3.6 6 5.5 6h1.1l.6-1.2c.4-.8 1.1-1.3 2-1.3z" />
  ),
  cut: <circle cx="12" cy="13" r="4.25" strokeWidth={2} />,
  solid: <circle cx="12" cy="13" r="2.25" />,
});

export const UserIcon = createIcon("user", {
  solid: (
    <>
      <circle cx="12" cy="7.5" r="4.5" />
      <path d="M4 20.5c0-4.3 3.6-7 8-7s8 2.7 8 7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    </>
  ),
});

const person = (
  <>
    <circle cx="9" cy="7.5" r="4" />
    <path d="M2 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
  </>
);

export const UsersIcon = createIcon("users", {
  fill: (
    <>
      <circle cx="16.5" cy="7.5" r="3.5" />
      <path d="M12.5 14.2c1-.5 2.2-.7 3.5-.7 3.4 0 6 2.4 6 5.8a1 1 0 0 1-1 1.2h-9z" />
    </>
  ),
  cut: <g strokeWidth={3}>{person}</g>,
  solid: person,
});

/** Nobody: the two people of UsersIcon, crossed out (access removed from everyone). */
export const UsersSlashIcon = createIcon("users-slash", {
  fill: (
    <>
      <circle cx="16.5" cy="7.5" r="3.5" />
      <path d="M12.5 14.2c1-.5 2.2-.7 3.5-.7 3.4 0 6 2.4 6 5.8a1 1 0 0 1-1 1.2h-9z" />
      {person}
    </>
  ),
  cut: <path d="M3 3l18 18" strokeWidth={4.5} />,
  line: <path d="M3 3l18 18" />,
});

export const InfoIcon = createIcon("info", {
  fill: <circle cx="12" cy="12" r="10" />,
  cut: (
    <>
      <path d="M12 11v5.5" />
      <Hole d={circle(12, 7.7, 1.1)} />
    </>
  ),
});

export const UserPlusIcon = createIcon("user-plus", {
  solid: person,
  line: <path d="M19 8v6M16 11h6" />,
});

/** Not allowed: a disc crossed by a hollow bar. */
export const BanIcon = createIcon("ban", {
  fill: <circle cx="12" cy="12" r="10" />,
  cut: <path d="M6.5 6.5l11 11" />,
});

export const BuildingIcon = createIcon("building", {
  fill: <path d="M6.5 3h11A2.5 2.5 0 0 1 20 5.5V21H4V5.5A2.5 2.5 0 0 1 6.5 3z" />,
  cut: <path d="M8.5 7.5h1.5m4 0h1.5m-7 4h1.5m4 0h1.5M10.5 21v-3.5h3V21" />,
});

export const BotIcon = createIcon("bot", {
  fill: <rect x="3.5" y="7" width="17" height="14" rx="5" />,
  cut: <path d="M9 12.5v2M15 12.5v2" strokeWidth={2} />,
  solid: <Dot cx={12} cy={3.5} r={1.5} />,
  line: <path d="M12 5v2M1.5 12.5v3.5M22.5 12.5v3.5" />,
});

export const BrainIcon = createIcon("brain", {
  fill: (
    <>
      <path d="M12 5.5A3 3 0 0 0 6.5 4.2 3 3 0 0 0 4.3 8.3a3.5 3.5 0 0 0-.1 6 3.2 3.2 0 0 0 3 5.2A2.8 2.8 0 0 0 12 20z" />
      <path d="M12 5.5a3 3 0 0 1 5.5-1.3 3 3 0 0 1 2.2 4.1 3.5 3.5 0 0 1 .1 6 3.2 3.2 0 0 1-3 5.2A2.8 2.8 0 0 1 12 20z" />
    </>
  ),
  cut: (
    <path
      d="M12 5v15.5M5 9c.9.6 2 .8 3.2.6M19 9c-.9.6-2 .8-3.2.6M5 14.3c1-.6 2.2-.7 3.3-.3M19 14.3c-1-.6-2.2-.7-3.3-.3"
      strokeWidth={1.5}
    />
  ),
});

export const SparklesIcon = createIcon("sparkles", {
  solid: (
    <>
      <path d="M10 4.5c.5 4.6 3.4 7.5 8 8-4.6.5-7.5 3.4-8 8-.5-4.6-3.4-7.5-8-8 4.6-.5 7.5-3.4 8-8z" />
      <path d="M18.5 2c.25 1.6 1 2.35 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.15 2.25-.9 2.5-2.5z" />
    </>
  ),
});

// — Alerts

export const WarningIcon = createIcon("warning", {
  fill: <path d={triangle} />,
  cut: (
    <>
      <path d="M12 9.5v4" />
      <Hole d={circle(12, 16.8, 1.1)} />
    </>
  ),
});

export const ShieldAlertIcon = createIcon("shield-alert", {
  fill: (
    <path d="M12 22c-5.3-1.9-8.5-5.6-8.5-11V5.7c0-.7.5-1.3 1.1-1.5l6.7-2a2.2 2.2 0 0 1 1.4 0l6.7 2c.6.2 1.1.8 1.1 1.5V11c0 5.4-3.2 9.1-8.5 11z" />
  ),
  cut: (
    <>
      <path d="M12 7.5v5" />
      <Hole d={circle(12, 15.8, 1.1)} />
    </>
  ),
});
