# Production dependency review

Run `corepack pnpm audit:prod` for the release audit policy. It requests the full
production audit and blocks every unreviewed finding. Registry/report errors fail
closed. `corepack pnpm audit --prod` remains available as the unfiltered audit.

## Exception resolved on 2026-10-21

The approved 2026-10-20 exception for
[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
was removed before its 2026-11-19 expiry. Mammoth has been replaced with focused
DOCX extraction using JSZip and xmldom directly. `mammoth`, its `argparse` 1.x
CLI dependency, and `sprintf-js` are absent from the production dependency graph
and lockfile. The published doc manifest contains the actual replacement; this
is not a workspace override that leaves npm consumers exposed to the old chain.
Eleven unused dependency packages were removed, with no new parser family added.

The exception list is empty. The full audit must pass with zero accepted findings;
no threshold, expiry, path, or advisory bypass was broadened. Policy regression
tests continue to prove unknown advisories, paths, versions, severities, malformed
reports, mismatched counts, and expired reviews fail closed.

DOCX tests exercise real ZIP/XML conversion, inherited headings, strict namespaces,
lists, tables, safe links, literal Markdown, malformed/DTD XML, excessive nesting,
and actual inflated-byte limits. Production artifact and installed-CLI checks
must confirm the replacement is packaged and usable before release completion.
