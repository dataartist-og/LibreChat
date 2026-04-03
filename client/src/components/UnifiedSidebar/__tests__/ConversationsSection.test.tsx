import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import ConversationsSection from '../ConversationsSection';
import store from '~/store';

const mockUseConversationsInfiniteQuery = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNewConvo: () => ({
    newConversation: jest.fn(),
  }),
  useHasAccess: () => false,
  useAuthContext: () => ({ isAuthenticated: true }),
  useLocalStorage: () => [true, jest.fn()],
  useNavScrolling: () => ({ moveToTop: jest.fn() }),
}));

jest.mock('~/data-provider', () => ({
  useConversationsInfiniteQuery: (...args: unknown[]) => mockUseConversationsInfiniteQuery(...args),
  useTitleGeneration: jest.fn(),
}));

jest.mock('~/components/Conversations', () => ({
  Conversations: () => <div data-testid="conversations-list" />,
}));

jest.mock('~/components/Projects', () => ({
  ProjectSidebar: () => <div data-testid="project-sidebar" />,
}));

jest.mock('~/components/Nav/SearchBar', () => () => <div data-testid="search-bar" />);

describe('ConversationsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseConversationsInfiniteQuery.mockReturnValue({
      data: { pages: [{ conversations: [], nextCursor: null }] },
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false,
      isLoading: false,
      isFetching: false,
    });
  });

  it('filters conversation queries by the active project', () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.activeProjectId, 'project-123');
            set(store.search, {
              query: '',
              debouncedQuery: '',
              isTyping: false,
            });
          }}
        >
          <ConversationsSection />
        </RecoilRoot>
      </QueryClientProvider>,
    );

    expect(mockUseConversationsInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-123',
      }),
      expect.any(Object),
    );
  });
});
