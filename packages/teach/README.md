# @zaowu-labs/teach

Teaching workflow package for ZaoWu.

This package provides deterministic local teaching-plan and quiz generation for
the first CLI foundation.

Call `createTeachingQuiz("lesson.md")` from Node.js or run `zw teach quiz lesson.md`
with the [ZaoWu CLI](https://www.npmjs.com/package/@zaowu-labs/cli). A literal topic works too, for example
`zw teach plan "Git staging"`.

Plans and quizzes use Markdown headings and prose outside YAML frontmatter and
code blocks. A quiz draws questions from prose when available and uses heading
titles for a heading-only outline. Empty material needs a heading or a sentence.

Safety:

- It does not call external AI services.
- Future AI-backed teaching behavior should go through `@zaowu-labs/ai`.
- User-facing commands should keep output readable before adding complexity.
- File inputs resolve against the supplied working directory and are limited
  to one MiB. Unreadable/oversized files fail with recovery guidance.
  Nonexistent paths retain literal-topic behavior; literal input is limited to one
  million characters.
- Teaching files accept UTF-8 and BOM-marked UTF-16 in either byte order.
  The decoder strips the encoding mark and reports invalid bytes or NUL
  characters before generating a plan or quiz.
