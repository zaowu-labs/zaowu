# Privacy

ZaoWu is local-first. The CLI does not collect product analytics or telemetry by default.

Commands may access files, Git metadata, environment variables, or network providers only when the selected command requires them. Sensitive commands expose capabilities and operation plans, and network actions preview their destination before confirmed execution.

AI prompts and file content are sent only to the provider selected by the user after the applicable confirmation. Provider retention and training policies are controlled by that provider, not by ZaoWu.

Do not store API keys, passwords, tokens, or private keys in `zw.yml`. Use environment variables or a future explicit secret-provider integration.

If optional telemetry is introduced later, it must be documented, disabled by default until consent is obtained, avoid prompt/file contents, and provide a clear disable and deletion path.
