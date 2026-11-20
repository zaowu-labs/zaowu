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

## SheetJS tarball and dependency updates

The data package uses the official SheetJS 0.20.3 tarball. `pnpm-lock.yaml`
records the publisher URL and SHA-512 under its `packages` resolution. Keep both
fields when reviewing an update. The committed hash matches the official
download. The November 14 Dependabot run reported a missing hash after updating
an unrelated dependency. Running its sequence in a temporary checkout reproduced
the loss on both pnpm 10.34.1 and 10.34.9. The first update warms the store, and
the subsequent recursive `--lockfile-only --no-save` update drops the hash.

When an update drops the hash and the SheetJS URL is unchanged, restore the
reviewed SHA-512 from the previous lockfile entry and verify it against the
official tarball. Changes to the URL require a fresh review. Run the frozen
install and production audit before merging. See the
[failed Dependabot run](https://github.com/zaowu-labs/zaowu/actions/runs/43590460962)
and [pnpm's related tarball resolution fix](https://github.com/pnpm/pnpm/pull/12096).
