# @zaowu-labs/plugin

Local plugin manifest package for ZaoWu.

This package validates local plugin manifests and previews install or remove
operations under `.zaowu/plugins`.

To check a local bundle containing `plugin.json` or `zaowu.plugin.json`,
call `validatePluginSource("./bundle")` from Node.js or run
`zw plugin validate ./bundle` with the [ZaoWu CLI](https://www.npmjs.com/package/@zaowu-labs/cli).

Safety:

- Install and remove preview by default.
- Confirmed install refuses to overwrite an existing manifest.
- Linked `.zaowu` or `.zaowu/plugins` directories are rejected so lifecycle
  operations cannot escape the project plugin directory.
- Plugin manifests are metadata only; this package does not execute plugin
  commands in the foundation version.
- There is no public plugin marketplace in this foundation version.
- Source and installed manifests are limited to one MiB. Installed links and
  malformed metadata become the unreadable-manifest entry; unknown fields are
  omitted from list results. Directory read failures produce a recovery error.
- Removal rechecks the confirmed manifest content before deleting it. Install
  plans bind the id and resolved source; the timestamp is generated on confirmation.
- An explicit source naming a local directory resolves against the project,
  including a bare name such as `--source bundle`. Its manifest id must match
  the installation id.
- Validation reports unsupported fields and empty display names or versions.
  The JSON result includes `manifest` only when it passes validation.
