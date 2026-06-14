import { type DomainActionHandler, type DomainHandlerContext } from './handler-utils.js';

import { handleAiAsk, handleAiProviders } from './handlers/ai-handlers.js';
import { handleAutoPlan, handleAutoRun, handleAutoValidate } from './handlers/auto-handlers.js';
import {
  handleConfigGet,
  handleConfigMigrate,
  handleConfigPath,
  handleConfigSet,
  handleConfigShow,
  handleConfigValidate,
} from './handlers/config-handlers.js';
import {
  handleDataAnalyze,
  handleDataClean,
  handleDataInspect,
  handleDataSample,
  handleDataSchema,
  handleDataSheets,
} from './handlers/data-handlers.js';
import {
  handleDevCommit,
  handleDevReview,
  handleDevStatus,
  handleDevSync,
} from './handlers/dev-handlers.js';
import {
  handleDocConvert,
  handleDocExtract,
  handleDocOutline,
  handleDocSearch,
  handleDocSummary,
} from './handlers/doc-handlers.js';
import {
  handlePluginInstall,
  handlePluginList,
  handlePluginRemove,
  handlePluginValidate,
} from './handlers/plugin-handlers.js';
import { handleTeachPlan, handleTeachQuiz } from './handlers/teach-handlers.js';
import { handleWebFetch, handleWebInspect } from './handlers/web-handlers.js';

export { type DomainActionHandler, type DomainHandlerContext };

const HANDLERS: Record<string, Record<string, DomainActionHandler>> = {
  ai: {
    ask: handleAiAsk,
    providers: handleAiProviders,
  },
  auto: {
    plan: handleAutoPlan,
    run: handleAutoRun,
    validate: handleAutoValidate,
  },
  config: {
    get: handleConfigGet,
    migrate: handleConfigMigrate,
    path: handleConfigPath,
    set: handleConfigSet,
    show: handleConfigShow,
    validate: handleConfigValidate,
  },
  data: {
    analyze: handleDataAnalyze,
    clean: handleDataClean,
    inspect: handleDataInspect,
    sample: handleDataSample,
    schema: handleDataSchema,
    sheets: handleDataSheets,
  },
  dev: {
    commit: handleDevCommit,
    review: handleDevReview,
    status: handleDevStatus,
    sync: handleDevSync,
  },
  doc: {
    convert: handleDocConvert,
    extract: handleDocExtract,
    outline: handleDocOutline,
    search: handleDocSearch,
    summary: handleDocSummary,
  },
  plugin: {
    install: handlePluginInstall,
    list: handlePluginList,
    remove: handlePluginRemove,
    validate: handlePluginValidate,
  },
  teach: {
    plan: handleTeachPlan,
    quiz: handleTeachQuiz,
  },
  web: {
    fetch: handleWebFetch,
    inspect: handleWebInspect,
  },
};

export const getDomainActionHandler = (
  domainName: string,
  actionName: string
): DomainActionHandler | undefined => HANDLERS[domainName]?.[actionName];
