import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { Spinner } from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { useStudyDocumentWorkspaceQuery, useStudyDocumentsQuery } from '~/data-provider/Documents';
import { DocumentWorkspace } from '~/components/Documents';
import store from '~/store';

export default function DocumentRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { documentId } = useParams();
  const activeProjectId = useRecoilValue(store.activeProjectId);
  const documentsQuery = useStudyDocumentsQuery(activeProjectId ?? undefined);
  const workspaceQuery = useStudyDocumentWorkspaceQuery(documentId, {
    enabled: !!documentId,
  });

  useEffect(() => {
    if (documentId || !documentsQuery.data?.[0]?.documentId) {
      return;
    }

    navigate(`/docs/${documentsQuery.data[0].documentId}`, { replace: true });
  }, [documentId, documentsQuery.data, navigate]);

  if (!documentId && documentsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (!documentId && (documentsQuery.data?.length ?? 0) === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-dashed border-border-light px-6 py-8 text-text-secondary">
          {localize('com_ui_document_empty_state')}
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
