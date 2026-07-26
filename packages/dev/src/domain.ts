import { createCapabilityLedger, type DomainDefinition } from '@zaowu-labs/core';

export const DEV_DOMAIN: DomainDefinition = {
  name: 'dev',
  summary: 'Developer workflows for review, commit, and repository assistance',
  capabilities: createCapabilityLedger({
    // Dev commands read repository content (status, diffs, HEAD) through Git.
    readsFiles: true,
    modifiesGit: true,
    // Dev commands spawn fixed `git` subprocesses (status/diff/fetch/reset),
    // never arbitrary user-provided shell.
    executesShell: true,
    usesNetwork: true,
    accessesSecrets: true,
  }),
  commands: [
    {
      name: 'commit',
      summary: 'Preview and prepare a Git commit message',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'review',
      summary: 'Review a repository change without modifying files',
      status: 'available',
      sensitive: true,
    },
    {
      name: 'status',
      summary: 'Show Git working tree status for the current project',
      status: 'available',
    },
    {
      name: 'sync',
      summary: 'Synchronize the local branch with the same-named branch on origin',
      status: 'available',
      sensitive: true,
    },
  ],
};
