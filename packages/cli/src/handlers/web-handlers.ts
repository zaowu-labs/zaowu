import { fetchWebTarget, inspectWebTarget } from '@zaowu/web';
import {
  assertOperationPlanFingerprint,
  createOperationPlan,
  formatConfirmCommand,
  formatObject,
  formatOperationPlan,
  requireTarget,
  result,
  withOperationPlan,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleWebInspect: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw web inspect');
  const preview = await inspectWebTarget(target);
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [`web:${preview.url}`],
    network: [preview.url],
    notes: ['Web inspect sends a HEAD request only when --yes is provided.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const inspected = context.yes ? await inspectWebTarget(target, { yes: true }) : preview;
  const confirmCommand = !context.yes
    ? formatConfirmCommand([
        'zw',
        'web',
        'inspect',
        target,
        '--yes',
        '--plan-fingerprint',
        operationPlan.fingerprint,
      ])
    : undefined;
  const human = [
    'ZaoWu Web Inspect',
    '',
    `Status: ${inspected.status}`,
    `URL: ${inspected.url}`,
    inspected.statusCode
      ? `HTTP: ${inspected.statusCode} ${inspected.statusText ?? ''}`
      : 'HTTP: not requested',
    '',
    formatOperationPlan(operationPlan),
    ...(confirmCommand ? ['', 'To inspect exactly this URL, run:', `  ${confirmCommand}`] : []),
    '',
    Object.keys(inspected.headers).length > 0 ? formatObject(inspected.headers) : 'Headers: none',
  ].join('\n');

  return result(context, withOperationPlan(inspected, operationPlan), human);
};

export const handleWebFetch: DomainActionHandler = async (args, context) => {
  const target = requireTarget(args, 'zw web fetch');
  const preview = await fetchWebTarget(target);
  const operationPlan = createOperationPlan({
    risk: 'medium',
    confirmationRequired: !context.yes,
    subjects: [`web:${preview.url}`],
    network: [preview.url],
    notes: ['Web fetch sends a GET request only when --yes is provided.'],
  });
  assertOperationPlanFingerprint(context, operationPlan);

  const fetched = context.yes ? await fetchWebTarget(target, { yes: true }) : preview;
  const confirmCommand = !context.yes
    ? formatConfirmCommand([
        'zw',
        'web',
        'fetch',
        target,
        '--yes',
        '--plan-fingerprint',
        operationPlan.fingerprint,
      ])
    : undefined;
  const human = [
    'ZaoWu Web Fetch',
    '',
    `Status: ${fetched.status}`,
    `URL: ${fetched.url}`,
    fetched.statusCode
      ? `HTTP: ${fetched.statusCode} ${fetched.statusText ?? ''}`
      : 'HTTP: not requested',
    fetched.status === 'ok'
      ? `Body: ${fetched.bodyLength ?? 0} characters${fetched.bodyTruncated ? ` (truncated to ${fetched.maxBodyLength ?? 0})` : ''}`
      : 'Body: not requested',
    '',
    formatOperationPlan(operationPlan),
    ...(confirmCommand ? ['', 'To fetch exactly this URL, run:', `  ${confirmCommand}`] : []),
    '',
    fetched.body ?? '',
  ].join('\n');

  return result(context, withOperationPlan(fetched, operationPlan), human);
};
