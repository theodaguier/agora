/* Ported from apps/web/src/components/icons/tools.tsx: same icons, same paths. */
import { Circle, Path, Rect } from "react-native-svg";
import { createElement } from "react";
import { circle, createIcon, Dot, Hole, type IconComponent, type IconProps } from "./create-icon";
import { BrainIcon, ClockIcon, KeyboardIcon, PlugIcon } from "./ui";

// Icons for the tools an agent calls during a reply, solid rounded like the rest.
// A file tool is a solid document with a badge detached from its bottom-right corner
// (eye, pencil, magnifier) so the family reads at 14px.

const doc = "M14 2H8a4.5 4.5 0 0 0-4.5 4.5v11A4.5 4.5 0 0 0 8 22h8a4.5 4.5 0 0 0 4.5-4.5V8.5z";
const fold = "M14 2.5V6a2.5 2.5 0 0 0 2.5 2.5H20";
const lens = "M13 18c.9-1.9 2.6-3.2 4.5-3.2S21.1 16.1 22 18c-.9 1.9-2.6 3.2-4.5 3.2S13.9 19.9 13 18z";
const pencil = "M12.5 22v-2.3c0-.3.1-.6.4-.8l5.6-5.6a1.6 1.6 0 0 1 2.2 0l.5.5a1.6 1.6 0 0 1 0 2.2l-5.6 5.6c-.2.3-.5.4-.8.4z";
const magnifier = "M19.2 19.2L22 22";
const meridians = "M12 2.5c-2.5 2.6-3.5 5.8-3.5 9.5s1 6.9 3.5 9.5M12 2.5c2.5 2.6 3.5 5.8 3.5 9.5s-1 6.9-3.5 9.5M2.5 9h19M2.5 15h19";
const sparkle = "M18 12.5c.3 2.6 1.9 4.2 4.5 4.5-2.6.3-4.2 1.9-4.5 4.5-.3-2.6-1.9-4.2-4.5-4.5 2.6-.3 4.2-1.9 4.5-4.5z";

export const TerminalIcon = createIcon("terminal", {
  fill: <Rect x="2" y="3" width="20" height="18" rx="4.5" />,
  cut: <Path d="M7 9s3 2.25 3 3-3 3-3 3M13 15h4" />,
});

export const CodeIcon = createIcon("code", {
  line: <Path d="M17 7.5s4 3.4 4 4.5-4 4.5-4 4.5M7 7.5S3 10.9 3 12s4 4.5 4 4.5M14.5 4.5l-5 15" />,
});

export const FileReadIcon = createIcon("file-read", {
  fill: <Path d={doc} />,
  cut: (
    <>
      <Path d={fold} />
      <Path d={lens} fill="black" strokeWidth={3.5} />
    </>
  ),
  solid: <Dot cx={17.5} cy={18} r={1.4} />,
  line: <Path d={lens} />,
});

export const FileEditIcon = createIcon("file-edit", {
  fill: <Path d={doc} />,
  cut: (
    <>
      <Path d={fold} />
      <Path d={pencil} fill="black" strokeWidth={3.5} />
    </>
  ),
  solid: <Path d={pencil} />,
});

export const FileSearchIcon = createIcon("file-search", {
  fill: <Path d={doc} />,
  cut: (
    <>
      <Path d={fold} />
      <Hole d={circle(16.5, 16.5, 3.5)} stroke="black" strokeWidth={3.5} />
      <Path d={magnifier} strokeWidth={4.5} />
    </>
  ),
  solid: <Circle cx="16.5" cy="16.5" r="3.25" />,
  line: <Path d={magnifier} />,
});

export const FolderSearchIcon = createIcon("folder-search", {
  fill: (
    <Path d="M2.5 7A3.5 3.5 0 0 1 6 3.5h2.7a2.5 2.5 0 0 1 2 1l.9 1.2a1.5 1.5 0 0 0 1.2.6H17a4.5 4.5 0 0 1 4.5 4.5v6.7a4.5 4.5 0 0 1-4.5 4.5H7a4.5 4.5 0 0 1-4.5-4.5z" />
  ),
  cut: (
    <>
      <Hole d={circle(16.5, 16.5, 3.5)} stroke="black" strokeWidth={3.5} />
      <Path d={magnifier} strokeWidth={4.5} />
    </>
  ),
  solid: <Circle cx="16.5" cy="16.5" r="3.25" />,
  line: <Path d={magnifier} />,
});

export const GlobeIcon = createIcon("globe", {
  fill: <Circle cx="12" cy="12" r="10" />,
  cut: <Path d={meridians} strokeWidth={1.5} />,
});

export const WebSearchIcon = createIcon("web-search", {
  fill: <Circle cx="12" cy="12" r="10" />,
  cut: (
    <>
      <Path d={meridians} strokeWidth={1.5} />
      <Hole d={circle(17.5, 17.5, 3.5)} stroke="black" strokeWidth={3.5} />
      <Path d={magnifier} strokeWidth={4.5} />
    </>
  ),
  solid: <Circle cx="17.5" cy="17.5" r="3" />,
  line: <Path d="M19.9 19.9L22 22" />,
});

export const BrowserIcon = createIcon("browser", {
  fill: <Rect x="2" y="3" width="20" height="18" rx="4.5" />,
  cut: (
    <>
      <Path d="M2 8.5h20" />
      <Hole d={circle(6, 5.9, 0.9)} />
      <Hole d={circle(8.8, 5.9, 0.9)} />
    </>
  ),
});

export const CursorClickIcon = createIcon("cursor-click", {
  solid: (
    <Path d="M10.3 10.9c-.3-.8.5-1.6 1.3-1.3l8.3 3.1c.9.3.9 1.6 0 1.9l-3.2 1.1a1.2 1.2 0 0 0-.8.8l-1.1 3.2c-.3.9-1.6.9-1.9 0z" />
  ),
  line: <Path d="M9 2.5V5M3.8 4.8L5.6 6.6M2.5 9H5" />,
});

export const EyeIcon = createIcon("eye", {
  fill: <Path d="M2 12c1.9-4.6 5.6-7.5 10-7.5s8.1 2.9 10 7.5c-1.9 4.6-5.6 7.5-10 7.5S3.9 16.6 2 12z" />,
  cut: <Circle cx="12" cy="12" r="3.25" strokeWidth={1.5} />,
});

export const ImageGenerateIcon = createIcon("image-generate", {
  fill: <Rect x="2.5" y="2.5" width="18" height="18" rx="5" />,
  cut: (
    <>
      <Path d="M2.5 16.5l3.8-3.8a2 2 0 0 1 2.8 0l3.4 3.4" />
      <Hole d={circle(15, 8, 1.75)} />
      <Path d={sparkle} fill="black" strokeWidth={3.5} />
    </>
  ),
  solid: <Path d={sparkle} />,
});

export const SpeakerIcon = createIcon("speaker", {
  solid: <Path d="M2.5 10a2 2 0 0 1 2-2h2.3L11 4.2c.6-.5 1.5-.1 1.5.7v14.2c0 .8-.9 1.2-1.5.7L6.8 16H4.5a2 2 0 0 1-2-2z" />,
  line: <Path d="M16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />,
});

export const IdeaIcon = createIcon("idea", {
  solid: <Path d="M15.3 17c0-1.6.8-2.4 1.9-3.6a6.8 6.8 0 1 0-10.4 0C7.9 14.6 8.7 15.4 8.7 17z" />,
  line: <Path d="M9 19.5h6M10.5 22h3" />,
});

export const HistoryIcon = createIcon("history", {
  fill: <Circle cx="12" cy="12" r="9.5" />,
  cut: (
    <>
      <Path d="M12 7.5V12l3 2" />
      <Path d="M2.5 4v4.5H7" strokeWidth={5} />
    </>
  ),
  line: <Path d="M2.5 4v4.5H7" />,
});

export const ClipboardCheckIcon = createIcon("clipboard-check", {
  fill: <Rect x="3.5" y="4" width="17" height="18" rx="4" />,
  cut: (
    <>
      <Rect x="7.5" y="2" width="9" height="5" rx="1.75" strokeWidth={3} />
      <Path d="M8.5 14l2.5 2.5 4.5-5" />
    </>
  ),
  solid: <Rect x="7.5" y="2" width="9" height="5" rx="1.75" />,
});

export const MagicWandIcon = createIcon("magic-wand", {
  solid: <Path d="M17 2.5c.35 2.2 1.3 3.15 3.5 3.5-2.2.35-3.15 1.3-3.5 3.5-.35-2.2-1.3-3.15-3.5-3.5 2.2-.35 3.15-1.3 3.5-3.5z" />,
  line: <Path d="M3 21l10-10M9 3v2.5M7.75 4.25h2.5M19.5 13v2.5M18.25 14.25h2.5" />,
});

export const ChatQuestionIcon = createIcon("chat-question", {
  fill: (
    <Path d="M12 22a10 10 0 1 0-8.8-5.3c.2.4.3.9.2 1.3l-.7 2.6a1 1 0 0 0 1.2 1.2l2.6-.7c.4-.1.9 0 1.3.2 1.2.5 2.6.7 4.2.7z" />
  ),
  cut: (
    <>
      <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4v.3" />
      <Hole d={circle(12, 16.5, 1.1)} />
    </>
  ),
});

export const DelegateIcon = createIcon("delegate", {
  solid: (
    <>
      <Circle cx="12" cy="5" r="3" />
      <Circle cx="5.5" cy="19" r="3" />
      <Circle cx="18.5" cy="19" r="3" />
    </>
  ),
  line: <Path d="M12 8v4M5.5 16v-1a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v1" />,
});

export const CalendarClockIcon = createIcon("calendar-clock", {
  fill: <Rect x="3" y="4.5" width="18" height="17" rx="4" />,
  cut: (
    <>
      <Path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      <Hole d={circle(17, 17, 6)} />
    </>
  ),
  line: (
    <>
      <Path d="M8 2.5v4M16 2.5v4" />
      <Circle cx="17" cy="17" r="4.25" />
      <Path d="M17 15.2V17l1.2 1.2" />
    </>
  ),
});

export const SendIcon = createIcon("send", {
  fill: <Path d="M21.5 2.5l-6.4 18.3c-.3.9-1.5.9-1.9.1l-2.7-7.4-7.4-2.7c-.8-.4-.8-1.6.1-1.9z" />,
  cut: <Path d="M21.5 2.5l-11 11" strokeWidth={1.5} />,
});

export const ModelsIcon = createIcon("models", {
  fill: (
    <>
      <Circle cx="12" cy="8" r="5.5" />
      <Circle cx="8" cy="15" r="5.5" />
      <Circle cx="16" cy="15" r="5.5" />
    </>
  ),
  cut: (
    <>
      <Circle cx="8" cy="15" r="5.5" strokeWidth={1.5} />
      <Circle cx="16" cy="15" r="5.5" strokeWidth={1.5} />
    </>
  ),
});

export const HomeIcon = createIcon("home", {
  fill: (
    <Path d="M3 10.9c0-.8.3-1.5.9-2l6.6-5.8a2.3 2.3 0 0 1 3 0l6.6 5.8c.6.5.9 1.2.9 2V18a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 18z" />
  ),
  cut: <Path d="M10 22v-4a2 2 0 0 1 4 0v4" />,
});

export const WrenchIcon = createIcon("wrench", {
  solid: (
    <Path d="M14.5 6.1a1.2 1.2 0 0 0 0 1.7l1.7 1.7a1.2 1.2 0 0 0 1.7 0l3-3c.4-.4 1-.2 1.1.3a6.3 6.3 0 0 1-8.3 7.4l-6.2 6.7a2.4 2.4 0 0 1-3.4-3.4l6.7-6.2a6.3 6.3 0 0 1 7.4-8.3c.5.1.7.7.3 1.1z" />
  ),
});

/**
 * Tool name → icon, covering Hermes tools (`read_file`, `browser_click`, `mcp_<server>_…`)
 * and Claude Code ones (`Read`, `Bash`, `mcp__<server>__…`). Lookup is case-insensitive.
 */
const exact: Record<string, IconComponent> = {
  terminal: TerminalIcon,
  process: TerminalIcon,
  bash: TerminalIcon,
  execute_code: CodeIcon,
  notebookedit: CodeIcon,
  read_file: FileReadIcon,
  read: FileReadIcon,
  write_file: FileEditIcon,
  patch: FileEditIcon,
  write: FileEditIcon,
  edit: FileEditIcon,
  multiedit: FileEditIcon,
  search_files: FileSearchIcon,
  grep: FileSearchIcon,
  glob: FolderSearchIcon,
  web_search: WebSearchIcon,
  websearch: WebSearchIcon,
  web_extract: GlobeIcon,
  webfetch: GlobeIcon,
  browser_click: CursorClickIcon,
  browser_type: KeyboardIcon,
  browser_press: KeyboardIcon,
  browser_vision: EyeIcon,
  vision_analyze: EyeIcon,
  image_generate: ImageGenerateIcon,
  text_to_speech: SpeakerIcon,
  memory: BrainIcon,
  session_search: HistoryIcon,
  todo: ClipboardCheckIcon,
  todowrite: ClipboardCheckIcon,
  clarify: ChatQuestionIcon,
  askuserquestion: ChatQuestionIcon,
  delegate_task: DelegateIcon,
  task: DelegateIcon,
  agent: DelegateIcon,
  cronjob: CalendarClockIcon,
  send_message: SendIcon,
  mixture_of_agents: ModelsIcon,
  skill: MagicWandIcon,
  thinking: IdeaIcon,
  réflexion: IdeaIcon,
};

const prefixes: [string, IconComponent][] = [
  ["mcp_", PlugIcon],
  ["browser_", BrowserIcon],
  ["skill", MagicWandIcon],
  ["ha_", HomeIcon],
  ["cron", CalendarClockIcon],
  ["schedule", ClockIcon],
];

export function toolIcon(name: string): IconComponent {
  const key = name.trim().toLowerCase();
  return exact[key] ?? prefixes.find(([p]) => key.startsWith(p))?.[1] ?? WrenchIcon;
}

/** The icon of a tool, by the name the agent reports. */
export function ToolIcon({ name, ...props }: IconProps & { name: string }) {
  return createElement(toolIcon(name), props);
}
