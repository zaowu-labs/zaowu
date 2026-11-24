# ZaoWu on macOS

## Check which tools your terminal uses

```zsh
node -p process.arch
type -a node brew zw
zw doctor
```

Prefer `arm64` Node.js on Apple Silicon and `x64` on Intel. Under Rosetta,
doctor shows that Node.js is translated. For a native Apple Silicon setup,
open a native terminal session, select an `arm64` installation, and run the
checks again. [Apple's Rosetta documentation](https://developer.apple.com/documentation/apple-silicon/about-the-rosetta-translation-environment)

Homebrew's standard prefix is `/opt/homebrew` on Apple Silicon and `/usr/local`
on Intel. If Homebrew is installed outside PATH, use the shell setup command
shown by doctor. Add the matching `brew shellenv` line to `~/.zprofile` for
new zsh login sessions. Reopen the terminal or restart the IDE that supplies
your terminal's environment after changing PATH. [Homebrew installation](https://docs.brew.sh/Installation)

For ZaoWu installation, follow [Getting Started](GETTING_STARTED.md#install).
If `zw` resolves to an unexpected version, check `type -a zw` to see aliases,
functions, and binaries in their shell order. `npm prefix -g` shows the active
Node installation's npm prefix. From a built checkout, use the following commands
to compare the checkout with the first executable found on PATH.

```zsh
npm run --silent zw -- --version
npm run --silent zw -- doctor
```

Doctor reports the PATH executable's version when its npm package metadata is
available. For shell functions, aliases, and third-party executable shims, check
resolution in the shell itself.

If Git resolves to Apple's `/usr/bin/git` and doctor reports missing developer
tools, run `xcode-select --install` when ready, or put a standalone Git earlier
on PATH. [Apple Command Line Tools](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools)

## Preview an export on a Mac volume

When a project directory is reached through a symbolic link, `zw doc convert`
and `zw data clean` show the physical output path in the preview. Check that
path before copying the confirmation command, especially for external volumes.

```zsh
zw data clean sales.tsv --output sales.csv --json
```

On a case-insensitive volume, an existing `Sales.csv` occupies the requested
`sales.csv` path. Choose another name and preview again. The `.csv` suffix
selects comma-separated output even when the source is tab-separated.
TextEdit documents and Excel CSV/TSV exports can use UTF-8 or UTF-16 with a
byte-order mark. A UTF-16 Markdown lesson can be used directly with both
`zw doc outline` and `zw teach plan`.

## Use the clipboard with ZaoWu

Copy text in any Mac app and inspect what the AI command would receive with
the local Echo provider.

```zsh
pbpaste | zw ai ask "List the next actions" --stdin --provider echo --json
```

For a model-backed answer, choose your provider and preview before sending.

```zsh
pbpaste | zw ai ask "List the next actions" --stdin --provider ollama --output actions.md
```

Run `pbpaste` again with the displayed confirmation command on the right of the
pipe. If the clipboard text changed, preview the request again. An existing
`actions.md` requires a fresh output name. After a successful save, `pbcopy < actions.md`
copies the answer into the clipboard.

To copy a local Echo result with all its trailing line breaks, capture the
bytes in a temporary file. The clipboard changes after the entire pipeline
succeeds and produces a nonempty answer.

```zsh
(
  set -o pipefail
  answer=$(mktemp) || exit 1
  trap 'rm -f "$answer"' EXIT
  pbpaste | zw ai ask "Show received text" --stdin --provider echo --raw > "$answer" &&
    [[ -s "$answer" ]] && pbcopy < "$answer"
)
```

## Develop from a checkout

Use [repository setup](GETTING_STARTED.md#repository-development) to prepare
Corepack and the pinned pnpm. For an already prepared checkout, `npm run build`
and `npm run --silent zw -- doctor --json` run the local build and diagnostic.
The GitHub Actions matrix checks native Node.js on Apple Silicon and Intel Mac
runners. [CI workflow](../.github/workflows/ci.yml)
