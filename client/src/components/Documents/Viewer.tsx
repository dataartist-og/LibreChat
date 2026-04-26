import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, MessageCirclePlus } from 'lucide-react';
import type {
  TDocumentAnchor,
  TDocumentBlock,
  TDocumentClarification,
  TDocumentSpeechHighlightMode,
  TDocumentVisualization,
  TDocumentWorkspace,
  TVisualizationArtifactType,
} from 'librechat-data-provider';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import { useLocalize } from '~/hooks';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import {
  useCreateDocumentClarificationMutation,
  useCreateDocumentVisualizationMutation,
} from '~/data-provider/Documents';
import type { DocumentSpeechActiveState } from './Speech';
import DocumentClarificationCard from './ClarificationCard';
import DocumentVisualizationCard from './VisualizationCard';

type AnchorGroup = {
  key: string;
  anchor: TDocumentAnchor;
  clarifications: TDocumentClarification[];
  visualizations: TDocumentVisualization[];
};

type SelectionState = {
  anchor: TDocumentAnchor;
  top: number;
  left: number;
};

type ComposerMode = 'clarification' | 'visualization' | null;

type DocumentAsset = {
  assetId: string;
  dataUri?: string | null;
  annotation?: string | null;
  mimeType?: string | null;
};

const documentHtmlEntityPattern = /&(nbsp|lt|gt|amp|quot|#39|#x27);/gi;
const documentHtmlEntities: Record<string, string> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  '#39': "'",
  '#x27': "'",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeDocumentMarkdown(value: string): string {
  return value.replace(documentHtmlEntityPattern, (match, entity: string) => {
    const decoded = documentHtmlEntities[entity.toLowerCase()];
    return decoded ?? match;
  });
}

function isDocumentAsset(value: unknown): value is DocumentAsset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return typeof (value as DocumentAsset).assetId === 'string';
}

function getAnchorKey(anchor: TDocumentAnchor): string {
  return [
    anchor.blockId,
    anchor.startOffset,
    anchor.endOffset,
    normalizeWhitespace(anchor.anchorText),
  ].join(':');
}

function buildFullBlockAnchor(block: TDocumentBlock): TDocumentAnchor | null {
  const text = block.plainText.trim();
  if (!text) {
    return null;
  }

  return {
    blockId: block.blockId,
    blockType: block.type,
    anchorText: text,
    anchorContextBefore: '',
    anchorContextAfter: '',
    startOffset: 0,
    endOffset: text.length,
    headingPath: [],
    pageStart: block.sourcePageStart ?? null,
    pageEnd: block.sourcePageEnd ?? null,
  };
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
  blockText: string,
  selectedText: string,
  approximateStart: number,
): { start: number; end: number } | null {
  if (!selectedText) {
    return null;
  }

  const directMatch = blockText.slice(approximateStart, approximateStart + selectedText.length);
  if (directMatch === selectedText) {
    return {
      start: approximateStart,
      end: approximateStart + selectedText.length,
    };
  }

  const nearestMatch = findNearestOccurrence(blockText, selectedText, approximateStart);
  if (nearestMatch) {
    return nearestMatch;
  }

  const normalizedSelected = normalizeWhitespace(selectedText);
  if (!normalizedSelected) {
    return null;
  }

  const normalizedMatches: Array<{ start: number; end: number }> = [];
  const words = blockText.match(/\S+/g) ?? [];
  let runningIndex = 0;

  for (const word of words) {
    const start = blockText.indexOf(word, runningIndex);
    const end = start + word.length;
    runningIndex = end;

    if (normalizeWhitespace(word) === normalizedSelected) {
      normalizedMatches.push({ start, end });
    }
  }

  if (normalizedMatches.length === 0) {
    return null;
  }

  return normalizedMatches.reduce((closest, current) =>
    Math.abs(current.start - approximateStart) < Math.abs(closest.start - approximateStart)
      ? current
      : closest,
  );
}

function toElement(node: Node): HTMLElement | null {
  if (node instanceof HTMLElement) {
    return node;
  }

  return node.parentElement;
}

function buildSelectionAnchor(
  block: TDocumentBlock,
  blockElement: HTMLElement,
  range: Range,
): TDocumentAnchor | null {
  const renderedText = blockElement.textContent ?? '';
  const selectedText = normalizeWhitespace(range.toString());
  if (!selectedText) {
    return null;
  }

  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(blockElement);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const approximateStart = prefixRange.toString().length;
  const blockText = block.plainText || renderedText;
  const offsets = resolveSelectionOffsets(blockText, selectedText, approximateStart);
  if (!offsets) {
    return null;
  }

  return {
    blockId: block.blockId,
    blockType: block.type,
    anchorText: blockText.slice(offsets.start, offsets.end) || selectedText,
    anchorContextBefore: blockText.slice(Math.max(0, offsets.start - 180), offsets.start),
    anchorContextAfter: blockText.slice(offsets.end, Math.min(blockText.length, offsets.end + 180)),
    startOffset: offsets.start,
    endOffset: offsets.end,
    headingPath: [],
    pageStart: block.sourcePageStart ?? null,
    pageEnd: block.sourcePageEnd ?? null,
  };
}

function groupAnchors(
  clarifications: TDocumentClarification[],
  visualizations: TDocumentVisualization[],
): Map<string, AnchorGroup[]> {
  const byBlock = new Map<string, Map<string, AnchorGroup>>();

  const ensureGroup = (anchor: TDocumentAnchor) => {
    const groupKey = getAnchorKey(anchor);
    let blockGroups = byBlock.get(anchor.blockId);
    if (!blockGroups) {
      blockGroups = new Map<string, AnchorGroup>();
      byBlock.set(anchor.blockId, blockGroups);
    }

    let group = blockGroups.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        anchor,
        clarifications: [],
        visualizations: [],
      };
      blockGroups.set(groupKey, group);
    }

    return group;
  };

  clarifications.forEach((clarification) => {
    ensureGroup(clarification.anchor).clarifications.push(clarification);
  });

  visualizations.forEach((visualization) => {
    ensureGroup(visualization.anchor).visualizations.push(visualization);
  });

  return new Map(
    Array.from(byBlock.entries()).map(([blockId, groups]) => [
      blockId,
      Array.from(groups.values()).sort(
        (left, right) => left.anchor.startOffset - right.anchor.startOffset,
      ),
    ]),
  );
}

function DocumentBlockBody({
  block,
  asset,
}: {
  block: TDocumentBlock;
  asset?: DocumentAsset | null;
}) {
  const normalizedContent = decodeDocumentMarkdown(block.contentMarkdown);
  const markdownClassName =
    "markdown prose prose-sm message-content dark:prose-invert max-w-none break-words text-text-primary dark:text-gray-100 [&_.katex-error]:whitespace-pre-wrap [&_.katex-error]:text-text-primary dark:[&_.katex-error]:text-gray-100";

  if (block.type === 'page_break') {
    return (
      <div className="rounded-full border border-border-light px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
        {block.contentMarkdown.replace(/^#\s*/u, '')}
      </div>
    );
  }

  if (block.type === 'figure' && asset?.dataUri) {
    return (
      <figure className="space-y-3 [&_.katex-error]:whitespace-pre-wrap [&_.katex-error]:text-text-primary dark:[&_.katex-error]:text-gray-100">
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface-secondary/30 p-3">
          <img
            src={asset.dataUri}
            alt={block.plainText || asset.annotation || 'Document figure'}
            className="mx-auto max-h-[28rem] w-auto max-w-full rounded-lg object-contain"
          />
        </div>
        {normalizedContent ? (
          <figcaption className="text-sm text-text-secondary">
            <MarkdownLite content={normalizedContent} codeExecution={false} />
          </figcaption>
        ) : null}
      </figure>
    );
  }

  return (
    <div className={`${markdownClassName} ${block.type === 'table' ? 'overflow-x-auto' : ''}`}>
      <MarkdownLite content={normalizedContent} codeExecution={false} />
    </div>
  );
}

export default function DocumentViewer({
  workspace,
  activeSpeech = null,
  highlightMode = 'off',
}: {
  workspace: TDocumentWorkspace;
  activeSpeech?: DocumentSpeechActiveState | null;
  highlightMode?: TDocumentSpeechHighlightMode;
}) {
  const localize = useLocalize();
  const viewerRef = useRef<HTMLDivElement>(null);
  const createClarificationMutation = useCreateDocumentClarificationMutation();
  const createVisualizationMutation = useCreateDocumentVisualizationMutation();
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [clarificationQuestion, setClarificationQuestion] = useState('');
  const [visualizationPrompt, setVisualizationPrompt] = useState('');
  const [artifactType, setArtifactType] = useState<TVisualizationArtifactType>('svg');

  const blocks = workspace.renderVersion.documentIrJson.blocks;
  const blockLookup = useMemo(
    () => new Map(blocks.map((block) => [block.blockId, block])),
    [blocks],
  );
  const assetLookup = useMemo(() => {
    const rawAssets =
      workspace.renderVersion.documentIrJson.assets ?? workspace.renderVersion.assetsJson ?? [];

    return new Map(
      rawAssets
        .filter(isDocumentAsset)
        .map((asset) => [asset.assetId, asset] as const),
    );
  }, [workspace.renderVersion.assetsJson, workspace.renderVersion.documentIrJson.assets]);
  const groupedAnchors = useMemo(
    () => groupAnchors(workspace.clarifications, workspace.visualizations),
    [workspace.clarifications, workspace.visualizations],
  );

  const closeComposer = useCallback(() => {
    setComposerMode(null);
  }, []);

  const openComposer = useCallback(
    (
      mode: Exclude<ComposerMode, null>,
      anchor: TDocumentAnchor,
      position?: { top: number; left: number },
    ) => {
      setSelectionState((current) => ({
        anchor,
        top: position?.top ?? current?.top ?? window.innerHeight / 2,
        left: position?.left ?? current?.left ?? window.innerWidth / 2,
      }));
      if (mode === 'clarification') {
        setClarificationQuestion(localize('com_ui_document_default_clarification_prompt'));
      } else {
        setVisualizationPrompt(localize('com_ui_document_default_visualization_prompt'));
        setArtifactType('svg');
      }
      setComposerMode(mode);
    },
    [localize],
  );

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelectionState(null);
  }, []);

  const handleSelectionCapture = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionState(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const root = viewerRef.current;
    if (!root || !root.contains(range.commonAncestorContainer)) {
      setSelectionState(null);
      return;
    }

    const startElement = toElement(range.startContainer);
    const endElement = toElement(range.endContainer);
    if (
      startElement?.closest('[data-document-augmentation="true"]') ||
      endElement?.closest('[data-document-augmentation="true"]')
    ) {
      setSelectionState(null);
      return;
    }

    const startBlockElement = startElement?.closest<HTMLElement>('[data-document-block-id]');
    const endBlockElement = endElement?.closest<HTMLElement>('[data-document-block-id]');
    if (
      !startBlockElement ||
      !endBlockElement ||
      startBlockElement.dataset.documentBlockId !== endBlockElement.dataset.documentBlockId
    ) {
      setSelectionState(null);
      return;
    }

    const blockId = startBlockElement.dataset.documentBlockId ?? '';
    const block = blockLookup.get(blockId);
    if (!block) {
      setSelectionState(null);
      return;
    }

    const anchor = buildSelectionAnchor(block, startBlockElement, range);
    if (!anchor) {
      setSelectionState(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelectionState({
      anchor,
      top: Math.max(12, rect.top - 52),
      left: rect.left + rect.width / 2,
    });
  }, [blockLookup]);

  useEffect(() => {
    const current = viewerRef.current;
    if (!current) {
      return;
    }

    const handleScroll = () => {
      setSelectionState(null);
    };

    current.addEventListener('scroll', handleScroll);
    return () => current.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClarificationCreate = async () => {
    if (!selectionState) {
      return;
    }

    await createClarificationMutation.mutateAsync({
      documentId: workspace.document.documentId,
      renderVersionId: workspace.renderVersion.renderVersionId,
      anchor: selectionState.anchor,
      clarificationQuestion,
    });

    closeComposer();
    clearSelection();
  };

  const handleVisualizationCreate = async () => {
    if (!selectionState) {
      return;
    }

    await createVisualizationMutation.mutateAsync({
      documentId: workspace.document.documentId,
      renderVersionId: workspace.renderVersion.renderVersionId,
      anchor: selectionState.anchor,
      prompt: visualizationPrompt,
      artifactType,
    });

    closeComposer();
    clearSelection();
  };

  return (
    <>
      <div
        ref={viewerRef}
        data-document-viewer="true"
        className="h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-10"
        onMouseUpCapture={handleSelectionCapture}
        onKeyUpCapture={handleSelectionCapture}
      >
        <div className="mx-auto max-w-4xl space-y-6">
          {blocks.map((block) => {
            const groups = groupedAnchors.get(block.blockId) ?? [];
            const blockAnchor = buildFullBlockAnchor(block);
            const asset = block.assetId ? assetLookup.get(block.assetId) ?? null : null;

            return (
              <section
                key={block.blockId}
                id={`document-block-${block.blockId}`}
                data-document-block-id={block.blockId}
                tabIndex={-1}
                className={`group relative rounded-2xl border px-4 py-4 transition ${
                  groups.length > 0
                    ? 'border-border-medium bg-surface-primary'
                    : 'border-transparent'
                } ${
                  activeSpeech?.blockId === block.blockId && highlightMode !== 'off'
                    ? 'border-emerald-500/60 bg-emerald-500/5 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]'
                    : ''
                }`}
              >
                {blockAnchor ? (
                  <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded-full border border-border-light bg-surface-primary px-2 py-1 text-xs font-medium text-text-secondary transition hover:text-text-primary"
                      onClick={() => openComposer('clarification', blockAnchor)}
                    >
                      {localize('com_ui_clarify')}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-border-light bg-surface-primary px-2 py-1 text-xs font-medium text-text-secondary transition hover:text-text-primary"
                      onClick={() => openComposer('visualization', blockAnchor)}
                    >
                      {localize('com_ui_visualize')}
                    </button>
                  </div>
                ) : null}

                {activeSpeech?.blockId === block.blockId &&
                highlightMode === 'excerpt' &&
                activeSpeech.excerpt ? (
                  <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-text-primary">
                    {activeSpeech.excerpt}
                  </div>
                ) : null}

                <DocumentBlockBody block={block} asset={asset} />

                {groups.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {groups.map((group) => (
                      <div
                        key={group.key}
                        className="bg-surface-secondary/30 rounded-2xl border border-border-light p-3"
                      >
                        <div className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary">
                          {localize('com_ui_selected_excerpt')}
                        </div>
                        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary">
                          {group.anchor.anchorText}
                        </div>
                        <div className="mt-3 space-y-3">
                          {group.clarifications.map((clarification) => (
                            <DocumentClarificationCard
                              key={clarification.clarificationId}
                              clarification={clarification}
                              documentId={workspace.document.documentId}
                            />
                          ))}
                          {group.visualizations.map((visualization) => (
                            <DocumentVisualizationCard
                              key={visualization.visualizationId}
                              visualization={visualization}
                              documentId={workspace.document.documentId}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>

      {selectionState && composerMode == null
        ? createPortal(
            <div
              className="z-[120] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-light bg-surface-primary px-2 py-2 shadow-lg"
              style={{
                position: 'fixed',
                top: selectionState.top,
                left: selectionState.left,
              }}
            >
              <button
                type="button"
                className="flex items-center gap-1 rounded-full px-3 py-1 text-sm text-text-primary transition hover:bg-surface-hover"
                onClick={() => openComposer('clarification', selectionState.anchor)}
              >
                <MessageCirclePlus className="h-4 w-4" />
                {localize('com_ui_clarify')}
              </button>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full px-3 py-1 text-sm text-text-primary transition hover:bg-surface-hover"
                onClick={() => openComposer('visualization', selectionState.anchor)}
              >
                <BarChart3 className="h-4 w-4" />
                {localize('com_ui_visualize')}
              </button>
            </div>,
            document.body,
          )
        : null}

      <OGDialog open={composerMode != null} onOpenChange={(open) => !open && closeComposer()}>
        <OGDialogContent className="sm:max-w-2xl">
          <OGDialogHeader>
            <OGDialogTitle>
              {composerMode === 'clarification'
                ? localize('com_ui_clarify')
                : localize('com_ui_visualize')}
            </OGDialogTitle>
          </OGDialogHeader>

          {selectionState ? (
            <div className="space-y-4">
              <div className="bg-surface-secondary/30 rounded-xl border border-border-light p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_selected_excerpt')}
                </div>
                <div className="text-sm text-text-primary">{selectionState.anchor.anchorText}</div>
              </div>

              {composerMode === 'clarification' ? (
                <label className="block text-sm text-text-primary">
                  <div className="mb-2 font-medium">{localize('com_ui_generation_prompt')}</div>
                  <textarea
                    value={clarificationQuestion}
                    onChange={(event) => setClarificationQuestion(event.target.value)}
                    className="min-h-[120px] w-full rounded-xl border border-border-medium bg-transparent px-3 py-2 outline-none focus:border-border-heavy"
                  />
                </label>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm text-text-primary">
                    <div className="mb-2 font-medium">{localize('com_ui_visualization')}</div>
                    <select
                      value={artifactType}
                      onChange={(event) =>
                        setArtifactType(event.target.value as TVisualizationArtifactType)
                      }
                      className="w-full rounded-xl border border-border-medium bg-transparent px-3 py-2 outline-none focus:border-border-heavy"
                    >
                      <option value="svg">{localize('com_ui_svg')}</option>
                      <option value="mermaid">{localize('com_ui_mermaid')}</option>
                      <option value="html_app">{localize('com_ui_interactive_html')}</option>
                    </select>
                  </label>
                  <label className="block text-sm text-text-primary">
                    <div className="mb-2 font-medium">{localize('com_ui_generation_prompt')}</div>
                    <textarea
                      value={visualizationPrompt}
                      onChange={(event) => setVisualizationPrompt(event.target.value)}
                      className="min-h-[120px] w-full rounded-xl border border-border-medium bg-transparent px-3 py-2 outline-none focus:border-border-heavy"
                    />
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-neutral" onClick={closeComposer}>
                  {localize('com_ui_cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    composerMode === 'clarification'
                      ? handleClarificationCreate()
                      : handleVisualizationCreate()
                  }
                  disabled={
                    createClarificationMutation.isLoading || createVisualizationMutation.isLoading
                  }
                >
                  {localize('com_ui_generate')}
                </button>
              </div>
            </div>
          ) : null}
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
