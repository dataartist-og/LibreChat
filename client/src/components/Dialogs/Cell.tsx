import { useEffect, useState } from 'react';
import { Edit3, Play, Save } from 'lucide-react';
import type {
  TDialogCell,
  TDialogClarification,
  TDialogVisualization,
} from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useExecuteDialogCellMutation, useUpdateDialogCellMutation } from '~/data-provider/Dialogs';
import AnnotatedDialogCell from './Annotated';

function getPlaceholder(cell: TDialogCell): string {
  if (cell.metadataJson?.cellRole === 'checkpoint') {
    return 'Write your explanation or teach-back here before running the checkpoint.';
  }

  const { cellType } = cell;
  if (cellType === 'code') {
    return 'from pathlib import Path\n\nrepo = Path(repo_root)';
  }

  if (cellType === 'prompt') {
    return 'Ask the teaching assistant what to inspect next.';
  }

  return 'Write a note cell.';
}

function getCellContent(cell: TDialogCell): string {
  return cell.cellType === 'code' ? (cell.sourceCode ?? '') : (cell.sourceMarkdown ?? '');
}

function getCheckpointPrompt(cell: TDialogCell): string | null {
  return cell.metadataJson?.cellRole === 'checkpoint'
    ? (cell.metadataJson.checkpointPrompt ?? null)
    : null;
}

function getBadgeClassName(cellType: TDialogCell['cellType']): string {
  if (cellType === 'note') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }

  if (cellType === 'code') {
    return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
  }

  if (cellType === 'prompt') {
    return 'bg-violet-500/15 text-violet-700 dark:text-violet-300';
  }

  return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
}

export default function DialogCellCard({
  dialogId,
  cell,
  clarifications,
  visualizations,
}: {
  dialogId: string;
  cell: TDialogCell;
  clarifications: TDialogClarification[];
  visualizations: TDialogVisualization[];
}) {
  const localize = useLocalize();
  const updateCellMutation = useUpdateDialogCellMutation();
  const executeCellMutation = useExecuteDialogCellMutation();
  const [isEditing, setIsEditing] = useState(
    cell.cellType === 'prompt' || cell.cellType === 'code',
  );
  const [title, setTitle] = useState(cell.title ?? '');
  const [content, setContent] = useState(getCellContent(cell));
  const checkpointPrompt = getCheckpointPrompt(cell);

  useEffect(() => {
    setTitle(cell.title ?? '');
    setContent(getCellContent(cell));
    setIsEditing(cell.cellType === 'prompt' || cell.cellType === 'code');
  }, [cell]);

  const saveCell = async () => {
    await updateCellMutation.mutateAsync({
      dialogId,
      cellId: cell.cellId,
      title,
      sourceMarkdown: cell.cellType === 'code' ? undefined : content,
      sourceCode: cell.cellType === 'code' ? content : undefined,
    });

    if (cell.cellType === 'note') {
      setIsEditing(false);
    }
  };

  const executeCell = async () => {
    if (content !== getCellContent(cell)) {
      await saveCell();
    }

    await executeCellMutation.mutateAsync({
      dialogId,
      cellId: cell.cellId,
    });
  };

  const showEditor = isEditing || cell.cellType === 'code' || cell.cellType === 'prompt';
  const badgeClassName = getBadgeClassName(cell.cellType);

  return (
    <article className="rounded-2xl border border-border-light bg-surface-primary shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${badgeClassName}`}
          >
            {cell.cellType}
          </span>
          <div className="text-sm font-medium text-text-primary">
            {cell.title || localize('com_ui_untitled')}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cell.cellType === 'note' ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
              onClick={() => setIsEditing((current) => !current)}
            >
              <Edit3 className="h-4 w-4" />
              {localize('com_ui_edit')}
            </button>
          ) : null}
          {showEditor ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
              onClick={() => saveCell()}
            >
              <Save className="h-4 w-4" />
              {localize('com_ui_save')}
            </button>
          ) : null}
          {cell.cellType === 'code' || cell.cellType === 'prompt' ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl bg-text-primary px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:text-black"
              onClick={() => executeCell()}
            >
              <Play className="h-4 w-4" />
              {cell.cellType === 'code' ? localize('com_ui_run') : localize('com_ui_send')}
            </button>
          ) : null}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        {showEditor ? (
          <div className="space-y-3">
            {checkpointPrompt ? (
              <div className="bg-surface-hover/40 rounded-xl border border-border-light px-3 py-3 text-sm text-text-primary">
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_dialog_checkpoint_prompt')}
                </div>
                <div>{checkpointPrompt}</div>
              </div>
            ) : null}
            <input
              className="w-full rounded-xl border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={localize('com_ui_title')}
            />
            <textarea
              className={`w-full rounded-xl border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary outline-none ${
                cell.cellType === 'code' ? 'min-h-[220px] font-mono' : 'min-h-[160px]'
              }`}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={getPlaceholder(cell)}
            />
          </div>
        ) : null}

        {(!showEditor || cell.cellType === 'code') &&
        (cell.cellType === 'note' || cell.cellType === 'output') ? (
          <AnnotatedDialogCell
            dialogId={dialogId}
            cell={cell}
            clarifications={clarifications}
            visualizations={visualizations}
          />
        ) : null}
      </div>
    </article>
  );
}
