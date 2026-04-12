import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search, Upload } from 'lucide-react';
import { Spinner, useToastContext } from '@librechat/client';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { useUploadFileMutation } from '~/data-provider/Files/mutations';
import { useCreateStudyDocumentMutation, useStudyDocumentsQuery } from '~/data-provider/Documents';

export default function DocumentsSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const { documentId } = useParams();
  const { showToast } = useToastContext();
  const [search, setSearch] = useState('');

  const { data: documents = [], isLoading } = useStudyDocumentsQuery();
  const createDocumentMutation = useCreateStudyDocumentMutation();
  const uploadMutation = useUploadFileMutation({
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : localize('com_ui_document_upload_failed');
      showToast({ message, status: 'error' });
    },
  });

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return documents;
    }

    return documents.filter((document) => document.title.toLowerCase().includes(normalizedSearch));
  }, [documents, search]);

  const renderDocumentList = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      );
    }

    if (filteredDocuments.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border-light px-4 py-6 text-sm text-text-secondary">
          {localize('com_ui_no_documents')}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {filteredDocuments.map((document) => {
          const isActive = document.documentId === documentId;

          return (
            <button
              key={document.documentId}
              type="button"
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                isActive
                  ? 'bg-surface-active-alt text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
              onClick={() => navigate(`/docs/${document.documentId}`)}
            >
              <FileText className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{document.title}</div>
                <div className="mt-1 text-xs opacity-80">
                  {new Date(document.updatedAt).toLocaleString()}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    if (location.pathname.startsWith('/docs')) {
      return;
    }

    if (documents[0]?.documentId) {
      navigate(`/docs/${documents[0].documentId}`, { replace: true });
      return;
    }

    navigate('/docs', { replace: true });
  }, [documents, location.pathname, navigate]);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('endpoint', 'openAI');
    formData.append('endpointType', 'openAI');
    formData.append('message_file', 'true');
    formData.append('tool_resource', 'context');
    formData.append('file_id', crypto.randomUUID());
    formData.append('file', file, encodeURIComponent(file.name));

    try {
      const uploadedFile = await uploadMutation.mutateAsync(formData);
      const workspace = await createDocumentMutation.mutateAsync({
        sourceFileId: uploadedFile.file_id,
        title: uploadedFile.filename,
      });

      navigate(`/docs/${workspace.document.documentId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : localize('com_ui_document_create_failed');
      showToast({ message, status: 'error' });
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden pb-3"
      role="region"
      aria-label={localize('com_ui_documents')}
    >
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-border-light bg-surface-primary px-3 py-2">
          <Search className="h-4 w-4 text-text-secondary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={localize('com_ui_document_search_placeholder')}
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
          />
        </div>
      </div>

      <div className="px-3 pt-3">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.markdown,.txt,.docx,.epub,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            void handleUpload(file);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-text-primary px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:text-black"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isLoading || createDocumentMutation.isLoading}
        >
          {uploadMutation.isLoading || createDocumentMutation.isLoading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {localize('com_ui_upload_document')}
        </button>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {localize('com_ui_document_workspace')}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">{renderDocumentList()}</div>
      </div>
    </div>
  );
}
