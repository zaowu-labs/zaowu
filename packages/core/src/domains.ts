export type DomainCommandStatus = 'available' | 'planned';

export interface DomainCommandDefinition {
  name: string;
  summary: string;
  status: DomainCommandStatus;
  sensitive?: boolean;
}

export interface DomainDefinition {
  name: string;
  summary: string;
  commands: readonly DomainCommandDefinition[];
  capabilities?: import('./capabilities.js').CapabilityLedger;
}

export const findDomainCommand = (
  domain: DomainDefinition,
  action: string
): DomainCommandDefinition | undefined =>
  domain.commands.find((command) => command.name === action);
