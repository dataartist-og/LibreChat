import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TClarification, TVisualization } from 'librechat-data-provider';
import VisualizationTab from '../Tab';

const mockCreateVisualization = jest.fn();
const mockVisualizationSuggestionsQuery = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useCreateVisualizationMutation: () => ({
    mutateAsync: mockCreateVisualization,
    isLoading: false,
  }),
  useVisualizationSuggestionsQuery: (...args: unknown[]) =>
    mockVisualizationSuggestionsQuery(...args),
}));

jest.mock('../Card', () => ({
  __esModule: true,
  default: ({ visualization }: { visualization: TVisualization }) => (
    <div>{visualization.title}</div>
  ),
}));

const clarifications: TClarification[] = [
  {
    clarificationId: 'clarification-1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    parentMessageId: 'message-1',
    anchorStart: 0,
    anchorEnd: 11,
    anchorText: 'phase plane',
    anchorContextBefore: 'A ',
    anchorContextAfter: ' diagram helps explain the dynamics.',
    clarificationQuestion: 'What does phase plane mean here?',
    clarificationAnswer: 'It shows the state space and its trajectories.',
    status: 'active',
    createdByUserId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('VisualizationTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVisualizationSuggestionsQuery.mockReturnValue({
      data: {
        contentProfile: 'conceptual',
        focusSummary: 'A structural view would likely help explain the highlighted phrase.',
        suggestions: [
          {
            label: 'State-space map',
            artifactType: 'mermaid',
            proposedPrompt:
              'Create a mermaid diagram that shows the phase plane, axes, and trajectory directions for this passage.',
            understandingGain: 'It would make the geometry of the explanation easier to follow.',
            reasoning: 'A compact diagram matches the spatial concept.',
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
  });

  it('prefills the prompt and artifact type from a suggested visualization option', () => {
    render(
      <VisualizationTab
        anchorStart={0}
        anchorEnd={11}
        anchorText="phase plane"
        anchorContextBefore="A "
        anchorContextAfter=" diagram helps explain the dynamics."
        conversationId="conversation-1"
        parentMessageId="message-1"
        projectId="project-1"
        clarifications={clarifications}
        visualizations={[]}
      />,
    );

    fireEvent.click(screen.getByText('State-space map'));

    expect(
      screen.getByDisplayValue(
        'Create a mermaid diagram that shows the phase plane, axes, and trajectory directions for this passage.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_mermaid' })).toHaveClass(
      'bg-surface-active-alt',
    );
  });
});
