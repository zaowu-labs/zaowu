import { createTeachingPlan, createTeachingQuiz } from '@zaowu/teach';
import {
  getValue,
  parsePositiveInteger,
  result,
  type DomainActionHandler,
} from '../handler-utils.js';

export const handleTeachPlan: DomainActionHandler = async (args, context) => {
  const plan = await createTeachingPlan(args.join(' '));
  const human = [
    'ZaoWu Teach Plan',
    '',
    `Topic: ${plan.topic}`,
    '',
    ...plan.outline.map((item) => `- ${item}`),
  ].join('\n');

  return result(context, plan, human);
};

export const handleTeachQuiz: DomainActionHandler = async (args, context) => {
  const format = getValue(context.parsed, '--format');
  const count = parsePositiveInteger(getValue(context.parsed, '--count'), 3);
  const quiz = await createTeachingQuiz(args.join(' '), { format, count });
  const human =
    quiz.format === 'canvas-csv'
      ? (quiz.content ?? '')
      : [
          'ZaoWu Teach Quiz',
          '',
          `Topic: ${quiz.topic}`,
          `Questions: ${quiz.questionCount}`,
          '',
          ...quiz.questions,
        ].join('\n');

  return result(context, quiz, human);
};
