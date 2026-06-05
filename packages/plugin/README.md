# @zaowu/plugin

Local plugin manifest package for ZaoWu.

This package validates local plugin manifests and previews install or remove
operations under `.zaowu/plugins`.

Safety:

- Install and remove preview by default.
- Confirmed install refuses to overwrite an existing manifest.
- There is no public plugin marketplace in this foundation version.
