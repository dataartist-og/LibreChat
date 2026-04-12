import { buildClarificationMessages, buildClarificationSuggestionMessages } from './prompt';

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

describe('buildClarificationSuggestionMessages', () => {
  it('asks for structured clarification options and uses existing clarifications as context', () => {
    const messages = buildClarificationSuggestionMessages({
      selectedText: 'The module is over \\(\\mathbb{Z}\\).',
      contextBefore: 'Before',
      contextAfter: 'After',
      recentMessages: [],
      projectSources: [],
      projectFiles: [],
      existingClarifications: [
        {
          question: 'What changes over integers?',
          answer: 'You lose division by non-units.',
        },
      ],
    });

    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('content_profile');
    expect(messages[0]?.content).toContain('proposed_question');
    expect(messages[0]?.content).toContain(
      'Infer whether the local material is primarily conceptual',
    );
    expect(messages[1]?.content).toContain('Existing inline clarifications');
    expect(messages[1]?.content).toContain('What changes over integers?');
  });
});
