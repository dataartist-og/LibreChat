import { useMemo, useState } from 'react';
import { BookOpenText, Plus, Search } from 'lucide-react';
import { Spinner, useToastContext } from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import {
  useCreateDialogMutation,
  useCreateStarterDialogMutation,
  useDialogsQuery,
} from '~/data-provider/Dialogs';

export default function DialogsSection() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { dialogId } = useParams();
  const { showToast } = useToastContext();
  const [search, setSearch] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const { data: dialogs = [], isLoading } = useDialogsQuery();
  const createDialogMutation = useCreateDialogMutation();
  const createStarterDialogMutation = useCreateStarterDialogMutation();

  const filteredDialogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return dialogs;
    }

    return dialogs.filter((dialog) => dialog.title.toLowerCase().includes(normalizedSearch));
  }, [dialogs, search]);

  const renderDialogList = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      );
    }

    if (filteredDialogs.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border-light px-4 py-6 text-sm text-text-secondary">
          {localize('com_ui_no_dialogs')}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {filteredDialogs.map((dialog) => {
          const isActive = dialog.dialogId === dialogId;

          return (
            <button
              key={dialog.dialogId}
              type="button"
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                isActive
                  ? 'bg-surface-active-alt text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
              onClick={() => navigate(`/dialogs/${dialog.dialogId}`)}
            >
              <BookOpenText className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{dialog.title}</div>
                <div className="mt-1 text-xs opacity-80">
                  {new Date(dialog.updatedAt).toLocaleString()}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const handleNewDialog = async () => {
    try {
      const workspace = await createDialogMutation.mutateAsync({});
      navigate(`/dialogs/${workspace.dialog.dialogId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : localize('com_ui_dialog_create_failed');
      showToast({ message, status: 'error' });
    }
  };

  const handleRepoImport = async () => {
    try {
      const workspace = await createStarterDialogMutation.mutateAsync({
        repoUrl: repoUrl.trim(),
      });
      setRepoUrl('');
      navigate(`/dialogs/${workspace.dialog.dialogId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : localize('com_ui_dialog_repo_import_failed');
      showToast({ message, status: 'error' });
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden pb-3"
      role="region"
      aria-label={localize('com_ui_dialogs')}
    >
      <div className="space-y-3 px-3 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-border-light bg-surface-primary px-3 py-2">
          <Search className="h-4 w-4 text-text-secondary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={localize('com_ui_dialog_search_placeholder')}
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
          />
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-text-primary px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:text-black"
          onClick={() => handleNewDialog()}
        >
          <Plus className="h-4 w-4" />
          {localize('com_ui_new_dialog')}
        </button>

        <div className="rounded-2xl border border-border-light bg-surface-primary p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
            {localize('com_ui_import_repo')}
          </div>
          <input
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            className="mb-2 w-full rounded-xl border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
            placeholder={localize('com_ui_dialog_repo_placeholder')}
          />
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
            onClick={() => handleRepoImport()}
            disabled={!repoUrl.trim()}
          >
            <BookOpenText className="h-4 w-4" />
            {localize('com_ui_create_starter_dialog')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {localize('com_ui_dialogs')}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">{renderDialogList()}</div>
      </div>
    </div>
  );
}
