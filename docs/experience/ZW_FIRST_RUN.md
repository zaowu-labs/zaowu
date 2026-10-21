# Product Experience Spec: First use and command recovery

## 1. Summary

Make the unified `zw` toolkit understandable from installation through the first
useful result, and reject ambiguous input before any side effect.

## 2. Target User

Developers, technical creators, and small teams using the published CLI or
contributing from the repository.

## 3. Core Job

Discover a command, understand its input and safety boundary, preview a sensitive
operation, and recover from mistakes without losing files or changing providers.

## 4. Golden Path

```sh
zw --help
zw init
zw init --yes
zw doctor
zw ai providers
zw help data schema
```

The README must also include self-contained document and data examples that work
without a model account, and a clearly labeled preview of a real network provider.

## 5. Command Design

- Keep all existing `zw <domain> <action> [target] [options]` names.
- `zw help <domain> [action]` renders the same help as `<command> --help`.
- `-h` aliases `--help`; `-V` aliases `--version` before the `--` separator.
- Boolean flags do not accept assigned values. For example, `--yes=false` is an
  error, never authorization. `--dry-run` continues to override a valid `--yes`.
- Reject extra positional targets for fixed-arity commands. AI prompts and
  teaching material remain variadic. Missing targets retain their specific errors.

## 6. Input Rules

Validate malformed flags and extra targets before reading inputs, running Git,
writing files, or sending requests. Preserve literal arguments following `--`.
Help queries never execute the queried command. Misspellings may suggest a close
command but must never select or execute it automatically.

## 7. Output Rules

Keep existing JSON envelopes and help metadata. Expected errors remain on stderr,
with stable codes and actionable fixes. Human help should explain first steps and
the difference between Echo demonstration and a real model request.

## 8. Safety Rules

`init` must refuse to shadow any supported config name in the current directory,
including a filesystem entry that cannot be read. It may initialize a child
project even when a parent project has a config. Existing preview fingerprints
and exclusive file creation remain in place.

## 9. AI Behavior

An absent project config may use optional global provider preferences. A malformed
config must produce its actionable error rather than silently select Echo.
An explicit `--provider` remains the highest-priority choice. Doctor must describe
the same effective provider without making model requests or revealing secrets.
Diagnostic subprocesses are bounded to five seconds. Corepack network access,
download prompts, and auto-pinning are disabled while checking optional tooling.

## 10. Error Cases

| Error                              | Recovery                                          |
| ---------------------------------- | ------------------------------------------------- |
| Boolean flag with a value          | Use the flag without a value, or omit it          |
| Extra positional target            | Show the command's help and expected target count |
| Unknown command/action             | Suggest a close match when unambiguous; show help |
| Existing alternate config          | Use or validate the existing config               |
| Invalid configured provider/config | Repair config or explicitly choose a provider     |

## 11. Help Text

```sh
zw help
zw help init
zw help data schema
zw data schema -h
zw -V
```

## 12. Tests

Cover help parity, JSON metadata, literal separators, malformed flags, fixed and
variadic arguments, nonexecution on errors/help, all config aliases, nested
projects, invalid configuration, global-only provider preferences, and preview
fingerprints. Run the self-contained README examples in a temporary directory.

## 13. Documentation

Update README, Getting Started, CLI style rules, init spec, JSON/error contracts,
changelog, and maintenance priorities. Distinguish implemented capabilities from
future product direction.

## 14. Acceptance Criteria

All existing valid command names and JSON envelopes remain compatible. A new user
can obtain useful local results from the README. Invalid input cannot authorize
side effects. The complete local gate and supported CI matrix pass.

## 15. Open Questions

Workflow composition across domains and a more compact operation-plan view remain
future work; they must preserve domain ownership and complete safety disclosures.
