import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, waitFor } from '@testing-library/react';
import DocumentsSection from '../Section';

const mockNavigate = jest.fn();
const mockShowToast = jest.fn();
const mockUploadFile = jest.fn();
const mockCreateDocument = jest.fn();
const mockUseStudyDocumentsQuery = jest.fn();
const mockUseExploreStudyDocumentsQuery = jest.fn();
const mockImportDocument = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  Spinner: () => <div>loading</div>,
  useToastContext: () => ({
    showToast: mockShowToast,
  }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/docs' }),
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams()],
}));

jest.mock('~/data-provider/Files/mutations', () => ({
  useUploadFileMutation: () => ({
    mutateAsync: mockUploadFile,
    isLoading: false,
  }),
}));

jest.mock('~/data-provider/Documents', () => ({
  useCreateStudyDocumentMutation: () => ({
    mutateAsync: mockCreateDocument,
    isLoading: false,
  }),
  useImportStudyDocumentMutation: () => ({
    mutateAsync: mockImportDocument,
    isLoading: false,
  }),
  useStudyDocumentsQuery: (...args: unknown[]) => mockUseStudyDocumentsQuery(...args),
  useExploreStudyDocumentsQuery: (...args: unknown[]) => mockUseExploreStudyDocumentsQuery(...args),
}));

describe('DocumentsSection', () => {
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
    mockUploadFile.mockResolvedValue({
      file_id: 'file-1',
      filename: 'theory.pdf',
    });
    mockCreateDocument.mockResolvedValue({
      document: {
        documentId: 'document-1',
      },
    });
    mockImportDocument.mockResolvedValue({
      document: {
        documentId: 'document-2',
      },
    });
  });

  it('uses the unscoped documents query in the global docs workspace', () => {
    render(<DocumentsSection />);

    expect(mockUseStudyDocumentsQuery).toHaveBeenCalledWith();
  });

  it('uploads documents without leaking a stale projectId into the global docs workspace', async () => {
    const { container } = render(<DocumentsSection />);
    const input = container.querySelector('input[type="file"]');

    expect(input).not.toBeNull();
    if (!input) {
      return;
    }

    const file = new File(['pdf'], 'theory.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUploadFile).toHaveBeenCalledTimes(1);
    });

    const formData = mockUploadFile.mock.calls[0][0] as FormData;
    expect(formData.get('projectId')).toBeNull();

    await waitFor(() => {
      expect(mockCreateDocument).toHaveBeenCalledWith({
        sourceFileId: 'file-1',
        title: 'theory.pdf',
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/docs/document-1');
    });
  });
});
