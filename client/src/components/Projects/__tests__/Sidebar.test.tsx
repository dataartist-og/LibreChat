import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import ProjectSidebar from '../Sidebar';
import store from '~/store';

const mockNewConversation = jest.fn();
const mockUseProjectsQuery = jest.fn();
const mockUseCreateProjectMutation = jest.fn();
const mockUseUpdateProjectMutation = jest.fn();
const mockUseArchiveProjectMutation = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNewConvo: () => ({
    newConversation: mockNewConversation,
  }),
}));

jest.mock('~/data-provider', () => ({
  useProjectsQuery: (...args: unknown[]) => mockUseProjectsQuery(...args),
  useCreateProjectMutation: (...args: unknown[]) => mockUseCreateProjectMutation(...args),
  useUpdateProjectMutation: (...args: unknown[]) => mockUseUpdateProjectMutation(...args),
  useArchiveProjectMutation: (...args: unknown[]) => mockUseArchiveProjectMutation(...args),
}));

describe('ProjectSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProjectsQuery.mockReturnValue({
      data: [
        {
          projectId: 'project-1',
          name: 'General',
          description: null,
          color: '#64748b',
        },
        {
          projectId: 'project-2',
          name: 'Biochemistry',
          description: 'Metabolism',
          color: '#10b981',
        },
      ],
    });
    mockUseCreateProjectMutation.mockReturnValue({ mutateAsync: jest.fn() });
    mockUseUpdateProjectMutation.mockReturnValue({ mutateAsync: jest.fn() });
    mockUseArchiveProjectMutation.mockReturnValue({ mutateAsync: jest.fn() });
  });

  it('renders the project switcher and switches the active project', () => {
    render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.activeProjectId, 'project-1');
          set(store.conversationByIndex(0), {
            conversationId: 'conversation-1',
            title: 'Current conversation',
            projectId: 'project-1',
          });
        }}
      >
        <ProjectSidebar />
      </RecoilRoot>,
    );

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Biochemistry')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Biochemistry'));

    expect(mockNewConversation).toHaveBeenCalledWith({
      template: {
        projectId: 'project-2',
      },
    });
  });
});
