import type { DomainDefinition } from '@zaowu/core';

export const PLUGIN_DOMAIN: DomainDefinition = {
  name: 'plugin',
  summary: 'Plugin workflows for listing, installing, and removing extensions',
  commands: [
    {
      name: 'list',
      summary: 'List installed or available plugins',
      status: 'planned',
    },
    {
      name: 'install',
      summary: 'Install a plugin with compatibility checks',
      status: 'planned',
      sensitive: true,
    },
    {
      name: 'remove',
      summary: 'Remove an installed plugin with confirmation',
      status: 'planned',
      sensitive: true,
    },
  ],
};
