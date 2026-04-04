import { buildClarificationMessages } from './prompt';

describe('buildClarificationMessages', () => {
  it('includes the shared math formatting guidance in the clarification system prompt', () => {
    const messages = buildClarificationMessages({
      selectedText: 'The module is over \\(\\mathbb{Z}\\).',
      contextBefore: 'Before',
      contextAfter: 'After',
      clarificationQuestion: 'What does that change?',
      recentMessages: [],
      projectSources: [],
      projectFiles: [],
    });

    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('Prioritize beautiful math rendering');
    expect(messages[0]?.content).toContain('\\mathbb{Z}');
    expect(messages[0]?.content).toContain('\\(...\\)');
    expect(messages[0]?.content).toContain('\\[...\\]');
  });
});
