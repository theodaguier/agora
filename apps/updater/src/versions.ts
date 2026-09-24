/** Version comparison: semver for the app, vYYYY.M.D[.N] for Hermes. */
export function parseVersion(v: string) {
  const m = v.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/);
  return m ? m.slice(1).map((x) => Number(x ?? 0)) : null;
}

export function compare(a: string, b: string) {
  const pa = parseVersion(a) ?? [];
  const pb = parseVersion(b) ?? [];
  for (let i = 0; i < 4; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export const newer = (versions: string[], current: string) =>
  versions.filter((v) => parseVersion(v) && compare(v, current) > 0).sort(compare);

/** App update type: major versions wait for human approval. */
export function bump(from: string, to: string): "major" | "minor" | "patch" {
  const [fa = 0, fb = 0] = parseVersion(from) ?? [];
  const [ta = 0, tb = 0] = parseVersion(to) ?? [];
  if (ta !== fa) return "major";
  return tb !== fb ? "minor" : "patch";
}
