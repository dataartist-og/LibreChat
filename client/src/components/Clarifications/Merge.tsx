import { useEffect, useMemo, useState } from 'react';
import { OGDialog, OGDialogTitle, OGDialogHeader, OGDialogContent } from '@librechat/client';
import type { TClarification } from 'librechat-data-provider';
import { useIntegrateClarificationMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';

type MergeModalProps = {
  open: boolean;
  parentText: string;
  conversationId: string;
  parentMessageId: string;
  clarification: TClarification;
  onOpenChange: (open: boolean) => void;
};

function buildMergedText(parentText: string, clarification: TClarification): string {
  const answer = clarification.clarificationAnswer.trim();
  if (!answer) {
    return parentText;
  }

  const anchorStart = Math.max(0, Math.min(parentText.length, clarification.anchorStart));
  const anchorEnd = Math.max(anchorStart, Math.min(parentText.length, clarification.anchorEnd));

  if (anchorStart === anchorEnd) {
    return `${parentText}\n\n${answer}`.trim();
  }

  return `${parentText.slice(0, anchorEnd)}\n\n${answer}${parentText.slice(anchorEnd)}`;
}

export default function MergeModal({
  open,
  parentText,
  clarification,
  conversationId,
  parentMessageId,
  onOpenChange,
}: MergeModalProps) {
  const localize = useLocalize();
  const integrateMutation = useIntegrateClarificationMutation();
  const markdownClasses =
    'markdown prose prose-sm message-content w-full break-words text-text-primary dark:prose-invert dark:text-gray-100';
  const suggestedText = useMemo(
    () => buildMergedText(parentText, clarification),
    [clarification, parentText],
  );
  const [mergedText, setMergedText] = useState(suggestedText);

  useEffect(() => {
    if (open) {
      setMergedText(suggestedText);
    }
  }, [open, suggestedText]);

  const handleSave = async () => {
    await integrateMutation.mutateAsync({
      clarificationId: clarification.clarificationId,
      mergedText,
      excerpt: clarification.anchorText,
      excerptStart: clarification.anchorStart,
      excerptEnd: clarification.anchorEnd,
      conversationId,
      parentMessageId,
    });
    onOpenChange(false);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_integrate_into_parent')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
              {localize('com_ui_original_excerpt')}
            </div>
            <div className={markdownClasses}>
              <MarkdownLite content={clarification.anchorText} codeExecution={false} />
            </div>
          </div>
          <div className="rounded-xl border border-border-light bg-surface-secondary/40 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
              {localize('com_ui_clarification_answer')}
            </div>
            <div className={markdownClasses}>
              <MarkdownLite content={clarification.clarificationAnswer} codeExecution={false} />
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-text-primary">
              {localize('com_ui_merged_parent_text')}
            </div>
            <textarea
              value={mergedText}
              onChange={(event) => setMergedText(event.target.value)}
              className="min-h-[240px] w-full rounded-xl border border-border-medium bg-transparent px-3 py-3 text-sm text-text-primary outline-none focus:border-border-heavy"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn btn-neutral" onClick={() => onOpenChange(false)}>
              {localize('com_ui_cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              {localize('com_ui_save')}
            </button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
