import { memo, useEffect, useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  GitMerge,
  LocateFixed,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import type { TClarification } from 'librechat-data-provider';
import { useMessageRevisionsQuery, useReanchorClarificationMutation, useUpdateClarificationMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import MergeModal from './Merge';

type ClarificationBlockProps = {
  broken?: boolean;
  parentText: string;
  conversationId: string;
  parentMessageId: string;
  clarification: TClarification;
};

function ClarificationBlock({
  broken = false,
  parentText,
  conversationId,
  parentMessageId,
  clarification,
}: ClarificationBlockProps) {
  const localize = useLocalize();
  const updateMutation = useUpdateClarificationMutation();
  const reanchorMutation = useReanchorClarificationMutation();
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const [questionDraft, setQuestionDraft] = useState(clarification.clarificationQuestion);
  const [answerDraft, setAnswerDraft] = useState(clarification.clarificationAnswer);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const revisionsQuery = useMessageRevisionsQuery(parentMessageId, {
    enabled: showHistory && clarification.status === 'integrated',
  });

  useEffect(() => {
    setQuestionDraft(clarification.clarificationQuestion);
    setAnswerDraft(clarification.clarificationAnswer);
  }, [clarification.clarificationAnswer, clarification.clarificationQuestion]);

  const handleStatusToggle = async () => {
    await updateMutation.mutateAsync({
      clarificationId: clarification.clarificationId,
      status: clarification.status === 'collapsed' ? 'active' : 'collapsed',
      conversationId,
      parentMessageId,
    });
  };

  const handleSaveQuestion = async () => {
    await updateMutation.mutateAsync({
      clarificationId: clarification.clarificationId,
      clarificationQuestion: questionDraft,
      conversationId,
      parentMessageId,
    });
    setIsEditingQuestion(false);
  };

  const handleSaveAnswer = async () => {
    await updateMutation.mutateAsync({
      clarificationId: clarification.clarificationId,
      clarificationAnswer: answerDraft,
      conversationId,
      parentMessageId,
    });
    setIsEditingAnswer(false);
  };

  const handleRegenerate = async () => {
    await updateMutation.mutateAsync({
      clarificationId: clarification.clarificationId,
      regenerate: true,
      conversationId,
      parentMessageId,
    });
  };

  const handleArchive = async () => {
    await updateMutation.mutateAsync({
      clarificationId: clarification.clarificationId,
      status: 'archived',
      conversationId,
      parentMessageId,
    });
  };

  const handleReanchor = async () => {
    await reanchorMutation.mutateAsync({
      clarificationId: clarification.clarificationId,
      parentText,
      conversationId,
      parentMessageId,
    });
  };

  const isCollapsed = clarification.status === 'collapsed';
  const markdownClasses =
    'markdown prose prose-sm message-content w-full break-words text-text-primary dark:prose-invert dark:text-gray-100';
  const actionButtonClasses =
    'rounded-md p-1.5 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary';

  return (
    <>
      <div
        className={cn(
          'rounded-xl border border-border-light bg-surface-primary/95 p-3 shadow-sm backdrop-blur',
          clarification.status === 'integrated' && 'border-emerald-500/30 bg-emerald-500/5',
          broken && 'border-amber-500/40 bg-amber-500/5',
        )}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
            onClick={handleStatusToggle}
          >
            {isCollapsed ? (
              <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-secondary" />
            ) : (
              <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-secondary" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {clarification.status === 'integrated'
                  ? localize('com_ui_integrated')
                  : localize('com_ui_inline_clarification')}
              </div>
              <div className="mt-1 break-words text-sm font-medium text-text-primary">
                {clarification.clarificationQuestion}
              </div>
            </div>
          </button>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_edit_question')}
              title={localize('com_ui_edit_question')}
              onClick={() => setIsEditingQuestion((prev) => !prev)}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_regenerate')}
              title={localize('com_ui_regenerate')}
              onClick={handleRegenerate}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_reanchor')}
              title={localize('com_ui_reanchor')}
              onClick={handleReanchor}
            >
              <LocateFixed className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_integrate_into_parent')}
              title={localize('com_ui_integrate_into_parent')}
              onClick={() => setMergeOpen(true)}
            >
              <GitMerge className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={actionButtonClasses}
              aria-label={localize('com_ui_archive')}
              title={localize('com_ui_archive')}
              onClick={handleArchive}
            >
              <Archive className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!isCollapsed ? (
          <div className="space-y-3">
            {isEditingQuestion ? (
              <div className="space-y-2">
                <textarea
                  value={questionDraft}
                  onChange={(event) => setQuestionDraft(event.target.value)}
                  className="min-h-[84px] w-full rounded-lg border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary outline-none focus:border-border-heavy"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-neutral"
                    onClick={() => {
                      setQuestionDraft(clarification.clarificationQuestion);
                      setIsEditingQuestion(false);
                    }}
                  >
                    {localize('com_ui_cancel')}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveQuestion}>
                    {localize('com_ui_save_regenerate')}
                  </button>
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {localize('com_ui_answer')}
              </div>
              {isEditingAnswer ? (
                <div className="space-y-2">
                  <textarea
                    value={answerDraft}
                    onChange={(event) => setAnswerDraft(event.target.value)}
                    className="min-h-[128px] w-full rounded-lg border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary outline-none focus:border-border-heavy"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-neutral"
                      onClick={() => {
                        setAnswerDraft(clarification.clarificationAnswer);
                        setIsEditingAnswer(false);
                      }}
                    >
                      {localize('com_ui_cancel')}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleSaveAnswer}>
                      {localize('com_ui_save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={markdownClasses}>
                  <MarkdownLite content={clarification.clarificationAnswer} codeExecution={false} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isEditingAnswer ? (
                <button
                  type="button"
                  className="btn btn-neutral text-xs"
                  onClick={() => setIsEditingAnswer(true)}
                >
                  {localize('com_ui_edit_answer')}
                </button>
              ) : null}
              {clarification.status === 'integrated' ? (
                <button
                  type="button"
                  className="btn btn-neutral text-xs"
                  onClick={() => setShowHistory((prev) => !prev)}
                >
                  {showHistory ? localize('com_ui_hide_history') : localize('com_ui_view_history')}
                </button>
              ) : null}
            </div>

            {showHistory && clarification.status === 'integrated' ? (
              <div className="rounded-lg border border-border-light bg-surface-secondary/50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_revision_history')}
                </div>
                <div className="space-y-2">
                  {(revisionsQuery.data ?? [])
                    .filter((revision) => revision.reason === 'clarification_integration')
                    .slice(0, 3)
                    .map((revision) => (
                      <div key={revision.revisionId} className="rounded-md border border-border-light px-3 py-2">
                        <div className="mb-1 text-xs text-text-secondary">{revision.createdAt}</div>
                        <div className="line-clamp-4 whitespace-pre-wrap text-sm text-text-primary">
                          {revision.updatedText}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-text-secondary">
            {localize('com_ui_clarification_collapsed')}
          </div>
        )}
      </div>
      <MergeModal
        open={mergeOpen}
        parentText={parentText}
        clarification={clarification}
        conversationId={conversationId}
        parentMessageId={parentMessageId}
        onOpenChange={setMergeOpen}
      />
    </>
  );
}

export default memo(ClarificationBlock);
