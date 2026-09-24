import { describe, expect, test } from "bun:test";
import { plan } from "./session-search";

describe("session_search plan", () => {
  test("turns it off for a bot with several members, once", () => {
    const bots = [
      { profile: "compta", members: 3 },
      { profile: "perso", members: 1 },
    ];
    expect(plan(bots, new Set())).toEqual({ disable: ["compta"], enable: [], forget: [] });
    expect(plan(bots, new Set(["compta"]))).toEqual({ disable: [], enable: [], forget: [] });
  });

  test("turns back on only what the app turned off, once the bot is personal again", () => {
    const bots = [
      { profile: "compta", members: 1 },
      { profile: "perso", members: 0 },
    ];
    expect(plan(bots, new Set(["compta"]))).toEqual({ disable: [], enable: ["compta"], forget: [] });
  });

  test("forgets deleted bots", () => {
    expect(plan([], new Set(["gone"]))).toEqual({ disable: [], enable: [], forget: ["gone"] });
  });
});
