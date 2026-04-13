import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, MessageCirclePlus } from 'lucide-react';
import type {
  TDialogCell,
  TDialogCellAnchor,
  TDialogClarification,
  TDialogVisualization,
  TVisualizationArtifactType,
} from 'librechat-data-provider';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import { useLocalize } from '~/hooks';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import {
  useCreateDialogClarificationMutation,
  useCreateDialogVisualizationMutation,
} from '~/data-provider/Dialogs';
import DialogClarificationCard from './ClarificationCard';
import DialogVisualizationCard from './VisualizationCard';

type AnchorGroup = {
  key: string;
  anchor: TDialogCellAnchor;
  clarifications: TDialogClarification[];
  visualizations: TDialogVisualization[];
};

type SelectionState = {
  anchor: TDialogCellAnchor;
  top: number;
  left: number;
};

type ComposerMode = 'clarification' | 'visualization' | null;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getAnchorKey(anchor: TDialogCellAnchor): string {
  return [
    anchor.cellId,
    anchor.startOffset,
    anchor.endOffset,
    normalizeWhitespace(anchor.anchorText),
  ].join(':');
}

function findNearestOccurrence(
  sourceText: string,
  anchorText: string,
  approximateStart: number,
): { start: number; end: number } | null {
  if (!anchorText) {
    return null;
  }

  const matches: number[] = [];
  let index = 0;

  while (index < sourceText.length) {
    const matchIndex = sourceText.indexOf(anchorText, index);
    if (matchIndex === -1) {
      break;
    }

    matches.push(matchIndex);
    index = matchIndex + Math.max(anchorText.length, 1);
  }

  if (matches.length === 0) {
    return null;
  }

  const start = matches.reduce((closest, current) =>
    Math.abs(current - approximateStart) < Math.abs(closest - approximateStart) ? current : closest,
  );

  return {
    start,
    end: start + anchorText.length,
  };
}

function resolveSelectionOffsets(
  cellText: string,
  selectedText: string,
  approximateStart: number,
): { start: number; end: number } | null {
  if (!selectedText) {
    return null;
  }

  const directMatch = cellText.slice(approximateStart, approximateStart + selectedText.length);
  if (directMatch === selectedText) {
    return {
      start: approximateStart,
      end: approximateStart + selectedText.length,
    };
  }

  return findNearestOccurrence(cellText, selectedText, approximateStart);
}

function buildSelectionAnchor(
  cell: TDialogCell,
  contentElement: HTMLElement,
  range: Range,
): TDialogCellAnchor | null {
  const selectedText = normalizeWhitespace(range.toString());
  const cellText = contentElement.textContent ?? '';

  if (!selectedText || !cellText) {
    return null;
  }

  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(contentElement);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const approximateStart = prefixRange.toString().length;
  const offsets = resolveSelectionOffsets(cellText, selectedText, approximateStart);
  if (!offsets) {
    return null;
  }

  return {
    cellId: cell.cellId,
    anchorText: cellText.slice(offsets.start, offsets.end) || selectedText,
    anchorContextBefore: cellText.slice(Math.max(0, offsets.start - 180), offsets.start),
    anchorContextAfter: cellText.slice(offsets.end, Math.min(cellText.length, offsets.end + 180)),
    startOffset: offsets.start,
    endOffset: offsets.end,
  };
}

function groupAnchors(
  clarifications: TDialogClarification[],
  visualizations: TDialogVisualization[],
): AnchorGroup[] {
  const groups = new Map<string, AnchorGroup>();

  const ensureGroup = (anchor: TDialogCellAnchor) => {
    const groupKey = getAnchorKey(anchor);
    const existing = groups.get(groupKey);
    if (existing) {
      return existing;
    }

    const created: AnchorGroup = {
      key: groupKey,
      anchor,
      clarifications: [],
      visualizations: [],
    };
    groups.set(groupKey, created);
    return created;
  };

  clarifications.forEach((clarification) => {
    ensureGroup(clarification.anchor).clarifications.push(clarification);
  });
  visualizations.forEach((visualization) => {
    ensureGroup(visualization.anchor).visualizations.push(visualization);
  });

  return Array.from(groups.values()).sort(
    (left, right) => left.anchor.startOffset - right.anchor.startOffset,
  );
}

function getSelectionUiContainer(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target.closest('[data-dialog-selection-ui="true"]');
  }

  if (target instanceof Node) {
    return target.parentElement?.closest('[data-dialog-selection-ui="true"]') ?? null;
  }

  return null;
}

export default function AnnotatedDialogCell({
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
  const contentRef = useRef<HTMLDivElement>(null);
  const createClarificationMutation = useCreateDialogClarificationMutation();
  const createVisualizationMutation = useCreateDialogVisualizationMutation();
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [clarificationQuestion, setClarificationQuestion] = useState('');
  const [visualizationPrompt, setVisualizationPrompt] = useState('');
  const [artifactType, setArtifactType] = useState<TVisualizationArtifactType>('svg');

  const anchorGroups = useMemo(
    () => groupAnchors(clarifications, visualizations),
    [clarifications, visualizations],
  );

  useEffect(() => {
    const handleMouseUp = (event: MouseEvent) => {
      const selectionUiContainer = getSelectionUiContainer(event.target);
      if (selectionUiContainer) {
        return;
      }

      const root = contentRef.current;
      const selection = window.getSelection();
      if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectionState(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setSelectionState(null);
        return;
      }

      const anchor = buildSelectionAnchor(cell, root, range);
      if (!anchor) {
        setSelectionState(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelectionState({
        anchor,
        top: rect.bottom + window.scrollY + 8,
        left: Math.max(rect.left + window.scrollX, 16),
      });
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [cell]);

  const openComposer = (mode: ComposerMode) => {
    if (!selectionState) {
      return;
    }

    setComposerMode(mode);
    if (mode === 'clarification') {
      setClarificationQuestion(localize('com_ui_dialog_default_clarification_prompt'));
      return;
    }

    setVisualizationPrompt(localize('com_ui_dialog_default_visualization_prompt'));
  };

  const closeComposer = () => {
    setComposerMode(null);
  };

  const handleClarificationCreate = async () => {
    if (!selectionState) {
      return;
    }

    await createClarificationMutation.mutateAsync({
      dialogId,
      cellId: cell.cellId,
      anchor: selectionState.anchor,
      clarificationQuestion,
    });
    setComposerMode(null);
    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleVisualizationCreate = async () => {
    if (!selectionState) {
      return;
    }

    await createVisualizationMutation.mutateAsync({
      dialogId,
      cellId: cell.cellId,
      anchor: selectionState.anchor,
      prompt: visualizationPrompt,
      artifactType,
    });
    setComposerMode(null);
    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="space-y-3">
      <div
        ref={contentRef}
        className="markdown prose prose-sm message-content dark:prose-invert max-w-none break-words text-text-primary dark:text-gray-100"
      >
        <MarkdownLite content={cell.sourceMarkdown ?? ''} codeExecution={false} />
      </div>

      {anchorGroups.length > 0 ? (
        <div className="space-y-3">
          {anchorGroups.map((group) => (
            <div
              key={group.key}
              className="border-border-light/60 bg-surface-primary/60 space-y-2 rounded-xl border p-3"
            >
              <div className="text-xs text-text-secondary">{group.anchor.anchorText}</div>
              {group.clarifications.map((clarification) => (
                <DialogClarificationCard
                  key={clarification.clarificationId}
                  clarification={clarification}
                  dialogId={dialogId}
                />
              ))}
              {group.visualizations.map((visualization) => (
                <DialogVisualizationCard
                  key={visualization.visualizationId}
                  visualization={visualization}
                  dialogId={dialogId}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {selectionState
        ? createPortal(
            <div
              data-dialog-selection-ui="true"
              className="fixed z-50 flex items-center gap-2 rounded-full border border-border-light bg-surface-primary px-3 py-2 shadow-xl"
              style={{ top: selectionState.top, left: selectionState.left }}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-text-primary transition hover:bg-surface-hover"
                onClick={() => openComposer('clarification')}
              >
                <MessageCirclePlus className="h-4 w-4" />
                {localize('com_ui_clarify')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-text-primary transition hover:bg-surface-hover"
                onClick={() => openComposer('visualization')}
              >
                <BarChart3 className="h-4 w-4" />
                {localize('com_ui_visualize')}
              </button>
            </div>,
            document.body,
          )
        : null}

      <OGDialog open={composerMode !== null} onOpenChange={(open) => !open && closeComposer()}>
        <OGDialogContent data-dialog-selection-ui="true" className="sm:max-w-xl">
          <OGDialogHeader>
            <OGDialogTitle>
              {composerMode === 'clarification'
                ? localize('com_ui_clarify')
                : localize('com_ui_visualize')}
            </OGDialogTitle>
          </OGDialogHeader>

          {composerMode === 'clarification' ? (
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
              value={clarificationQuestion}
              onChange={(event) => setClarificationQuestion(event.target.value)}
            />
          ) : (
            <div className="space-y-3">
              <select
                className="w-full rounded-xl border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
                value={artifactType}
                onChange={(event) =>
                  setArtifactType(event.target.value as TVisualizationArtifactType)
                }
              >
                <option value="svg">{localize('com_ui_svg')}</option>
                <option value="mermaid">{localize('com_ui_mermaid')}</option>
                <option value="html_app">{localize('com_ui_interactive_html')}</option>
              </select>
              <textarea
                className="min-h-[120px] w-full rounded-xl border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
                value={visualizationPrompt}
                onChange={(event) => setVisualizationPrompt(event.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
              onClick={closeComposer}
            >
              {localize('com_ui_cancel')}
            </button>
            <button
              type="button"
              className="rounded-xl bg-text-primary px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:text-black"
              onClick={() =>
                composerMode === 'clarification'
                  ? handleClarificationCreate()
                  : handleVisualizationCreate()
              }
            >
              {localize('com_ui_create')}
            </button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
