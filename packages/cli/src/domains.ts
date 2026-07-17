import { AI_DOMAIN } from '@zaowu-labs/ai';
import { AUTO_DOMAIN } from '@zaowu-labs/auto';
import { CONFIG_DOMAIN } from '@zaowu-labs/config';
import type { DomainDefinition } from '@zaowu-labs/core';
import { DATA_DOMAIN } from '@zaowu-labs/data';
import { DEV_DOMAIN } from '@zaowu-labs/dev';
import { DOC_DOMAIN } from '@zaowu-labs/doc';
import { PLUGIN_DOMAIN } from '@zaowu-labs/plugin';
import { TEACH_DOMAIN } from '@zaowu-labs/teach';
import { WEB_DOMAIN } from '@zaowu-labs/web';

export const DOMAIN_DEFINITIONS: readonly DomainDefinition[] = [
  AI_DOMAIN,
  DEV_DOMAIN,
  DOC_DOMAIN,
  DATA_DOMAIN,
  AUTO_DOMAIN,
  WEB_DOMAIN,
  TEACH_DOMAIN,
  PLUGIN_DOMAIN,
  CONFIG_DOMAIN,
];

export const findDomain = (name: string): DomainDefinition | undefined =>
  DOMAIN_DEFINITIONS.find((domain) => domain.name === name);
