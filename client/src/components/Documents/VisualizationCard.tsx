import { apiBaseUrl, type TDocumentVisualization } from 'librechat-data-provider';
import { GitMerge, Trash2 } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { VisualizationRenderer } from '~/components/Visualizations';
import { useDeleteDocumentVisualizationMutation } from '~/data-provider/Documents';
import { useIntegrateDocumentVisualizationMutation } from '~/data-provider/Documents';

export default function DocumentVisualizationCard({
  visualization,
  documentId,
}: {
  visualization: TDocumentVisualization;
  documentId: string;
}) {
  const localize = useLocalize();
  const integrateMutation = useIntegrateDocumentVisualizationMutation();
  const deleteMutation = useDeleteDocumentVisualizationMutation();
  const isIntegrated = visualization.integrationState === 'integrated';
  const integrateLabel = isIntegrated
    ? localize('com_ui_show_as_nested')
    : localize('com_ui_integrate_into_parent');

  return (
    <div
      data-document-augmentation="true"
      className={`rounded-xl border p-3 shadow-sm ${
        isIntegrated
          ? 'border-sky-500/30 bg-sky-500/5'
          : 'bg-surface-primary/95 border-border-light'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
              {localize('com_ui_visualization')}
            </div>
            {isIntegrated ? (
              <span className="inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                {localize('com_ui_integrated')}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-sm font-medium text-text-primary">
            {visualization.title}
          </div>
          {visualization.description ? (
            <div className="mt-1 text-sm text-text-secondary">{visualization.description}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md p-1.5 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
            aria-label={integrateLabel}
            title={integrateLabel}
            onClick={() =>
              integrateMutation.mutateAsync({
                documentId,
                visualizationId: visualization.visualizationId,
                displayMode: isIntegrated ? 'nested' : 'integrated',
              })
            }
          >
            <GitMerge className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-1.5 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
            aria-label={localize('com_ui_delete')}
            title={localize('com_ui_delete')}
            onClick={() =>
              deleteMutation.mutateAsync({
                documentId,
                visualizationId: visualization.visualizationId,
              })
            }
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <VisualizationRenderer
        visualization={visualization}
        renderUrl={`${apiBaseUrl()}/api/documents/visualizations/${encodeURIComponent(
          visualization.visualizationId,
        )}/render`}
      />
    </div>
  );
}
