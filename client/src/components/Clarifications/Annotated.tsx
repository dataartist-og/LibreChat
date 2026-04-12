import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Loader2, MessageCirclePlus, WandSparkles } from 'lucide-react';
import type {
  TClarification,
  TMessage,
  TVisualization,
  TVisualizationArtifactType,
} from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import { useMessageContext } from '~/Providers';
import {
  useConversationClarificationsQuery,
  useConversationVisualizationsQuery,
  useClarificationSuggestionsQuery,
  useCreateClarificationMutation,
  useCreateVisualizationMutation,
  useVisualizationSuggestionsQuery,
} from '~/data-provider';
import { useLocalize, type TranslationKeys } from '~/hooks';
import { VisualizationCard, VisualizationTab } from '~/components/Visualizations';
import { cn } from '~/utils';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import ClarificationBlock from './Block';
import store from '~/store';

type AnnotatedAssistantMessageProps = {
  message: Pick<TMessage, 'messageId' | 'projectId' | 'isCreatedByUser'>;
  content: string;
  isLatestMessage: boolean;
};

type SelectionState = {
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
  previewHtml: string;
  top: number;
  left: number;
};

type AnchorGroup = {
  key: string;
  anchorText: string;
  anchorStart: number;
  anchorEnd: number;
  anchorContextBefore: string;
  anchorContextAfter: string;
  clarifications: TClarification[];
  visualizations: TVisualization[];
};

type SlotState = {
  slotId: string;
  container: HTMLDivElement;
  group: AnchorGroup;
};

type AnchoredItem = {
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
};

type InlineSuggestionProfile = 'conceptual' | 'procedural' | 'equational' | 'precise' | 'mixed';

const blockSelector = 'p, li, blockquote, h1, h2, h3, h4, h5, h6';
const hiddenSelector = '[data-inline-clarification-slot],[data-inline-annotation-badge]';
const emptyClarifications: TClarification[] = [];
const emptyVisualizations: TVisualization[] = [];
const popupPreviewClasses =
  'markdown prose prose-sm message-content w-full break-words text-text-primary dark:prose-invert dark:text-gray-100';
const visualizationQuickTypes: Array<{
  artifactType: TVisualizationArtifactType;
  labelKey: TranslationKeys;
}> = [
  { artifactType: 'html_app', labelKey: 'com_ui_interactive_html' },
  { artifactType: 'svg', labelKey: 'com_ui_svg' },
  { artifactType: 'mermaid', labelKey: 'com_ui_mermaid' },
  { artifactType: 'image', labelKey: 'com_ui_static_image' },
];
const contentProfileLabelKeys: Record<InlineSuggestionProfile, TranslationKeys> = {
  conceptual: 'com_ui_content_profile_conceptual',
  procedural: 'com_ui_content_profile_procedural',
  equational: 'com_ui_content_profile_equational',
  precise: 'com_ui_content_profile_precise',
  mixed: 'com_ui_content_profile_mixed',
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hasContextOverlap(source: string, candidate: string, edge: 'start' | 'end'): boolean {
  const normalizedSource = normalizeWhitespace(source);
  const normalizedCandidate = normalizeWhitespace(candidate);
  if (!normalizedSource || !normalizedCandidate) {
    return true;
  }

  const sourceNeedle = edge === 'end' ? normalizedSource.slice(-48) : normalizedSource.slice(0, 48);
  const candidateNeedle =
    edge === 'end' ? normalizedCandidate.slice(-48) : normalizedCandidate.slice(0, 48);

  return sourceNeedle.includes(candidateNeedle) || candidateNeedle.includes(sourceNeedle);
}

function areRelatedAnchors(
  left: Pick<AnchoredItem, 'anchorText' | 'anchorContextBefore' | 'anchorContextAfter'>,
  right: Pick<AnchoredItem, 'anchorText' | 'anchorContextBefore' | 'anchorContextAfter'>,
): boolean {
  return (
    normalizeWhitespace(left.anchorText) === normalizeWhitespace(right.anchorText) &&
    hasContextOverlap(left.anchorContextBefore, right.anchorContextBefore, 'end') &&
    hasContextOverlap(left.anchorContextAfter, right.anchorContextAfter, 'start')
  );
}

function mapExistingClarifications(clarifications: TClarification[]) {
  return clarifications.slice(0, 3).map((clarification) => ({
    question: clarification.clarificationQuestion,
    answer: clarification.clarificationAnswer,
  }));
}

function SuggestionSummary({
  contentProfile,
  focusSummary,
}: {
  contentProfile: InlineSuggestionProfile;
  focusSummary: string;
}) {
  const localize = useLocalize();

  return (
    <div className="bg-surface-primary/60 mb-3 rounded-xl border border-border-light px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
        {localize('com_ui_content_profile')}{' '}
        <span className="text-text-primary">
          {localize(contentProfileLabelKeys[contentProfile] ?? contentProfileLabelKeys.mixed)}
        </span>
      </div>
      <div className="mt-1 text-sm text-text-primary">{focusSummary}</div>
    </div>
  );
}

function SuggestionsLoadingState() {
  const localize = useLocalize();

  return (
    <div className="bg-surface-primary/40 mb-3 flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-secondary">
      <Loader2 className="h-4 w-4 animate-spin" />
      {localize('com_ui_generating_suggestions')}
    </div>
  );
}

function SuggestionsErrorState() {
  const localize = useLocalize();

  return (
    <div className="bg-surface-primary/40 mb-3 rounded-xl border border-dashed border-border-light px-3 py-2 text-sm text-text-secondary">
      {localize('com_ui_suggestions_unavailable')}
    </div>
  );
}

function scoreContextMatch(
  text: string,
  start: number,
  end: number,
  contextBefore: string,
  contextAfter: string,
): number {
  const beforeWindow = text.slice(Math.max(0, start - contextBefore.length), start);
  const afterWindow = text.slice(end, Math.min(text.length, end + contextAfter.length));
  let score = 0;

  const beforeNeedle = normalizeWhitespace(contextBefore).slice(-60);
  const afterNeedle = normalizeWhitespace(contextAfter).slice(0, 60);

  if (beforeNeedle && normalizeWhitespace(beforeWindow).includes(beforeNeedle)) {
    score += 2;
  }
  if (afterNeedle && normalizeWhitespace(afterWindow).includes(afterNeedle)) {
    score += 2;
  }

  return score;
}

function resolveAnchorWithContext(
  text: string,
  anchorText: string,
  contextBefore: string,
  contextAfter: string,
  preferredStart?: number,
): { anchorStart: number; anchorEnd: number } | null {
  const normalizedAnchor = anchorText.trim();
  if (!normalizedAnchor) {
    return null;
  }

  const matches: { anchorStart: number; anchorEnd: number; score: number }[] = [];
  let searchIndex = 0;
  while (searchIndex < text.length) {
    const anchorStart = text.indexOf(normalizedAnchor, searchIndex);
    if (anchorStart === -1) {
      break;
    }

    const anchorEnd = anchorStart + normalizedAnchor.length;
    const proximityScore =
      preferredStart == null ? 0 : Math.max(0, 4 - Math.abs(anchorStart - preferredStart) / 80);
    const contextScore = scoreContextMatch(
      text,
      anchorStart,
      anchorEnd,
      contextBefore,
      contextAfter,
    );
    matches.push({
      anchorStart,
      anchorEnd,
      score: contextScore + proximityScore,
    });
    searchIndex = anchorStart + Math.max(1, normalizedAnchor.length);
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => right.score - left.score || left.anchorStart - right.anchorStart);
  return {
    anchorStart: matches[0].anchorStart,
    anchorEnd: matches[0].anchorEnd,
  };
}

function shouldIgnoreTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) {
    return true;
  }

  return !!parent.closest(`${hiddenSelector},pre,code`);
}

function getTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    if (!shouldIgnoreTextNode(textNode) && textNode.textContent) {
      nodes.push(textNode);
    }
    currentNode = walker.nextNode();
  }
  return nodes;
}

function collectPlainText(root: HTMLElement): string {
  return getTextNodes(root)
    .map((node) => node.textContent ?? '')
    .join('');
}

function getOffsetForNode(root: HTMLElement, targetNode: Text, nodeOffset: number): number | null {
  let total = 0;
  const nodes = getTextNodes(root);

  for (const node of nodes) {
    const length = node.textContent?.length ?? 0;
    if (node === targetNode) {
      return total + nodeOffset;
    }
    total += length;
  }

  return null;
}

function findFirstTextNode(node: Node): Text | null {
  if (node instanceof Text) {
    return shouldIgnoreTextNode(node) ? null : node;
  }

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    if (!shouldIgnoreTextNode(textNode) && textNode.textContent) {
      return textNode;
    }
    currentNode = walker.nextNode();
  }
  return null;
}

function findLastTextNode(node: Node): Text | null {
  if (node instanceof Text) {
    return shouldIgnoreTextNode(node) ? null : node;
  }

  const nodes: Text[] = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    if (!shouldIgnoreTextNode(textNode) && textNode.textContent) {
      nodes.push(textNode);
    }
    currentNode = walker.nextNode();
  }

  return nodes.at(-1) ?? null;
}

function findAdjacentTextNode(
  root: HTMLElement,
  referenceNode: Node,
  direction: 'previous' | 'next',
): Text | null {
  const textNodes = getTextNodes(root);

  if (direction === 'next') {
    return (
      textNodes.find(
        (textNode) =>
          (referenceNode.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
      ) ?? null
    );
  }

  const previousNodes = textNodes.filter(
    (textNode) =>
      (referenceNode.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
  );

  return previousNodes.at(-1) ?? null;
}

function resolveBoundary(
  root: HTMLElement,
  container: Node,
  offset: number,
  direction: 'start' | 'end',
): { node: Text; offset: number } | null {
  if (container instanceof Text) {
    const length = container.textContent?.length ?? 0;
    if (shouldIgnoreTextNode(container)) {
      return null;
    }

    return {
      node: container,
      offset: Math.max(0, Math.min(offset, length)),
    };
  }

  const childNodes = Array.from(container.childNodes);
  const boundedOffset = Math.max(0, Math.min(offset, childNodes.length));

  if (direction === 'start') {
    for (let index = boundedOffset; index < childNodes.length; index += 1) {
      const candidate = findFirstTextNode(childNodes[index]);
      if (candidate) {
        return {
          node: candidate,
          offset: 0,
        };
      }
    }

    const nextNode = findAdjacentTextNode(root, container, 'next');
    if (nextNode) {
      return {
        node: nextNode,
        offset: 0,
      };
    }

    for (let index = boundedOffset - 1; index >= 0; index -= 1) {
      const candidate = findLastTextNode(childNodes[index]);
      if (candidate) {
        return {
          node: candidate,
          offset: candidate.textContent?.length ?? 0,
        };
      }
    }

    const previousNode = findAdjacentTextNode(root, container, 'previous');
    if (previousNode) {
      return {
        node: previousNode,
        offset: previousNode.textContent?.length ?? 0,
      };
    }

    return null;
  }

  for (let index = Math.min(boundedOffset - 1, childNodes.length - 1); index >= 0; index -= 1) {
    const candidate = findLastTextNode(childNodes[index]);
    if (candidate) {
      return {
        node: candidate,
        offset: candidate.textContent?.length ?? 0,
      };
    }
  }

  const previousNode = findAdjacentTextNode(root, container, 'previous');
  if (previousNode) {
    return {
      node: previousNode,
      offset: previousNode.textContent?.length ?? 0,
    };
  }

  for (let index = boundedOffset; index < childNodes.length; index += 1) {
    const candidate = findFirstTextNode(childNodes[index]);
    if (candidate) {
      return {
        node: candidate,
        offset: 0,
      };
    }
  }

  const nextNode = findAdjacentTextNode(root, container, 'next');
  if (nextNode) {
    return {
      node: nextNode,
      offset: 0,
    };
  }

  return null;
}

function cleanupAnnotations(root: HTMLElement) {
  root.querySelectorAll('[data-inline-clarification-slot]').forEach((element) => element.remove());
  root.querySelectorAll('[data-inline-annotation-fragment="true"]').forEach((element) => {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
  });
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function buildSelectionPreviewHtml(range: Range): string {
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());

  container
    .querySelectorAll(
      '[data-inline-annotation-badge],[data-inline-clarification-slot],.katex-mathml,annotation[encoding="application/x-tex"],annotation-xml',
    )
    .forEach((element) => element.remove());

  container
    .querySelectorAll('[data-inline-annotation-fragment="true"]')
    .forEach((element) => unwrapElement(element));

  return container.innerHTML.trim();
}

function createInitialGroup(
  key: string,
  item: AnchoredItem,
  resolved: { anchorStart: number; anchorEnd: number } | null,
): AnchorGroup {
  return {
    key,
    anchorText: item.anchorText,
    anchorStart: resolved?.anchorStart ?? -1,
    anchorEnd: resolved?.anchorEnd ?? -1,
    anchorContextBefore: item.anchorContextBefore,
    anchorContextAfter: item.anchorContextAfter,
    clarifications: [],
    visualizations: [],
  };
}

function buildAnchorGroups(
  clarifications: TClarification[],
  visualizations: TVisualization[],
  renderedText: string,
): { groups: AnchorGroup[]; brokenGroups: AnchorGroup[] } {
  const grouped = new Map<string, AnchorGroup>();

  const addItem = (
    item: AnchoredItem,
    kind: 'clarification' | 'visualization',
    rawItem: unknown,
  ) => {
    const resolved = resolveAnchorWithContext(
      renderedText,
      item.anchorText,
      item.anchorContextBefore,
      item.anchorContextAfter,
      item.anchorStart,
    );
    const key = `${item.anchorText}:${resolved?.anchorStart ?? item.anchorStart}`;
    const group = grouped.get(key) ?? createInitialGroup(key, item, resolved);

    if (group.anchorStart < 0 && resolved) {
      group.anchorStart = resolved.anchorStart;
      group.anchorEnd = resolved.anchorEnd;
    }

    if (kind === 'clarification') {
      group.clarifications.push(rawItem as TClarification);
    } else {
      group.visualizations.push(rawItem as TVisualization);
    }

    grouped.set(key, group);
  };

  clarifications.forEach((clarification) => {
    addItem(clarification, 'clarification', clarification);
  });

  visualizations.forEach((visualization) => {
    addItem(visualization, 'visualization', visualization);
  });

  const groups = Array.from(grouped.values()).sort(
    (left, right) => left.anchorStart - right.anchorStart,
  );
  const activeGroups = groups.filter(
    (group) => group.anchorStart >= 0 && group.anchorEnd > group.anchorStart,
  );
  const brokenGroups = groups.filter(
    (group) => !(group.anchorStart >= 0 && group.anchorEnd > group.anchorStart),
  );

  return {
    groups: activeGroups,
    brokenGroups,
  };
}

function getFragmentsForGroup(root: HTMLElement, key: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-anchor-keys]')).filter((element) =>
    element.dataset.anchorKeys?.split(',').includes(key),
  );
}

function applyAnnotations(root: HTMLElement, groups: AnchorGroup[]): SlotState[] {
  const nodes = getTextNodes(root);
  let globalStart = 0;

  for (const node of nodes) {
    const value = node.textContent ?? '';
    const globalEnd = globalStart + value.length;
    const overlaps = groups.filter(
      (group) => group.anchorStart < globalEnd && group.anchorEnd > globalStart,
    );

    if (overlaps.length === 0) {
      globalStart = globalEnd;
      continue;
    }

    const cutPoints = new Set<number>([0, value.length]);
    overlaps.forEach((group) => {
      cutPoints.add(Math.max(0, group.anchorStart - globalStart));
      cutPoints.add(Math.min(value.length, group.anchorEnd - globalStart));
    });

    const orderedCuts = Array.from(cutPoints).sort((left, right) => left - right);
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < orderedCuts.length - 1; index += 1) {
      const start = orderedCuts[index];
      const end = orderedCuts[index + 1];
      if (start === end) {
        continue;
      }

      const segmentText = value.slice(start, end);
      const segmentGroups = overlaps.filter((group) => {
        const absoluteStart = globalStart + start;
        const absoluteEnd = globalStart + end;
        return group.anchorStart < absoluteEnd && group.anchorEnd > absoluteStart;
      });

      if (segmentGroups.length === 0) {
        fragment.appendChild(document.createTextNode(segmentText));
        continue;
      }

      const wrapper = document.createElement('span');
      wrapper.dataset.inlineAnnotationFragment = 'true';
      wrapper.dataset.anchorKeys = segmentGroups.map((group) => group.key).join(',');
      wrapper.className =
        'inline rounded-sm bg-amber-300/35 px-[0.08rem] text-current shadow-[inset_0_-2px_0_rgba(245,158,11,0.55)] dark:bg-amber-500/15';
      wrapper.appendChild(document.createTextNode(segmentText));

      if (
        segmentGroups.some((group) => group.clarifications.length + group.visualizations.length > 1)
      ) {
        const badge = document.createElement('span');
        badge.dataset.inlineAnnotationBadge = 'true';
        badge.className =
          'ml-1 inline-flex min-h-[1rem] min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white';
        badge.textContent = String(
          Math.max(
            ...segmentGroups.map(
              (group) => group.clarifications.length + group.visualizations.length,
            ),
          ),
        );
        wrapper.appendChild(badge);
      }

      fragment.appendChild(wrapper);
    }

    node.parentNode?.replaceChild(fragment, node);
    globalStart = globalEnd;
  }

  const slots: SlotState[] = [];
  const lastInsertedByBlock = new Map<Element, Element>();

  groups.forEach((group) => {
    const fragments = getFragmentsForGroup(root, group.key);
    if (fragments.length === 0) {
      return;
    }

    const blocks = fragments.reduce<Element[]>((acc, fragment) => {
      const block = fragment.closest(blockSelector) ?? fragment.parentElement;
      if (!block || !block.parentElement || acc.includes(block)) {
        return acc;
      }

      acc.push(block);
      return acc;
    }, []);

    blocks.forEach((block, index) => {
      const slot = document.createElement('div');
      slot.dataset.inlineClarificationSlot = `${group.key}:${index}`;
      slot.className = 'ml-4 mt-2';

      const anchor = lastInsertedByBlock.get(block) ?? block;
      anchor.parentElement?.insertBefore(slot, anchor.nextSibling);
      lastInsertedByBlock.set(block, slot);
      slots.push({
        slotId: `${group.key}:${index}`,
        container: slot,
        group,
      });
    });
  });

  return slots;
}

function SelectionComposer({
  selection,
  conversationId,
  parentMessageId,
  projectId,
  existingClarifications,
  clarificationPending,
  visualizationPending,
  onCancel,
  onSubmitClarification,
  onSubmitVisualization,
}: {
  selection: SelectionState;
  conversationId: string;
  parentMessageId: string;
  projectId?: string | null;
  existingClarifications: TClarification[];
  clarificationPending: boolean;
  visualizationPending: boolean;
  onCancel: () => void;
  onSubmitClarification: (question: string) => Promise<void>;
  onSubmitVisualization: (
    prompt: string,
    artifactType: TVisualizationArtifactType,
  ) => Promise<void>;
}) {
  const localize = useLocalize();
  const [activeTab, setActiveTab] = useState<'clarification' | 'visualization'>('clarification');
  const [question, setQuestion] = useState('');
  const [prompt, setPrompt] = useState('');
  const [artifactType, setArtifactType] = useState<TVisualizationArtifactType>('html_app');
  const existingClarificationContext = useMemo(
    () => mapExistingClarifications(existingClarifications),
    [existingClarifications],
  );
  const clarificationSuggestionsQuery = useClarificationSuggestionsQuery(
    activeTab === 'clarification'
      ? {
          projectId,
          conversationId,
          parentMessageId,
          anchorStart: selection.anchorStart,
          anchorEnd: selection.anchorEnd,
          anchorText: selection.anchorText,
          anchorContextBefore: selection.anchorContextBefore,
          anchorContextAfter: selection.anchorContextAfter,
          existingClarifications: existingClarificationContext,
        }
      : null,
    {
      enabled: activeTab === 'clarification',
    },
  );
  const visualizationSuggestionsQuery = useVisualizationSuggestionsQuery(
    activeTab === 'visualization'
      ? {
          projectId,
          conversationId,
          parentMessageId,
          anchorStart: selection.anchorStart,
          anchorEnd: selection.anchorEnd,
          anchorText: selection.anchorText,
          anchorContextBefore: selection.anchorContextBefore,
          anchorContextAfter: selection.anchorContextAfter,
          existingClarifications: existingClarificationContext,
        }
      : null,
    {
      enabled: activeTab === 'visualization',
    },
  );

  return (
    <div
      data-inline-clarification-composer="true"
      className="fixed z-50 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border-light bg-surface-primary p-3 shadow-2xl"
      style={{
        top: selection.top,
        left: selection.left,
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
            activeTab === 'clarification'
              ? 'bg-surface-active-alt text-text-primary'
              : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
          onClick={() => setActiveTab('clarification')}
        >
          <MessageCirclePlus className="h-3.5 w-3.5" />
          {localize('com_ui_clarification')}
        </button>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
            activeTab === 'visualization'
              ? 'bg-surface-active-alt text-text-primary'
              : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
          onClick={() => setActiveTab('visualization')}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          {localize('com_ui_visualization')}
        </button>
      </div>
      <div className="bg-surface-secondary/60 mb-3 rounded-lg px-3 py-2">
        <div className={popupPreviewClasses}>
          {selection.previewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: selection.previewHtml }} />
          ) : (
            <MarkdownLite content={selection.anchorText} codeExecution={false} />
          )}
        </div>
      </div>

      {activeTab === 'clarification' ? (
        <>
          {clarificationSuggestionsQuery.isLoading ? <SuggestionsLoadingState /> : null}
          {!clarificationSuggestionsQuery.isLoading && clarificationSuggestionsQuery.isError ? (
            <SuggestionsErrorState />
          ) : null}
          {clarificationSuggestionsQuery.data ? (
            <>
              <SuggestionSummary
                contentProfile={clarificationSuggestionsQuery.data.contentProfile}
                focusSummary={clarificationSuggestionsQuery.data.focusSummary}
              />
              <div className="mb-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_suggested_clarifications')}
                </div>
                {clarificationSuggestionsQuery.data.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    className="bg-surface-primary/70 w-full rounded-xl border border-border-light px-3 py-2 text-left transition hover:bg-surface-hover"
                    onClick={() => setQuestion(suggestion.proposedQuestion)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-text-primary">
                        {suggestion.label}
                      </div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                        {localize('com_ui_use_suggestion')}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-text-primary">
                      {suggestion.proposedQuestion}
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      {suggestion.understandingGain}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={localize('com_ui_clarification_question_placeholder')}
            className="min-h-[96px] w-full rounded-xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary outline-none focus:border-border-heavy"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" className="btn btn-neutral" onClick={onCancel}>
              {localize('com_ui_cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={clarificationPending || question.trim().length === 0}
              onClick={() => onSubmitClarification(question.trim())}
            >
              {localize('com_ui_ask')}
            </button>
          </div>
        </>
      ) : (
        <>
          {visualizationSuggestionsQuery.isLoading ? <SuggestionsLoadingState /> : null}
          {!visualizationSuggestionsQuery.isLoading && visualizationSuggestionsQuery.isError ? (
            <SuggestionsErrorState />
          ) : null}
          {visualizationSuggestionsQuery.data ? (
            <>
              <SuggestionSummary
                contentProfile={visualizationSuggestionsQuery.data.contentProfile}
                focusSummary={visualizationSuggestionsQuery.data.focusSummary}
              />
              <div className="mb-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_suggested_visualizations')}
                </div>
                {visualizationSuggestionsQuery.data.suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.label}:${suggestion.artifactType}`}
                    type="button"
                    className="bg-surface-primary/70 w-full rounded-xl border border-border-light px-3 py-2 text-left transition hover:bg-surface-hover"
                    onClick={() => {
                      setPrompt(suggestion.proposedPrompt);
                      setArtifactType(suggestion.artifactType);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-text-primary">
                        {suggestion.label}
                      </div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                        {localize('com_ui_use_suggestion')}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                        {suggestion.artifactType}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-text-primary">
                      {suggestion.proposedPrompt}
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      {suggestion.understandingGain}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2">
            {visualizationQuickTypes.map((item) => (
              <button
                key={item.artifactType}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  artifactType === item.artifactType
                    ? 'bg-surface-active-alt text-text-primary'
                    : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
                onClick={() => setArtifactType(item.artifactType)}
              >
                {localize(item.labelKey)}
              </button>
            ))}
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={localize('com_ui_visualization_prompt_placeholder')}
            className="min-h-[112px] w-full rounded-xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary outline-none focus:border-border-heavy"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" className="btn btn-neutral" onClick={onCancel}>
              {localize('com_ui_cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={visualizationPending || prompt.trim().length === 0}
              onClick={() => onSubmitVisualization(prompt.trim(), artifactType)}
            >
              <WandSparkles className="mr-1 h-4 w-4" />
              {localize('com_ui_generate_visualization')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ClarificationComposer({
  group,
  conversationId,
  parentMessageId,
  projectId,
}: {
  group: AnchorGroup;
  conversationId: string;
  parentMessageId: string;
  projectId?: string | null;
}) {
  const localize = useLocalize();
  const createClarificationMutation = useCreateClarificationMutation();
  const [question, setQuestion] = useState('');
  const clarificationSuggestionsQuery = useClarificationSuggestionsQuery(
    {
      projectId,
      conversationId,
      parentMessageId,
      anchorStart: group.anchorStart,
      anchorEnd: group.anchorEnd,
      anchorText: group.anchorText,
      anchorContextBefore: group.anchorContextBefore,
      anchorContextAfter: group.anchorContextAfter,
      existingClarifications: mapExistingClarifications(group.clarifications),
    },
    {
      enabled: true,
    },
  );

  const handleCreate = async () => {
    if (!question.trim()) {
      return;
    }

    await createClarificationMutation.mutateAsync({
      projectId: projectId ?? undefined,
      conversationId,
      parentMessageId,
      anchorStart: group.anchorStart,
      anchorEnd: group.anchorEnd,
      anchorText: group.anchorText,
      anchorContextBefore: group.anchorContextBefore,
      anchorContextAfter: group.anchorContextAfter,
      clarificationQuestion: question.trim(),
    });
    setQuestion('');
  };

  return (
    <div className="bg-surface-secondary/30 rounded-xl border border-border-light p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
        {localize('com_ui_add_clarification')}
      </div>
      {clarificationSuggestionsQuery.isLoading ? <SuggestionsLoadingState /> : null}
      {!clarificationSuggestionsQuery.isLoading && clarificationSuggestionsQuery.isError ? (
        <SuggestionsErrorState />
      ) : null}
      {clarificationSuggestionsQuery.data ? (
        <>
          <SuggestionSummary
            contentProfile={clarificationSuggestionsQuery.data.contentProfile}
            focusSummary={clarificationSuggestionsQuery.data.focusSummary}
          />
          <div className="mb-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
              {localize('com_ui_suggested_clarifications')}
            </div>
            {clarificationSuggestionsQuery.data.suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                className="bg-surface-primary/70 w-full rounded-xl border border-border-light px-3 py-2 text-left transition hover:bg-surface-hover"
                onClick={() => setQuestion(suggestion.proposedQuestion)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-text-primary">{suggestion.label}</div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                    {localize('com_ui_use_suggestion')}
                  </div>
                </div>
                <div className="mt-1 text-sm text-text-primary">{suggestion.proposedQuestion}</div>
                <div className="mt-1 text-xs text-text-secondary">
                  {suggestion.understandingGain}
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={localize('com_ui_clarification_question_placeholder')}
        className="min-h-[88px] w-full rounded-xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary outline-none focus:border-border-heavy"
      />
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          className="btn btn-primary"
          disabled={createClarificationMutation.isLoading || question.trim().length === 0}
          onClick={handleCreate}
        >
          {localize('com_ui_ask')}
        </button>
      </div>
    </div>
  );
}

function InlineThread({
  group,
  parentText,
  conversationId,
  parentMessageId,
  projectId,
}: {
  group: AnchorGroup;
  parentText: string;
  conversationId: string;
  parentMessageId: string;
  projectId?: string | null;
}) {
  const localize = useLocalize();
  const [collapsed, setCollapsed] = useState(
    group.clarifications.length + group.visualizations.length > 1,
  );
  const [activeTab, setActiveTab] = useState<'clarification' | 'visualization'>(
    group.visualizations.length > 0 && group.clarifications.length === 0
      ? 'visualization'
      : 'clarification',
  );

  return (
    <div className="border-border-light/80 bg-surface-secondary/40 rounded-2xl border p-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
            {localize('com_ui_inline_clarification')}
          </div>
          <div className="truncate text-sm font-medium text-text-primary">{group.anchorText}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex rounded-full bg-surface-active-alt px-2 py-0.5 text-xs font-semibold text-text-primary">
            {group.clarifications.length} {localize('com_ui_clarifications')}
          </span>
          <span className="inline-flex rounded-full bg-surface-active-alt px-2 py-0.5 text-xs font-semibold text-text-primary">
            {group.visualizations.length} {localize('com_ui_visualizations')}
          </span>
        </div>
      </button>
      {!collapsed ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeTab === 'clarification'
                  ? 'bg-surface-active-alt text-text-primary'
                  : 'bg-surface-primary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
              onClick={() => setActiveTab('clarification')}
            >
              {localize('com_ui_clarification')}
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeTab === 'visualization'
                  ? 'bg-surface-active-alt text-text-primary'
                  : 'bg-surface-primary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
              onClick={() => setActiveTab('visualization')}
            >
              {localize('com_ui_visualization')}
            </button>
          </div>

          {activeTab === 'clarification' ? (
            <div className="space-y-3">
              {group.clarifications.length > 0 ? (
                group.clarifications.map((clarification) => (
                  <ClarificationBlock
                    key={clarification.clarificationId}
                    parentText={parentText}
                    conversationId={conversationId}
                    parentMessageId={parentMessageId}
                    clarification={clarification}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border-light px-4 py-6 text-sm text-text-secondary">
                  {localize('com_ui_no_clarifications_yet')}
                </div>
              )}
              <ClarificationComposer
                group={group}
                conversationId={conversationId}
                parentMessageId={parentMessageId}
                projectId={projectId}
              />
            </div>
          ) : (
            <VisualizationTab
              anchorStart={group.anchorStart}
              anchorEnd={group.anchorEnd}
              anchorText={group.anchorText}
              anchorContextBefore={group.anchorContextBefore}
              anchorContextAfter={group.anchorContextAfter}
              conversationId={conversationId}
              parentMessageId={parentMessageId}
              projectId={projectId}
              clarifications={group.clarifications}
              visualizations={group.visualizations}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function renderIntegratedVisualizations(
  group: AnchorGroup,
  conversationId: string,
  parentMessageId: string,
): JSX.Element[] {
  return group.visualizations
    .filter(
      (visualization) =>
        visualization.integrationState === 'integrated' &&
        visualization.isLatestVersion &&
        visualization.status !== 'archived' &&
        !visualization.deletedAt,
    )
    .map((visualization) => (
      <VisualizationCard
        key={`integrated-${visualization.visualizationId}`}
        visualization={visualization}
        conversationId={conversationId}
        parentMessageId={parentMessageId}
        integrated
      />
    ));
}

function AnnotatedAssistantMessage({
  message,
  content,
  isLatestMessage,
}: AnnotatedAssistantMessageProps) {
  const localize = useLocalize();
  const activeProjectId = useRecoilValue(store.activeProjectId);
  const { conversationId } = useMessageContext();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { data: clarificationData } = useConversationClarificationsQuery(conversationId, {
    enabled: !!conversationId && !message.isCreatedByUser,
  });
  const { data: visualizationData } = useConversationVisualizationsQuery(conversationId, {
    enabled: !!conversationId && !message.isCreatedByUser,
  });
  const createClarificationMutation = useCreateClarificationMutation();
  const createVisualizationMutation = useCreateVisualizationMutation();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [slots, setSlots] = useState<SlotState[]>([]);
  const [brokenGroups, setBrokenGroups] = useState<AnchorGroup[]>([]);

  const clarifications = useMemo(() => {
    if (!clarificationData?.length) {
      return emptyClarifications;
    }

    return clarificationData.filter(
      (clarification) =>
        clarification.parentMessageId === message.messageId && clarification.status !== 'archived',
    );
  }, [clarificationData, message.messageId]);

  const visualizations = useMemo(() => {
    if (!visualizationData?.length) {
      return emptyVisualizations;
    }

    return visualizationData.filter(
      (visualization) =>
        visualization.parentMessageId === message.messageId &&
        visualization.status !== 'archived' &&
        !visualization.deletedAt,
    );
  }, [message.messageId, visualizationData]);
  const selectionClarifications = useMemo(() => {
    if (!selection) {
      return emptyClarifications;
    }

    return clarifications.filter((clarification) => areRelatedAnchors(clarification, selection));
  }, [clarifications, selection]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }

    cleanupAnnotations(root);
    const renderedText = collectPlainText(root);
    const { groups, brokenGroups: unresolvedGroups } = buildAnchorGroups(
      clarifications,
      visualizations,
      renderedText,
    );
    const nextSlots = applyAnnotations(root, groups);
    setSlots(nextSlots);
    setBrokenGroups(unresolvedGroups);

    return () => {
      cleanupAnnotations(root);
    };
  }, [clarifications, content, visualizations]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }

    const handleSelection = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        target.parentElement?.closest('[data-inline-clarification-composer="true"]')
      ) {
        return;
      }

      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
        setSelection(null);
        return;
      }

      const range = domSelection.getRangeAt(0);
      const startBoundary = resolveBoundary(root, range.startContainer, range.startOffset, 'start');
      const endBoundary = resolveBoundary(root, range.endContainer, range.endOffset, 'end');
      if (!startBoundary || !endBoundary) {
        setSelection(null);
        return;
      }

      if (!root.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }

      const anchorStart = getOffsetForNode(root, startBoundary.node, startBoundary.offset);
      const anchorEnd = getOffsetForNode(root, endBoundary.node, endBoundary.offset);
      if (anchorStart == null || anchorEnd == null || anchorEnd <= anchorStart) {
        setSelection(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setSelection(null);
        return;
      }

      const renderedText = collectPlainText(root);
      const anchorText = renderedText.slice(anchorStart, anchorEnd);
      if (!anchorText.trim()) {
        setSelection(null);
        return;
      }

      setSelection({
        anchorStart,
        anchorEnd,
        anchorText,
        anchorContextBefore: renderedText.slice(Math.max(0, anchorStart - 240), anchorStart),
        anchorContextAfter: renderedText.slice(
          anchorEnd,
          Math.min(renderedText.length, anchorEnd + 240),
        ),
        previewHtml: buildSelectionPreviewHtml(range),
        top: Math.min(window.innerHeight - 260, rect.bottom + 10),
        left: Math.min(window.innerWidth - 420, Math.max(16, rect.left)),
      });
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('touchend', handleSelection);
    };
  }, [content]);

  const resolveSelectionAnchor = () => {
    if (!selection) {
      return null;
    }

    return (
      resolveAnchorWithContext(
        content,
        selection.anchorText,
        selection.anchorContextBefore,
        selection.anchorContextAfter,
      ) ?? {
        anchorStart: Math.max(0, content.indexOf(selection.anchorText)),
        anchorEnd: Math.max(0, content.indexOf(selection.anchorText)) + selection.anchorText.length,
      }
    );
  };

  const handleCreateClarification = async (question: string) => {
    if (!selection || !conversationId) {
      return;
    }

    const resolvedSourceAnchor = resolveSelectionAnchor();
    if (!resolvedSourceAnchor) {
      return;
    }

    await createClarificationMutation.mutateAsync({
      projectId: message.projectId ?? activeProjectId ?? undefined,
      conversationId,
      parentMessageId: message.messageId ?? '',
      anchorStart: resolvedSourceAnchor.anchorStart,
      anchorEnd: resolvedSourceAnchor.anchorEnd,
      anchorText: selection.anchorText,
      anchorContextBefore: selection.anchorContextBefore,
      anchorContextAfter: selection.anchorContextAfter,
      clarificationQuestion: question.trim(),
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleCreateVisualization = async (
    prompt: string,
    artifactType: TVisualizationArtifactType,
  ) => {
    if (!selection || !conversationId) {
      return;
    }

    const resolvedSourceAnchor = resolveSelectionAnchor();
    if (!resolvedSourceAnchor) {
      return;
    }

    await createVisualizationMutation.mutateAsync({
      projectId: message.projectId ?? activeProjectId ?? undefined,
      conversationId,
      parentMessageId: message.messageId ?? '',
      anchorStart: resolvedSourceAnchor.anchorStart,
      anchorEnd: resolvedSourceAnchor.anchorEnd,
      anchorText: selection.anchorText,
      anchorContextBefore: selection.anchorContextBefore,
      anchorContextAfter: selection.anchorContextAfter,
      prompt,
      artifactType,
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="relative">
      <div ref={contentRef}>
        <Markdown content={content} isLatestMessage={isLatestMessage} />
      </div>
      {selection
        ? createPortal(
            <SelectionComposer
              selection={selection}
              conversationId={conversationId ?? ''}
              parentMessageId={message.messageId ?? ''}
              projectId={message.projectId ?? activeProjectId ?? null}
              existingClarifications={selectionClarifications}
              clarificationPending={createClarificationMutation.isLoading}
              visualizationPending={createVisualizationMutation.isLoading}
              onCancel={() => setSelection(null)}
              onSubmitClarification={handleCreateClarification}
              onSubmitVisualization={handleCreateVisualization}
            />,
            document.body,
          )
        : null}
      {selection == null ? (
        <button
          type="button"
          className={cn(
            'bg-surface-primary/70 pointer-events-none absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-dashed border-border-light px-3 py-1 text-xs text-text-secondary opacity-0 transition group-hover/message-render:opacity-100',
            !content && 'hidden',
          )}
        >
          <MessageCirclePlus className="h-3.5 w-3.5" />
          {localize('com_ui_ask_inline_clarification')}
        </button>
      ) : null}
      {slots.map((slot) =>
        createPortal(
          <div key={slot.slotId} className="space-y-3">
            {renderIntegratedVisualizations(
              slot.group,
              conversationId ?? '',
              message.messageId ?? '',
            )}
            <InlineThread
              group={slot.group}
              parentText={content}
              conversationId={conversationId ?? ''}
              parentMessageId={message.messageId ?? ''}
              projectId={message.projectId ?? activeProjectId ?? null}
            />
          </div>,
          slot.container,
        ),
      )}
      {brokenGroups.length > 0 ? (
        <div className="mt-3 space-y-3">
          {brokenGroups.map((group) => (
            <div
              key={group.key}
              className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3"
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                {localize('com_ui_broken_anchor')}
              </div>
              <div className="space-y-3">
                {group.clarifications.map((clarification) => (
                  <ClarificationBlock
                    key={clarification.clarificationId}
                    broken
                    parentText={content}
                    conversationId={conversationId ?? ''}
                    parentMessageId={message.messageId ?? ''}
                    clarification={clarification}
                  />
                ))}
                {group.visualizations.map((visualization) => (
                  <VisualizationCard
                    key={visualization.visualizationId}
                    visualization={visualization}
                    conversationId={conversationId ?? ''}
                    parentMessageId={message.messageId ?? ''}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MemoizedAnnotatedAssistantMessage = memo(AnnotatedAssistantMessage);
MemoizedAnnotatedAssistantMessage.displayName = 'AnnotatedAssistantMessage';

export default MemoizedAnnotatedAssistantMessage;
