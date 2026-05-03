import { useEffect } from 'react';
import { Spinner } from '@librechat/client';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import {
  useExploreStudyDocumentsQuery,
  useStudyDocumentWorkspaceQuery,
  useStudyDocumentsQuery,
} from '~/data-provider/Documents';
import { DocumentWorkspace } from '~/components/Documents';

export default function DocumentRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { documentId } = useParams();
  const [searchParams] = useSearchParams();
  const accessMode = searchParams.get('mode') === 'explore' ? 'explore' : 'library';
  const documentsQuery = useStudyDocumentsQuery();
  const exploreDocumentsQuery = useExploreStudyDocumentsQuery(undefined, {
    enabled: accessMode === 'explore',
  });
  const workspaceQuery = useStudyDocumentWorkspaceQuery(documentId, accessMode, {
    enabled: !!documentId,
  });
  const activeDocuments =
    accessMode === 'explore' ? exploreDocumentsQuery.data : documentsQuery.data;
  const activeDocumentsLength = activeDocuments?.length ?? 0;
  const isActiveDocumentsLoading =
    accessMode === 'explore' ? exploreDocumentsQuery.isLoading : documentsQuery.isLoading;

  useEffect(() => {
    if (documentId || !activeDocuments?.[0]?.documentId) {
      return;
    }

    const nextDocument =
      accessMode === 'explore'
        ? activeDocuments.find((document) => !document.isImported) ?? activeDocuments[0]
        : activeDocuments[0];
    const nextPath =
      accessMode === 'explore' && !nextDocument.isImported
        ? `/docs/${nextDocument.documentId}?mode=explore`
        : `/docs/${nextDocument.documentId}`;

    navigate(
      nextPath,
      { replace: true },
    );
  }, [accessMode, activeDocuments, documentId, navigate]);

  if (!documentId && isActiveDocumentsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (!documentId && activeDocumentsLength > 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (
    !documentId &&
    activeDocumentsLength === 0
  ) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-dashed border-border-light px-6 py-8 text-text-secondary">
          {accessMode === 'explore'
            ? localize('com_ui_document_explore_empty_state')
            : localize('com_ui_document_empty_state')}
        </div>
      </div>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-border-light px-6 py-8 text-text-secondary">
          {localize('com_ui_document_load_failed')}
        </div>
      </div>
    );
  }

  if (workspaceQuery.isLoading || !workspaceQuery.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  return <DocumentWorkspace workspace={workspaceQuery.data} />;
}
