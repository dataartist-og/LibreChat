import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Globe2, Search, Upload } from 'lucide-react';
import { Spinner, useToastContext } from '@librechat/client';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { useUploadFileMutation } from '~/data-provider/Files/mutations';
import {
  useCreateStudyDocumentMutation,
  useExploreStudyDocumentsQuery,
  useImportStudyDocumentMutation,
  useStudyDocumentsQuery,
} from '~/data-provider/Documents';

export default function DocumentsSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const localize = useLocalize();
  const navigate = useNavigate();
  const { documentId } = useParams();
  const [searchParams] = useSearchParams();
  const { showToast } = useToastContext();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'library' | 'explore'>(
    searchParams.get('mode') === 'explore' ? 'explore' : 'library',
  );

  const { data: documents = [], isLoading: isLibraryLoading } = useStudyDocumentsQuery();
  const { data: exploreDocuments = [], isLoading: isExploreLoading } = useExploreStudyDocumentsQuery();
  const createDocumentMutation = useCreateStudyDocumentMutation();
  const importDocumentMutation = useImportStudyDocumentMutation();
  const uploadMutation = useUploadFileMutation({
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : localize('com_ui_document_upload_failed');
      showToast({ message, status: 'error' });
    },
  });

  useEffect(() => {
    setScope(searchParams.get('mode') === 'explore' ? 'explore' : 'library');
  }, [searchParams]);

  const activeDocuments = scope === 'explore' ? exploreDocuments : documents;
  const isLoading = scope === 'explore' ? isExploreLoading : isLibraryLoading;

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return activeDocuments;
    }

    return activeDocuments.filter((document) =>
      document.title.toLowerCase().includes(normalizedSearch),
    );
  }, [activeDocuments, search]);

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
          {scope === 'explore'
            ? localize('com_ui_no_shared_documents')
            : localize('com_ui_no_documents')}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {filteredDocuments.map((document) => {
          const isActive =
            document.documentId === documentId &&
            (scope === 'explore' ? searchParams.get('mode') === 'explore' : searchParams.get('mode') !== 'explore');

          return (
            <div
              key={document.documentId}
              className={`rounded-xl px-3 py-3 transition ${
                isActive
                  ? 'bg-surface-active-alt text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <button
                type="button"
                className="flex w-full items-start gap-3 text-left"
                onClick={() =>
                  navigate(
                    document.isImported
                      ? `/docs/${document.documentId}`
                      : `/docs/${document.documentId}?mode=explore`,
                  )
                }
              >
                <FileText className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{document.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                    <span>{new Date(document.updatedAt).toLocaleString()}</span>
                    {scope === 'explore' ? (
                      <span className="inline-flex items-center gap-1">
                        <Globe2 className="h-3 w-3" />
                        {localize('com_ui_document_public')}
                      </span>
                    ) : null}
                    {document.isImported ? <span>{localize('com_ui_document_imported')}</span> : null}
                  </div>
                </div>
              </button>
              {scope === 'explore' && !document.isImported ? (
                <button
                  type="button"
                  className="mt-3 flex items-center gap-2 rounded-lg border border-border-light px-2 py-1 text-xs text-text-primary transition hover:bg-surface-hover"
                  onClick={async (event) => {
                    event.stopPropagation();
                    const workspace = await importDocumentMutation.mutateAsync({
                      documentId: document.documentId,
                    });
                    navigate(`/docs/${workspace.document.documentId}`);
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  {localize('com_ui_document_import')}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              scope === 'library'
                ? 'bg-surface-active-alt text-text-primary'
                : 'border border-border-light text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
            onClick={() => {
              setScope('library');
              navigate('/docs');
            }}
          >
            {localize('com_ui_my_documents')}
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              scope === 'explore'
                ? 'bg-surface-active-alt text-text-primary'
                : 'border border-border-light text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
            onClick={() => {
              setScope('explore');
              navigate('/docs?mode=explore');
            }}
          >
            {localize('com_ui_explore_documents')}
          </button>
        </div>
      </div>

      {scope === 'library' ? (
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
      ) : null}

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {scope === 'explore'
            ? localize('com_ui_explore_documents')
            : localize('com_ui_document_workspace')}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">{renderDocumentList()}</div>
      </div>
    </div>
  );
}
