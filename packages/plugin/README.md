# @zaowu-labs/plugin

Local plugin manifest package for ZaoWu.

This package validates local plugin manifests and previews install or remove
operations under `.zaowu/plugins`.

Safety:

- Install and remove preview by default.
- Confirmed install refuses to overwrite an existing manifest.
- Linked `.zaowu` or `.zaowu/plugins` directories are rejected so lifecycle
  operations cannot escape the project plugin directory.
- Plugin manifests are metadata only; this package does not execute plugin
  commands in the foundation version.
- There is no public plugin marketplace in this foundation version.
