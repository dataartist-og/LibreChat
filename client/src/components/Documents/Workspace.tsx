import type { TDocumentWorkspace } from 'librechat-data-provider';
import { RotateCcw } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useReingestStudyDocumentMutation } from '~/data-provider/Documents';
import DocumentViewer from './Viewer';

export default function DocumentWorkspace({ workspace }: { workspace: TDocumentWorkspace }) {
  const localize = useLocalize();
  const reingestMutation = useReingestStudyDocumentMutation();

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-surface-primary">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-border-light px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {localize('com_ui_document_workspace')}
              </div>
              <h1 className="mt-1 truncate text-2xl font-semibold text-text-primary">
                {workspace.document.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                <span>
                  {localize('com_ui_document_source')}: {workspace.document.sourceKind}
                </span>
                <span>
                  {localize('com_ui_document_render_version')}:{' '}
                  {workspace.renderVersion.versionNumber}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
              onClick={() =>
                reingestMutation.mutateAsync({
                  documentId: workspace.document.documentId,
                })
              }
            >
              <RotateCcw className="h-4 w-4" />
              {localize('com_ui_reingest_document')}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            <DocumentViewer workspace={workspace} />
          </div>

          <aside className="hidden w-72 flex-shrink-0 border-l border-border-light xl:block">
            <div className="h-full overflow-y-auto px-4 py-6">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {localize('com_ui_document_outline')}
              </div>
              <div className="space-y-1">
                {workspace.renderVersion.outlineJson.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                    style={{ paddingLeft: `${item.depth * 12 + 12}px` }}
                    onClick={() =>
                      document
                        .getElementById(`document-block-${item.blockId}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
