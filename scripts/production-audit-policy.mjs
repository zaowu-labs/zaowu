export const evaluateProductionAudit = (report, exceptions, now = new Date()) => {
  if (
    !report ||
    !report.advisories ||
    Array.isArray(report.advisories) ||
    typeof report.advisories !== 'object' ||
    !report.metadata?.vulnerabilities ||
    !Array.isArray(exceptions)
  ) {
    throw new Error('The registry did not return a valid production audit report.');
  }
  const accepted = [];
  const rejected = [];
  for (const advisory of Object.values(report.advisories)) {
    const exception = exceptions.find((entry) => entry.ghsa === advisory.github_advisory_id);
    const findings = advisory.findings ?? [];
    const paths = findings.flatMap((finding) => finding.paths ?? []);
    const expiresAt = exception ? Date.parse(`${exception.expiresOn}T23:59:59.999Z`) : NaN;
    const matches =
      exception &&
      expiresAt >= now.getTime() &&
      advisory.module_name === exception.module &&
      advisory.severity === exception.severity &&
      findings.length > 0 &&
      paths.length > 0 &&
      findings.every((finding) => finding.version === exception.version) &&
      paths.every((dependencyPath) => dependencyPath === exception.path);
    (matches ? accepted : rejected).push({ advisory, exception });
  }
  const counts = Object.values(report.metadata.vulnerabilities);
  if (!counts.every((count) => Number.isSafeInteger(count) && count >= 0)) {
    throw new Error('Audit returned invalid vulnerability counts.');
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total !== accepted.length + rejected.length) {
    throw new Error('Audit vulnerability counts do not match advisory details.');
  }
  return { accepted, rejected };
};
