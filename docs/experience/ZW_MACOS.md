# Product Experience Spec for ZaoWu on macOS

## User and core job

Developers who use Apple Silicon or Intel Macs can identify which Node.js, Git,
Homebrew, and ZaoWu installation their terminal resolves. A fresh Terminal or IDE
session should have enough information to fix PATH or install missing Apple tools.

## Golden path

Run `zw doctor` in macOS Terminal. It displays the macOS version, the architecture
and location of Node.js, the Homebrew executable found on PATH, and the first
`zw` executable on PATH. If its npm package metadata identifies a different
version, doctor shows both versions and explains how to check shell resolution.
Running `npm run --silent zw -- doctor` from a built checkout can therefore reveal
an older global installation even when the checkout works.

## Behavior and safety

- On Apple Silicon, a translated Intel Node.js runtime is reported as Rosetta
  with guidance to open a native shell and use the matching Node.js build.
- Homebrew is optional. Recognize its conventional architecture-specific prefix
  when present and show shell setup guidance if the conventional executable
  exists outside PATH. Custom installations are shown by path.
- Path checks inspect executable files and bundled npm metadata. Doctor uses
  fixed system executables for Apple diagnostics. Aliases and shell functions
  still need a shell-level check such as `type -a zw`.
- When PATH resolves Apple's `/usr/bin/git` stub and developer tools are missing,
  doctor gives installation guidance before invoking the stub. An independently
  installed Git can satisfy the check without Apple developer tools.
- `--json` adds macOS entries to `checks` using the existing schema. Optional
  advice appears in human output and in each check's `fix` value. The operation
  plan discloses conditional system probes and filesystem reads.

## Acceptance

- Unit tests simulate Apple Silicon, Intel, Rosetta, a stale npm symlink, and
  missing Apple developer tools. macOS-specific checks run only on macOS.
- Verify native invocation on Apple Silicon and include Intel in the GitHub
  Actions matrix. Document setup for zsh and clipboard workflows that compose
  the system's `pbpaste` and `pbcopy` with the existing CLI.
