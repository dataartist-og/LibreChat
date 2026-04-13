import { useEffect } from 'react';
import { Spinner } from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { DialogWorkspace } from '~/components/Dialogs';
import { useDialogWorkspaceQuery, useDialogsQuery } from '~/data-provider/Dialogs';

export default function DialogRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { dialogId } = useParams();
  const dialogsQuery = useDialogsQuery();
  const workspaceQuery = useDialogWorkspaceQuery(dialogId, {
    enabled: !!dialogId,
  });

  useEffect(() => {
    if (dialogId || !dialogsQuery.data?.[0]?.dialogId) {
      return;
    }

    navigate(`/dialogs/${dialogsQuery.data[0].dialogId}`, { replace: true });
  }, [dialogId, dialogsQuery.data, navigate]);

  if (!dialogId && dialogsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (!dialogId && (dialogsQuery.data?.length ?? 0) === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-dashed border-border-light px-6 py-8 text-text-secondary">
          {localize('com_ui_dialog_empty_state')}
        </div>
      </div>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-border-light px-6 py-8 text-text-secondary">
          {localize('com_ui_dialog_load_failed')}
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

  return <DialogWorkspace workspace={workspaceQuery.data} />;
}
