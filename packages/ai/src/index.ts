export interface AIProviderDescriptor {
  id: string;
  name: string;
}

export const listAIProviders = (): readonly AIProviderDescriptor[] => [];
