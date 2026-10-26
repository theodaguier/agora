/** Web/API gate; mobile findings remain visible in the full pnpm audit report. */
type Advisory = { module_name: string; severity: string; url: string; findings?: { version: string; paths: string[] }[] };
export function webSecurityFindings(advisories: Advisory[]) {
  return advisories.filter((advisory) => {
    if (advisory.severity !== "high" && advisory.severity !== "critical") return false;
    const paths = advisory.findings?.flatMap((finding) => finding.paths) ?? [];
    // Unknown ownership is a failure, never a clean scan.
    return paths.length === 0 || paths.some((path) => !path.startsWith("apps__mobile>"));
  });
}

if (import.meta.main) {
  const proc = Bun.spawn(["pnpm", "audit", "--json"], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  let report: { metadata?: unknown; advisories?: Record<string, Advisory>; error?: unknown };
  try { report = JSON.parse(stdout); } catch { throw new Error(`Dependency audit unavailable: ${stderr || stdout}`); }
  if (!report.metadata || !report.advisories || report.error) throw new Error("Dependency audit returned an incomplete report");
  const all = Object.values(report.advisories);
  const failures = webSecurityFindings(all);
  for (const finding of failures) console.error(`${finding.severity}: ${finding.module_name} ${finding.url}`);
  const mobile = all.filter((a) => (a.severity === "high" || a.severity === "critical") && !failures.includes(a));
  for (const finding of mobile) console.warn(`Mobile-only finding (outside this web gate): ${finding.module_name} ${finding.url}`);
  if (failures.length) process.exit(1);
  console.log("No high or critical dependency finding in web/API; full monorepo report remains available with pnpm audit.");
}
