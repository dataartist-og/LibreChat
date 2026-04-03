import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCirclePlus } from 'lucide-react';
import type { TClarification, TMessage } from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import { useMessageContext } from '~/Providers';
import {
  useConversationClarificationsQuery,
  useCreateClarificationMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
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
  top: number;
  left: number;
};

type ClarificationGroup = {
  key: string;
  anchorText: string;
  anchorStart: number;
  anchorEnd: number;
  clarifications: TClarification[];
};

type SlotState = {
  key: string;
  container: HTMLDivElement;
  group: ClarificationGroup;
};

const blockSelector = 'p, li, blockquote, h1, h2, h3, h4, h5, h6';
const hiddenSelector = '[data-inline-clarification-slot],[data-inline-annotation-badge]';
const emptyClarifications: TClarification[] = [];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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
    const contextScore = scoreContextMatch(text, anchorStart, anchorEnd, contextBefore, contextAfter);
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
          (referenceNode.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
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

function buildClarificationGroups(
  clarifications: TClarification[],
  renderedText: string,
): { groups: ClarificationGroup[]; brokenGroups: ClarificationGroup[] } {
  const grouped = clarifications.reduce<Record<string, ClarificationGroup>>((acc, clarification) => {
    const resolved = resolveAnchorWithContext(
      renderedText,
      clarification.anchorText,
      clarification.anchorContextBefore,
      clarification.anchorContextAfter,
      clarification.anchorStart,
    );
    const key = `${clarification.anchorText}:${resolved?.anchorStart ?? clarification.anchorStart}`;

    if (!acc[key]) {
      acc[key] = {
        key,
        anchorText: clarification.anchorText,
        anchorStart: resolved?.anchorStart ?? -1,
        anchorEnd: resolved?.anchorEnd ?? -1,
        clarifications: [],
      };
    }

    acc[key].clarifications.push(clarification);
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((left, right) => left.anchorStart - right.anchorStart);
  const activeGroups = groups.filter((group) => group.anchorStart >= 0 && group.anchorEnd > group.anchorStart);
  const brokenGroups = groups.filter((group) => !(group.anchorStart >= 0 && group.anchorEnd > group.anchorStart));

  return {
    groups: activeGroups,
    brokenGroups,
  };
}

function applyAnnotations(root: HTMLElement, groups: ClarificationGroup[]): SlotState[] {
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

      if (segmentGroups.some((group) => group.clarifications.length > 1)) {
        const badge = document.createElement('span');
        badge.dataset.inlineAnnotationBadge = 'true';
        badge.className =
          'ml-1 inline-flex min-h-[1rem] min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white';
        badge.textContent = String(
          Math.max(...segmentGroups.map((group) => group.clarifications.length)),
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
    const fragment = Array.from(root.querySelectorAll<HTMLElement>('[data-anchor-keys]')).find(
      (element) => element.dataset.anchorKeys?.split(',').includes(group.key),
    );

    if (!fragment) {
      return;
    }

    const block = fragment.closest(blockSelector) ?? fragment.parentElement;
    if (!block || !block.parentElement) {
      return;
    }

    const slot = document.createElement('div');
    slot.dataset.inlineClarificationSlot = group.key;
    slot.className = 'ml-4 mt-2';

    const anchor = lastInsertedByBlock.get(block) ?? block;
    anchor.parentElement.insertBefore(slot, anchor.nextSibling);
    lastInsertedByBlock.set(block, slot);
    slots.push({ key: group.key, container: slot, group });
  });

  return slots;
}

function Composer({
  selection,
  pending,
  onCancel,
  onSubmit,
}: {
  selection: SelectionState;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (question: string) => Promise<void>;
}) {
  const localize = useLocalize();
  const [question, setQuestion] = useState('');

  return (
    <div
      data-inline-clarification-composer="true"
      className="fixed z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border-light bg-surface-primary p-3 shadow-2xl"
      style={{
        top: selection.top,
        left: selection.left,
      }}
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
        {localize('com_ui_ask_inline_clarification')}
      </div>
      <div className="mb-3 rounded-lg bg-surface-secondary/60 px-3 py-2 text-sm text-text-primary">
        {selection.anchorText}
      </div>
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
          disabled={pending || question.trim().length === 0}
          onClick={() => onSubmit(question)}
        >
          {localize('com_ui_ask')}
        </button>
      </div>
    </div>
  );
}

function ClarificationThread({
  group,
  parentText,
  conversationId,
  parentMessageId,
}: {
  group: ClarificationGroup;
  parentText: string;
  conversationId: string;
  parentMessageId: string;
}) {
  const localize = useLocalize();
  const [collapsed, setCollapsed] = useState(group.clarifications.length > 1);

  return (
    <div className="rounded-2xl border border-border-light/80 bg-surface-secondary/40 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
            {localize('com_ui_inline_clarification')}
          </div>
          <div className="truncate text-sm font-medium text-text-primary">{group.anchorText}</div>
        </div>
        {group.clarifications.length > 1 ? (
          <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-surface-active-alt px-2 text-xs font-semibold text-text-primary">
            {group.clarifications.length}
          </span>
        ) : null}
      </button>
      {!collapsed || group.clarifications.length === 1 ? (
        <div className="mt-3 space-y-3">
          {group.clarifications.map((clarification) => (
            <ClarificationBlock
              key={clarification.clarificationId}
              parentText={parentText}
              conversationId={conversationId}
              parentMessageId={parentMessageId}
              clarification={clarification}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const createClarificationMutation = useCreateClarificationMutation();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [slots, setSlots] = useState<SlotState[]>([]);
  const [brokenGroups, setBrokenGroups] = useState<ClarificationGroup[]>([]);

  const clarifications = useMemo(() => {
    if (!clarificationData?.length) {
      return emptyClarifications;
    }

    return clarificationData.filter(
      (clarification) =>
        clarification.parentMessageId === message.messageId && clarification.status !== 'archived',
    );
  }, [clarificationData, message.messageId]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }

    cleanupAnnotations(root);
    const renderedText = collectPlainText(root);
    const { groups, brokenGroups: unresolvedGroups } = buildClarificationGroups(
      clarifications,
      renderedText,
    );
    const nextSlots = applyAnnotations(root, groups);
    setSlots(nextSlots);
    setBrokenGroups(unresolvedGroups);

    return () => {
      cleanupAnnotations(root);
    };
  }, [clarifications, content]);

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
        anchorContextAfter: renderedText.slice(anchorEnd, Math.min(renderedText.length, anchorEnd + 240)),
        top: Math.min(window.innerHeight - 260, rect.bottom + 10),
        left: Math.min(window.innerWidth - 360, Math.max(16, rect.left)),
      });
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('touchend', handleSelection);
    };
  }, [content]);

  const handleCreateClarification = async (question: string) => {
    if (!selection || !conversationId) {
      return;
    }

    const resolvedSourceAnchor =
      resolveAnchorWithContext(
        content,
        selection.anchorText,
        selection.anchorContextBefore,
        selection.anchorContextAfter,
      ) ?? {
        anchorStart: Math.max(0, content.indexOf(selection.anchorText)),
        anchorEnd:
          Math.max(0, content.indexOf(selection.anchorText)) + selection.anchorText.length,
      };

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

  return (
    <div className="relative">
      <div ref={contentRef}>
        <Markdown content={content} isLatestMessage={isLatestMessage} />
      </div>
      {selection
        ? createPortal(
            <Composer
              selection={selection}
              pending={createClarificationMutation.isLoading}
              onCancel={() => setSelection(null)}
              onSubmit={handleCreateClarification}
            />,
            document.body,
          )
        : null}
      {selection == null ? (
        <button
          type="button"
          className={cn(
            'pointer-events-none absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-dashed border-border-light bg-surface-primary/70 px-3 py-1 text-xs text-text-secondary opacity-0 transition group-hover/message-render:opacity-100',
            !content && 'hidden',
          )}
        >
          <MessageCirclePlus className="h-3.5 w-3.5" />
          {localize('com_ui_ask_inline_clarification')}
        </button>
      ) : null}
      {slots.map((slot) =>
        createPortal(
          <ClarificationThread
            key={slot.key}
            group={slot.group}
            parentText={content}
            conversationId={conversationId ?? ''}
            parentMessageId={message.messageId ?? ''}
          />,
          slot.container,
        ),
      )}
      {brokenGroups.length > 0 ? (
        <div className="mt-3 space-y-3">
          {brokenGroups.map((group) => (
            <div key={group.key} className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                {localize('com_ui_broken_anchor')}
              </div>
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
