import {
  buildVisualizationRefinementMessages,
  buildVisualizationSuggestionMessages,
} from './prompt';

describe('buildVisualizationSuggestionMessages', () => {
  it('asks for structured visualization options and uses existing clarifications as context', () => {
    const messages = buildVisualizationSuggestionMessages({
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
    expect(messages[0]?.content).toContain('artifact_type');
    expect(messages[0]?.content).toContain('proposed_prompt');
    expect(messages[0]?.content).toContain(
      'Infer whether the local material is primarily conceptual',
    );
    expect(messages[1]?.content).toContain('Existing inline clarifications');
    expect(messages[1]?.content).toContain('What changes over integers?');
  });
});

describe('buildVisualizationRefinementMessages', () => {
  it('asks for a full revised artifact using the current source and follow-up instruction', () => {
    const messages = buildVisualizationRefinementMessages({
      artifactType: 'svg',
      selectedText: 'The module is over \\(\\mathbb{Z}\\).',
      contextBefore: 'Before',
      contextAfter: 'After',
      existingPrompt: 'Create a structural diagram for this passage.',
      currentSource: '<svg viewBox="0 0 10 10"></svg>',
      followUpInstruction: 'Add labels that distinguish units from non-units.',
      recentMessages: [],
      projectSources: [],
      projectFiles: [],
    });

    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('revising an existing visualization artifact');
    expect(messages[0]?.content).toContain('Preserve the parts of the current artifact');
    expect(messages[1]?.content).toContain('Current visualization source');
    expect(messages[1]?.content).toContain('<svg viewBox="0 0 10 10"></svg>');
    expect(messages[1]?.content).toContain('Follow-up revision instruction');
    expect(messages[1]?.content).toContain('Add labels that distinguish units from non-units.');
  });
});
