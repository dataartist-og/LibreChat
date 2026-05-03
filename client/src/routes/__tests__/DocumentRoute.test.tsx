import React from 'react';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import DocumentRoute from '../DocumentRoute';

const mockNavigate = jest.fn();
const mockUseStudyDocumentsQuery = jest.fn();
const mockUseExploreStudyDocumentsQuery = jest.fn();
const mockUseStudyDocumentWorkspaceQuery = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  Spinner: () => <div>loading</div>,
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: jest.fn(() => ({})),
  useSearchParams: jest.fn(() => [new URLSearchParams('mode=explore')]),
}));

jest.mock('~/data-provider/Documents', () => ({
  useStudyDocumentsQuery: (...args: unknown[]) => mockUseStudyDocumentsQuery(...args),
  useExploreStudyDocumentsQuery: (...args: unknown[]) => mockUseExploreStudyDocumentsQuery(...args),
  useStudyDocumentWorkspaceQuery: (...args: unknown[]) =>
    mockUseStudyDocumentWorkspaceQuery(...args),
}));

jest.mock('~/components/Documents', () => ({
  DocumentWorkspace: () => <div>workspace</div>,
}));

describe('DocumentRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStudyDocumentsQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseExploreStudyDocumentsQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseStudyDocumentWorkspaceQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
  });

  it('routes unimported explore documents to shared preview mode', async () => {
    mockUseExploreStudyDocumentsQuery.mockReturnValue({
      data: [
        {
          documentId: 'document-1',
          isImported: false,
        },
      ],
      isLoading: false,
    });

    render(<DocumentRoute />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/docs/document-1?mode=explore', {
        replace: true,
      });
    });
  });

  it('routes imported explore documents to the library workspace', async () => {
    mockUseExploreStudyDocumentsQuery.mockReturnValue({
      data: [
        {
          documentId: 'document-1',
          isImported: true,
        },
      ],
      isLoading: false,
    });

    render(<DocumentRoute />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/docs/document-1', {
        replace: true,
      });
    });
  });

  it('prefers the next unimported explore document before falling back to the library', async () => {
    mockUseExploreStudyDocumentsQuery.mockReturnValue({
      data: [
        {
          documentId: 'document-1',
          isImported: true,
        },
        {
          documentId: 'document-2',
          isImported: false,
        },
      ],
      isLoading: false,
    });

    render(<DocumentRoute />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/docs/document-2?mode=explore', {
        replace: true,
      });
    });
  });
});
