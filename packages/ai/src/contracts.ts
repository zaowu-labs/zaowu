export interface AIProviderDescriptor {
  id: string;
  name: string;
  network: boolean;
  configured: boolean;
  requiredEnv: string[];
  defaultModel?: string;
}

export interface AIFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  body?: unknown;
}

export type AIFetcher = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
    redirect?: 'error';
  }
) => Promise<AIFetchResponse>;

export interface AIAskRequest {
  prompt: string;
  provider?: string | null;
  model?: string;
  filePath?: string;
  env?: NodeJS.ProcessEnv;
  fetcher?: AIFetcher;
  allowNetwork?: boolean;
  timeoutMs?: number;
  maxInputCharacters?: number;
  onChunk?: (chunk: string) => void;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIAskResponse {
  schemaVersion: 1;
  status: 'ok';
  provider: AIProviderDescriptor;
  model: string;
  endpoint: string | null;
  input: {
    source: 'prompt' | 'file' | 'prompt+file';
    promptCharacters: number;
    filePath?: string;
    fileCharacters?: number;
    combinedCharacters: number;
    maxInputCharacters: number;
  };
  output: string;
  usage: AIUsage | null;
}

export interface AIProviderValidation {
  status: 'ok' | 'warning';
  provider: AIProviderDescriptor;
  warnings: string[];
}

export type AIProviderFailureKind =
  | 'auth'
  | 'rate-limit'
  | 'bad-request'
  | 'server'
  | 'transport'
  | 'timeout'
  | 'invalid-response'
  | 'unknown';

export interface AIProviderFailure {
  kind: AIProviderFailureKind;
  retryable: boolean;
  safeSummary: string;
  retryAfterMs?: number;
  why: string;
  fix: string;
}

export interface AIProvider {
  descriptor: AIProviderDescriptor;
  ask(request: AIAskRequest): Promise<AIAskResponse>;
}

export interface AIAskPreview {
  schemaVersion: 1;
  status: 'preview';
  provider: AIProviderDescriptor;
  model: string;
  endpoint: string | null;
  input: AIAskResponse['input'];
  validation: AIProviderValidation;
  usage: null;
}
