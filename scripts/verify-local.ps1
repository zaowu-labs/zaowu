$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  Invoke-Checked corepack pnpm install --frozen-lockfile
  Invoke-Checked corepack pnpm build
  Invoke-Checked corepack pnpm verify:smoke
  Invoke-Checked corepack pnpm test
  Invoke-Checked corepack pnpm lint
  Invoke-Checked corepack pnpm format:check
  Invoke-Checked corepack pnpm pack:check
  Invoke-Checked git diff --check
} finally {
  Pop-Location
}
