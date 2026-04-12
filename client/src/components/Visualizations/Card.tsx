import { useEffect, useState } from 'react';
import {
  Copy,
  Expand,
  GitMerge,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import type { TVisualization } from 'librechat-data-provider';
import {
  useDeleteVisualizationMutation,
  useDuplicateVisualizationMutation,
  useIntegrateVisualizationMutation,
  useRegenerateVisualizationMutation,
  useRefineVisualizationMutation,
  useUpdateVisualizationMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import VisualizationRenderer from './Renderer';

type VisualizationCardProps = {
  visualization: TVisualization;
  conversationId: string;
  parentMessageId: string;
  integrated?: boolean;
};

export default function VisualizationCard({
  visualization,
  conversationId,
  parentMessageId,
  integrated = false,
}: VisualizationCardProps) {
  const localize = useLocalize();
  const updateMutation = useUpdateVisualizationMutation();
  const regenerateMutation = useRegenerateVisualizationMutation();
  const refineMutation = useRefineVisualizationMutation();
  const integrateMutation = useIntegrateVisualizationMutation();
  const duplicateMutation = useDuplicateVisualizationMutation();
  const deleteMutation = useDeleteVisualizationMutation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(visualization.title);
  const [description, setDescription] = useState(visualization.description);
  const [sourcePrompt, setSourcePrompt] = useState(visualization.sourcePrompt);
  const [source, setSource] = useState(visualization.canonicalSourceText);
  const [refinementInstruction, setRefinementInstruction] = useState('');

  useEffect(() => {
    setTitle(visualization.title);
    setDescription(visualization.description);
    setSourcePrompt(visualization.sourcePrompt);
    setSource(visualization.canonicalSourceText);
  }, [
    visualization.canonicalSourceText,
    visualization.description,
    visualization.sourcePrompt,
    visualization.title,
  ]);

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      visualizationId: visualization.visualizationId,
      title,
      description,
      sourcePrompt,
      canonicalSourceText: source,
      conversationId,
      parentMessageId,
    });
    setEditing(false);
  };

  const hasUnsavedEdits =
    title !== visualization.title ||
    description !== visualization.description ||
    sourcePrompt !== visualization.sourcePrompt ||
    source !== visualization.canonicalSourceText;

  const handleRefine = async () => {
    if (!refinementInstruction.trim()) {
      return;
    }

    if (hasUnsavedEdits) {
      await updateMutation.mutateAsync({
        visualizationId: visualization.visualizationId,
        title,
        description,
        sourcePrompt,
        canonicalSourceText: source,
        conversationId,
        parentMessageId,
      });
    }

    await refineMutation.mutateAsync({
      visualizationId: visualization.visualizationId,
      instruction: refinementInstruction.trim(),
      conversationId,
      parentMessageId,
    });
    setRefinementInstruction('');
    setEditing(false);
  };

  const handleIntegrate = async () => {
    await integrateMutation.mutateAsync({
      visualizationId: visualization.visualizationId,
      messageId: parentMessageId,
      displayMode: visualization.integrationState === 'integrated' ? 'nested' : 'integrated',
      conversationId,
      parentMessageId,
    });
  };

  const metadata = [
    visualization.artifactType,
    `v${visualization.versionNumber}`,
    visualization.status,
    visualization.generationModel,
  ]
    .filter(Boolean)
    .join(' • ');

  const actionButtonClasses =
    'rounded-md p-1.5 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary';

  return (
    <>
      <div
        className={`rounded-2xl border p-3 shadow-sm ${
          integrated
            ? 'border-sky-500/30 bg-sky-500/5'
            : 'bg-surface-primary/95 border-border-light'
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-text-primary">
                {visualization.title}
              </div>
              {visualization.integrationState === 'integrated' ? (
                <span className="inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                  {localize('com_ui_integrated')}
                </span>
              ) : null}
            </div>
            {visualization.description ? (
              <div className="mt-1 text-sm text-text-secondary">{visualization.description}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_edit')}
              title={localize('com_ui_edit')}
              onClick={() => setEditing((prev) => !prev)}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_regenerate')}
              title={localize('com_ui_regenerate')}
              onClick={() =>
                regenerateMutation.mutateAsync({
                  visualizationId: visualization.visualizationId,
                  conversationId,
                  parentMessageId,
                })
              }
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_duplicate')}
              title={localize('com_ui_duplicate')}
              onClick={() =>
                duplicateMutation.mutateAsync({
                  visualizationId: visualization.visualizationId,
                  conversationId,
                  parentMessageId,
                })
              }
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_integrate_into_parent')}
              title={localize('com_ui_integrate_into_parent')}
              onClick={handleIntegrate}
            >
              <GitMerge className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_open')}
              title={localize('com_ui_open')}
              onClick={() => setOpen(true)}
            >
              <Expand className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_delete')}
              title={localize('com_ui_delete')}
              onClick={() =>
                deleteMutation.mutateAsync({
                  visualizationId: visualization.visualizationId,
                  conversationId,
                  parentMessageId,
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <VisualizationRenderer visualization={visualization} />

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span>{metadata}</span>
          {visualization.generationMetadata?.warnings?.length ? (
            <span>{visualization.generationMetadata.warnings.join(' ')}</span>
          ) : null}
        </div>

        {editing ? (
          <div className="bg-surface-secondary/30 mt-4 space-y-3 rounded-xl border border-border-light p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-text-primary">
                <div className="mb-1 font-medium">{localize('com_ui_title')}</div>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-border-medium bg-transparent px-3 py-2 text-sm outline-none focus:border-border-heavy"
                />
              </label>
              <label className="text-sm text-text-primary">
                <div className="mb-1 font-medium">{localize('com_ui_description')}</div>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full rounded-lg border border-border-medium bg-transparent px-3 py-2 text-sm outline-none focus:border-border-heavy"
                />
              </label>
            </div>
            <label className="block text-sm text-text-primary">
              <div className="mb-1 font-medium">{localize('com_ui_visualization_prompt')}</div>
              <textarea
                value={sourcePrompt}
                onChange={(event) => setSourcePrompt(event.target.value)}
                className="min-h-[80px] w-full rounded-lg border border-border-medium bg-transparent px-3 py-2 text-sm outline-none focus:border-border-heavy"
              />
            </label>
            <label className="block text-sm text-text-primary">
              <div className="mb-1 font-medium">{localize('com_ui_source_code')}</div>
              <textarea
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="min-h-[220px] w-full rounded-lg border border-border-medium bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-border-heavy"
              />
            </label>
            <label className="block text-sm text-text-primary">
              <div className="mb-1 font-medium">{localize('com_ui_visualization_follow_up')}</div>
              <textarea
                value={refinementInstruction}
                onChange={(event) => setRefinementInstruction(event.target.value)}
                placeholder={localize('com_ui_visualization_follow_up_placeholder')}
                className="min-h-[96px] w-full rounded-lg border border-border-medium bg-transparent px-3 py-2 text-sm outline-none focus:border-border-heavy"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => {
                  setTitle(visualization.title);
                  setDescription(visualization.description);
                  setSourcePrompt(visualization.sourcePrompt);
                  setSource(visualization.canonicalSourceText);
                  setRefinementInstruction('');
                  setEditing(false);
                }}
              >
                <X className="mr-1 h-4 w-4" />
                {localize('com_ui_cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave}>
                <Save className="mr-1 h-4 w-4" />
                {localize('com_ui_save')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={refineMutation.isLoading || refinementInstruction.trim().length === 0}
                onClick={handleRefine}
              >
                <WandSparkles className="mr-1 h-4 w-4" />
                {localize('com_ui_refine_visualization')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogContent className="max-h-[95vh] max-w-[95vw] overflow-y-auto sm:max-w-[90vw]">
          <OGDialogHeader>
            <OGDialogTitle>{visualization.title}</OGDialogTitle>
          </OGDialogHeader>
          <VisualizationRenderer visualization={visualization} expanded />
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
