# @zaowu-labs/cli

ZaoWu / 造物 is a local-first toolkit for Git projects, documents, tables,
teaching material, and automation. This package installs the `zw` command.

## Install and try

Use Node.js 20.19.0 or newer. Git commands also require Git.

```sh
npm install -g @zaowu-labs/cli@1.3.1
zw --version
zw doctor
zw teach plan "Git staging"
```

The lesson outline runs locally without a project file or model account.
For one-off use, run `npx --package @zaowu-labs/cli@1.3.1 zw --help`.
If npm 12 reports `EALLOWREMOTE`, XLSX support needs the pinned SheetJS URL.
Review it before enabling remote dependencies for this installation with
`npm install -g --allow-remote=all @zaowu-labs/cli@1.3.1`.
[Installation guide](https://github.com/zaowu-labs/zaowu/blob/main/docs/GETTING_STARTED.md#install)

## Use your own files

```sh
zw doc outline "Project notes.md"
zw data sheets "Sales report.xlsx"
zw data clean "Sales report.xlsx" --sheet "Q1 Sales" --output sales.csv
zw dev status
```

Use a worksheet name from `data sheets`. Cleaning previews the destination and
prints a confirmation command. Run `dev status` inside a Git working tree.
Use `zw help data clean` for command help or `--json` for structured output.
On macOS, `zw doctor` checks native and Rosetta runtimes, Homebrew PATH, and
which ZaoWu installation your terminal finds.
[macOS guide](https://github.com/zaowu-labs/zaowu/blob/main/docs/MACOS.md)

Safety:

- Sensitive commands preview by default or require explicit confirmation.
- File-writing previews include generated-content fingerprints in their
  operation plans when the CLI can determine the content before confirmation.
- Document conversions and cleaned table exports resolve the destination
  directory during preview. The confirmation command names that physical
  destination. A missing parent, existing file, or dangling output link is
  reported before confirmation.
- Expected errors are formatted without raw stack traces.
- JSON output is intended for automation and should stay schema-versioned where
  public contracts are defined.
