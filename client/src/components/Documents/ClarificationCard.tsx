import { Archive, GitMerge } from 'lucide-react';
import type { TDocumentClarification } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useArchiveDocumentClarificationMutation } from '~/data-provider/Documents';
import { useIntegrateDocumentClarificationMutation } from '~/data-provider/Documents';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';

export default function DocumentClarificationCard({
  clarification,
  documentId,
}: {
  clarification: TDocumentClarification;
  documentId: string;
}) {
  const localize = useLocalize();
  const integrateMutation = useIntegrateDocumentClarificationMutation();
  const archiveMutation = useArchiveDocumentClarificationMutation();
  const isIntegrated = clarification.status === 'integrated';
  const integrateLabel = isIntegrated
    ? localize('com_ui_show_as_nested')
    : localize('com_ui_integrate_into_parent');

  return (
    <div
      data-document-augmentation="true"
      className={`rounded-xl border p-3 shadow-sm ${
        isIntegrated
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'bg-surface-primary/95 border-border-light'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
              {localize('com_ui_inline_clarification')}
            </div>
            {isIntegrated ? (
              <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                {localize('com_ui_integrated')}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm font-medium text-text-primary">
            {clarification.clarificationQuestion}
          </div>
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
                clarificationId: clarification.clarificationId,
                displayMode: isIntegrated ? 'nested' : 'integrated',
              })
            }
          >
            <GitMerge className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-1.5 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
            aria-label={localize('com_ui_archive')}
            title={localize('com_ui_archive')}
            onClick={() =>
              archiveMutation.mutateAsync({
                documentId,
                clarificationId: clarification.clarificationId,
              })
            }
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="markdown prose prose-sm message-content dark:prose-invert max-w-none break-words text-text-primary dark:text-gray-100">
        <MarkdownLite content={clarification.clarificationAnswer} codeExecution={false} />
      </div>
    </div>
  );
}
