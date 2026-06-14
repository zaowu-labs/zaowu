import { createTeachingPlan, createTeachingQuiz } from '@zaowu/teach';
import { getValue, result, type DomainActionHandler } from '../handler-utils.js';

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
  const quiz = await createTeachingQuiz(args.join(' '), { format });
  const human =
    quiz.format === 'canvas-csv'
      ? (quiz.content ?? '')
      : ['ZaoWu Teach Quiz', '', `Topic: ${quiz.topic}`, '', ...quiz.questions].join('\n');

  return result(context, quiz, human);
};
