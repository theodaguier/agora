import { describe, expect, test } from "bun:test";
import { readMediaTags, withoutMediaTags } from "@agora/core";

describe("MEDIA tags", () => {
  test("a tag on its own line leaves the text with its line", () => {
    const reply = "Voici la vidéo.\n\nMEDIA:/opt/data/agora-outbox/c1/intro.mp4\n\nDis-moi si le rythme te va.";
    expect(readMediaTags(reply)).toEqual(["/opt/data/agora-outbox/c1/intro.mp4"]);
    expect(withoutMediaTags(reply)).toBe("Voici la vidéo.\n\nDis-moi si le rythme te va.");
  });

  test("inside a sentence, the punctuation after the path stays", () => {
    const reply = "Le son est prêt : MEDIA:/opt/data/cache/audio/tts_1.mp3.";
    expect(readMediaTags(reply)).toEqual(["/opt/data/cache/audio/tts_1.mp3"]);
    expect(withoutMediaTags(reply)).toBe("Le son est prêt :.");
  });

  test("a path with spaces, in backticks or quotes", () => {
    expect(readMediaTags("MEDIA:`/tmp/mon rendu.mp4`")).toEqual(["/tmp/mon rendu.mp4"]);
    expect(readMediaTags('MEDIA: "/tmp/mon rendu.mov"')).toEqual(["/tmp/mon rendu.mov"]);
    expect(withoutMediaTags("Rendu :\n**MEDIA:`/tmp/mon rendu.mp4`**")).toBe("Rendu :");
  });

  test("in bold, the asterisks are not part of the path", () => {
    const reply = "Tu as écrit : **MEDIA:/opt/data/out/story.mp4**";
    expect(readMediaTags(reply)).toEqual(["/opt/data/out/story.mp4"]);
    expect(withoutMediaTags(reply)).toBe("Tu as écrit :");
  });

  test("several files, each once, in order", () => {
    const reply = "MEDIA:/a/one.mp4\nMEDIA:/a/two.png\nMEDIA:/a/one.mp4";
    expect(readMediaTags(reply)).toEqual(["/a/one.mp4", "/a/two.png"]);
  });

  test("a relative path or a bare word is not a tag", () => {
    expect(readMediaTags("MEDIA:video.mp4 et MEDIA: tout court")).toEqual([]);
  });

  test("only the files sent leave the text", () => {
    const reply = "MEDIA:/ok/a.mp4\nMEDIA:/etc/passwd";
    expect(withoutMediaTags(reply, (p) => p === "/ok/a.mp4")).toBe("MEDIA:/etc/passwd");
  });

  test("a path still being written is hidden too", () => {
    expect(withoutMediaTags("Je l'envoie.\nMEDIA:/opt/da")).toBe("Je l'envoie.");
  });
});
