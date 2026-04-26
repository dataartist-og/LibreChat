import crypto from 'node:crypto';
import type {
  DocumentSpeechSegmentKind,
  IDocumentBlock,
  IDocumentRenderVersion,
  IDocumentSpeechSourceBlock,
  IStudyDocument,
} from '@librechat/data-schemas';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { buildDisplayMathSpeechMessages, buildInlineMathSpeechMessages } from './prompt';

export const NARRATION_POLICY_VERSION = 'document_speech_v1';
export const DEFAULT_PREFETCH_SEGMENT_COUNT = 3;

type NarrationRunner = (messages: ChatCompletionMessageParam[]) => Promise<string>;

type BuiltSpeechSegment = {
  segmentId: string;
  planId: string;
  documentId: string;
  renderVersionId: string;
  blockId: string;
  charStart: number | null;
  charEnd: number | null;
  segmentIndex: number;
  segmentKind: DocumentSpeechSegmentKind;
  sourceText: string;
  sourceContextBefore: string;
  sourceContextAfter: string;
  sourceFingerprint: string;
  spokenText: string;
  spokenFingerprint: string;
  playbackDirective: 'continue' | 'pause_for_visual';
  focusBlockId: string | null;
  resumeToken: string | null;
  warnings: string[];
  narrationModel: string | null;
};

type BuiltSpeechPlan = {
  planId: string;
  documentId: string;
  renderVersionId: string;
  speechSurfaceFingerprint: string;
  narrationPolicyVersion: string;
  sourceBlocksJson: IDocumentSpeechSourceBlock[];
  segments: BuiltSpeechSegment[];
};

type SegmentDraft = Omit<
  BuiltSpeechSegment,
  'segmentId' | 'planId' | 'segmentIndex' | 'sourceFingerprint' | 'spokenFingerprint'
>;

type DisplayMathNarrationEnvelope = {
  mode: 'narrate' | 'handoff';
  prePauseText?: string;
  equationNarration?: string;
  handoffText?: string;
  resumeText?: string;
  focusBlockId?: string | null;
};

type AssetLike = {
  assetId?: string | null;
  annotation?: string | null;
  imageAnnotation?: string | null;
  altText?: string | null;
};

type SentenceChunk = {
  text: string;
  start: number;
  end: number;
};

type BuildPlanInput = {
  document: IStudyDocument;
  renderVersion: IDocumentRenderVersion;
  narrationModel: string;
  runNarrationModel: NarrationRunner;
};

const INLINE_MATH_PATTERN =
  /(\$[^$]+\$|\\\([^)]*\\\)|\\\[[\s\S]*?\\\]|\\[a-zA-Z]+|[_^{}]|[=<>±×÷∑Σ∏√∞∈∉⊂⊆∀∃→↔≤≥])/u;

const SYMBOL_DENSITY_PATTERN = /[=<>±×÷∑Σ∏√∞∈∉⊂⊆∀∃→↔≤≥^_{}[\]\\]/gu;

function hashValue(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripMarkdown(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/^#{1,6}\s+/gmu, '')
      .replace(/[*_~`>#-]/g, ' ')
      .replace(/\|/g, ' ')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/!\[(.*?)\]\((.*?)\)/g, '$1'),
  );
}

function verbalizeMathLikeText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/\\mathbb\{R\}/g, 'the real numbers')
      .replace(/\\mathbb\{N\}/g, 'the natural numbers')
      .replace(/\\mathbb\{Z\}/g, 'the integers')
      .replace(/\\mathbb\{Q\}/g, 'the rational numbers')
      .replace(/\\mathbb\{C\}/g, 'the complex numbers')
      .replace(/\\rightarrow|\\to/g, ' to ')
      .replace(/\\leftrightarrow/g, ' if and only if ')
      .replace(/\\infty/g, ' infinity ')
      .replace(/\\sum/g, ' sum ')
      .replace(/\\prod/g, ' product ')
      .replace(/\\partial/g, ' partial ')
      .replace(/\\nabla/g, ' nabla ')
      .replace(/\\sqrt\{([^}]+)\}/g, ' square root of $1 ')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2')
      .replace(/([a-zA-Z0-9])\^2\b/g, '$1 squared')
      .replace(/([a-zA-Z0-9])\^3\b/g, '$1 cubed')
      .replace(/([a-zA-Z0-9])\^([a-zA-Z0-9]+)/g, '$1 to the power of $2')
      .replace(/([a-zA-Z0-9])_([a-zA-Z0-9]+)/g, '$1 sub $2')
      .replace(/≤/g, ' less than or equal to ')
      .replace(/≥/g, ' greater than or equal to ')
      .replace(/≠/g, ' not equal to ')
      .replace(/≈/g, ' approximately equal to ')
      .replace(/→/g, ' to ')
      .replace(/↔/g, ' if and only if ')
      .replace(/∈/g, ' is in ')
      .replace(/∉/g, ' is not in ')
      .replace(/⊂/g, ' is a subset of ')
      .replace(/⊆/g, ' is a subset of or equal to ')
      .replace(/∀/g, ' for all ')
      .replace(/∃/g, ' there exists ')
      .replace(/∑/g, ' sum ')
      .replace(/∏/g, ' product ')
      .replace(/√/g, ' square root ')
      .replace(/∞/g, ' infinity ')
      .replace(/[{}\\]/g, ' ')
      .replace(/\$/g, ' ')
      .replace(/\s*\/\s*/g, ' over '),
  );
}

function resolveBlockText(block: IDocumentBlock): string {
  return normalizeWhitespace(block.plainText || stripMarkdown(block.contentMarkdown));
}

function isSpeakableBlock(block: IDocumentBlock): boolean {
  return Boolean(resolveBlockText(block) || block.assetId);
}

function blockFingerprint(block: IDocumentBlock): string {
  return hashValue(`${block.blockId}:${block.type}:${resolveBlockText(block)}`);
}

function computeHeadingPaths(blocks: IDocumentBlock[]): Map<string, string[]> {
  const headingStack: Array<{ level: number; title: string }> = [];
  return new Map(
    blocks.map((block) => {
      if (block.type === 'heading' && block.title && block.level) {
        while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= block.level) {
          headingStack.pop();
        }
        headingStack.push({ level: block.level, title: block.title });
      }

      return [block.blockId, headingStack.map((item) => item.title)] as const;
    }),
  );
}

function getContextBefore(blocks: IDocumentBlock[], index: number): string {
  for (let current = index - 1; current >= 0; current -= 1) {
    const text = resolveBlockText(blocks[current]);
    if (text) {
      return text.slice(Math.max(0, text.length - 220));
    }
  }

  return '';
}

function getContextAfter(blocks: IDocumentBlock[], index: number): string {
  for (let current = index + 1; current < blocks.length; current += 1) {
    const text = resolveBlockText(blocks[current]);
    if (text) {
      return text.slice(0, 220);
    }
  }

  return '';
}

function splitSentences(text: string): SentenceChunk[] {
  if (!text) {
    return [];
  }

  const chunks: SentenceChunk[] = [];
  const sentencePattern = /[^.!?]+[.!?]?/g;
  let match = sentencePattern.exec(text);

  while (match) {
    const raw = match[0];
    const normalized = normalizeWhitespace(raw);
    if (normalized) {
      chunks.push({
        text: normalized,
        start: match.index,
        end: match.index + raw.length,
      });
    }
    match = sentencePattern.exec(text);
  }

  return chunks;
}

function chunkSentences(text: string): SentenceChunk[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return text
      ? [
          {
            text: text,
            start: 0,
            end: text.length,
          },
        ]
      : [];
  }

  const chunks: SentenceChunk[] = [];
  let currentText = '';
  let currentStart = sentences[0].start;
  let currentEnd = sentences[0].end;

  sentences.forEach((sentence, index) => {
    const candidate = currentText ? `${currentText} ${sentence.text}` : sentence.text;
    const shouldFlush =
      currentText.length >= 250 && candidate.length > 450 && index > 0;

    if (shouldFlush) {
      chunks.push({
        text: currentText,
        start: currentStart,
        end: currentEnd,
      });
      currentText = sentence.text;
      currentStart = sentence.start;
      currentEnd = sentence.end;
      return;
    }

    currentText = candidate;
    currentEnd = sentence.end;
  });

  if (currentText) {
    chunks.push({
      text: currentText,
      start: currentStart,
      end: currentEnd,
    });
  }

  return chunks;
}

function extractJsonObject<T>(raw: string): T | null {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  const jsonCandidate =
    fencedMatch?.[1]?.trim() ??
    (raw.includes('{') && raw.includes('}') ? raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1) : '');

  if (!jsonCandidate) {
    return null;
  }

  try {
    return JSON.parse(jsonCandidate) as T;
  } catch {
    return null;
  }
}

function mathSymbolDensity(value: string): number {
  const matches = value.match(SYMBOL_DENSITY_PATTERN) ?? [];
  return value.length === 0 ? 0 : matches.length / value.length;
}

function shouldRewriteInlineMath(block: IDocumentBlock, chunkText: string): boolean {
  if (INLINE_MATH_PATTERN.test(block.contentMarkdown)) {
    return true;
  }

  return mathSymbolDensity(chunkText) >= 0.015;
}

function buildSourceFingerprint(draft: SegmentDraft): string {
  return hashValue(
    JSON.stringify({
      blockId: draft.blockId,
      kind: draft.segmentKind,
      sourceText: draft.sourceText,
      sourceContextBefore: draft.sourceContextBefore,
      sourceContextAfter: draft.sourceContextAfter,
      directive: draft.playbackDirective,
      version: NARRATION_POLICY_VERSION,
    }),
  );
}

function buildSpokenFingerprint(draft: SegmentDraft): string {
  return hashValue(
    JSON.stringify({
      spokenText: draft.spokenText,
      kind: draft.segmentKind,
      directive: draft.playbackDirective,
      focusBlockId: draft.focusBlockId,
      resumeToken: draft.resumeToken,
      version: NARRATION_POLICY_VERSION,
    }),
  );
}

function finalizeSegments(
  documentId: string,
  renderVersionId: string,
  speechSurfaceFingerprint: string,
  drafts: SegmentDraft[],
): { planId: string; segments: BuiltSpeechSegment[] } {
  const planId = hashValue(
    `${documentId}:${renderVersionId}:${speechSurfaceFingerprint}:${NARRATION_POLICY_VERSION}`,
  );

  return {
    planId,
    segments: drafts.map((draft, segmentIndex) => {
      const sourceFingerprint = buildSourceFingerprint(draft);
      const spokenFingerprint = buildSpokenFingerprint(draft);
      const segmentId = hashValue(
        `${planId}:${draft.blockId}:${sourceFingerprint}:${spokenFingerprint}:${segmentIndex}`,
      );

      return {
        ...draft,
        segmentId,
        planId,
        documentId,
        renderVersionId,
        segmentIndex,
        sourceFingerprint,
        spokenFingerprint,
      };
    }),
  };
}

async function narrateInlineMathSegment(
  document: IStudyDocument,
  block: IDocumentBlock,
  headingPath: string[],
  chunk: SentenceChunk,
  blockText: string,
  narrationModel: string,
  runNarrationModel: NarrationRunner,
): Promise<Pick<SegmentDraft, 'spokenText' | 'segmentKind' | 'warnings' | 'narrationModel'>> {
  try {
    const raw = await runNarrationModel(
      buildInlineMathSpeechMessages({
        documentTitle: document.title,
        headingPath,
        blockType: block.type,
        sourceMarkdown: block.contentMarkdown,
        segmentText: chunk.text,
        contextBefore: blockText.slice(Math.max(0, chunk.start - 180), chunk.start),
        contextAfter: blockText.slice(chunk.end, Math.min(blockText.length, chunk.end + 180)),
      }),
    );
    const parsed = extractJsonObject<{ spoken_text?: string }>(raw);
    const spokenText = normalizeWhitespace(parsed?.spoken_text ?? '');
    if (!spokenText) {
      throw new Error('Inline math narration returned empty spoken text');
    }

    return {
      spokenText,
      segmentKind: 'math_inline_rewrite',
      warnings: [],
      narrationModel,
    };
  } catch {
    return {
      spokenText: verbalizeMathLikeText(chunk.text),
      segmentKind: 'math_inline_rewrite',
      warnings: ['math_inline_fallback'],
      narrationModel,
    };
  }
}

function buildTextChunkDraft(
  documentId: string,
  renderVersionId: string,
  block: IDocumentBlock,
  chunk: SentenceChunk,
  blockText: string,
  segmentKind: DocumentSpeechSegmentKind,
  spokenText: string,
  warnings: string[],
  narrationModel: string | null,
): SegmentDraft {
  return {
    documentId,
    renderVersionId,
    blockId: block.blockId,
    charStart: chunk.start,
    charEnd: chunk.end,
    segmentKind,
    sourceText: chunk.text,
    sourceContextBefore: blockText.slice(Math.max(0, chunk.start - 180), chunk.start),
    sourceContextAfter: blockText.slice(chunk.end, Math.min(blockText.length, chunk.end + 180)),
    spokenText: normalizeWhitespace(spokenText),
    playbackDirective: 'continue',
    focusBlockId: null,
    resumeToken: null,
    warnings,
    narrationModel,
  };
}

async function buildTextSegments(
  document: IStudyDocument,
  block: IDocumentBlock,
  headingPath: string[],
  narrationModel: string,
  runNarrationModel: NarrationRunner,
  baseKind: DocumentSpeechSegmentKind,
): Promise<SegmentDraft[]> {
  const blockText = resolveBlockText(block);
  if (!blockText) {
    return [];
  }

  const chunks = chunkSentences(blockText);
  const segments = await Promise.all(
    chunks.map(async (chunk) => {
      if (shouldRewriteInlineMath(block, chunk.text)) {
        const rewritten = await narrateInlineMathSegment(
          document,
          block,
          headingPath,
          chunk,
          blockText,
          narrationModel,
          runNarrationModel,
        );
        return buildTextChunkDraft(
          document.documentId,
          '',
          block,
          chunk,
          blockText,
          rewritten.segmentKind,
          rewritten.spokenText,
          rewritten.warnings,
          rewritten.narrationModel,
        );
      }

      return buildTextChunkDraft(
        document.documentId,
        '',
        block,
        chunk,
        blockText,
        baseKind,
        stripMarkdown(chunk.text),
        [],
        null,
      );
    }),
  );

  return segments;
}

function buildPageBreakSegments(document: IStudyDocument, block: IDocumentBlock): SegmentDraft[] {
  const sourceText = resolveBlockText(block).replace(/^page\s*/iu, '').trim();
  const spokenText = sourceText ? `Page ${sourceText}.` : 'Page break.';

  return [
    {
      documentId: document.documentId,
      renderVersionId: '',
      blockId: block.blockId,
      charStart: 0,
      charEnd: resolveBlockText(block).length,
      segmentKind: 'text',
      sourceText: resolveBlockText(block),
      sourceContextBefore: '',
      sourceContextAfter: '',
      spokenText,
      playbackDirective: 'continue',
      focusBlockId: null,
      resumeToken: null,
      warnings: [],
      narrationModel: null,
    },
  ];
}

function parseMarkdownTable(markdown: string): { headers: string[]; rows: string[][] } | null {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));
  if (lines.length < 2) {
    return null;
  }

  const parsedRows = lines
    .map((line) =>
      line
        .split('|')
        .map((cell) => stripMarkdown(cell))
        .filter((cell) => cell.length > 0),
    )
    .filter((row) => row.length > 0);

  if (parsedRows.length < 2) {
    return null;
  }

  const [headers, ...body] = parsedRows;
  const rows = body.filter(
    (row) => !row.every((cell) => /^:?-{2,}:?$/u.test(cell)) && row.some((cell) => cell.length > 0),
  );

  return {
    headers,
    rows,
  };
}

function buildTableSegments(document: IStudyDocument, block: IDocumentBlock): SegmentDraft[] {
  const table = parseMarkdownTable(block.contentMarkdown);
  const tableText = resolveBlockText(block);
  let spokenText = tableText || 'A table is shown in the document.';

  if (table) {
    const headerText = table.headers.length > 0 ? `Columns: ${table.headers.join(', ')}.` : '';
    if (table.rows.length > 6) {
      spokenText = normalizeWhitespace(
        `${headerText} The table contains ${table.rows.length} rows. Refer to the document for the complete values.`,
      );
    } else {
      const rowText = table.rows
        .slice(0, 4)
        .map((row, index) =>
          table.headers.length > 0
            ? `Row ${index + 1}: ${table.headers
                .map((header, headerIndex) => `${header} ${row[headerIndex] ?? ''}`)
                .join(', ')}.`
            : `Row ${index + 1}: ${row.join(', ')}.`,
        )
        .join(' ');
      spokenText = normalizeWhitespace(`${headerText} ${rowText}`);
    }
  }

  return [
    {
      documentId: document.documentId,
      renderVersionId: '',
      blockId: block.blockId,
      charStart: 0,
      charEnd: tableText.length,
      segmentKind: 'table_summary',
      sourceText: tableText,
      sourceContextBefore: '',
      sourceContextAfter: '',
      spokenText,
      playbackDirective: 'continue',
      focusBlockId: null,
      resumeToken: null,
      warnings: [],
      narrationModel: null,
    },
  ];
}

function getAssetAnnotation(renderVersion: IDocumentRenderVersion, assetId?: string | null): string {
  if (!assetId) {
    return '';
  }

  const assets = [...(renderVersion.documentIrJson.assets ?? []), ...(renderVersion.assetsJson ?? [])];
  const asset = assets.find(
    (candidate): candidate is AssetLike =>
      typeof candidate === 'object' && candidate != null && 'assetId' in candidate && candidate.assetId === assetId,
  );

  return normalizeWhitespace(
    asset?.annotation ?? asset?.imageAnnotation ?? asset?.altText ?? '',
  );
}

function buildFigureSegments(
  document: IStudyDocument,
  renderVersion: IDocumentRenderVersion,
  block: IDocumentBlock,
): SegmentDraft[] {
  const caption = resolveBlockText(block);
  const annotation = getAssetAnnotation(renderVersion, block.assetId);
  const spokenText = normalizeWhitespace(
    [caption, annotation && annotation !== caption ? annotation : '']
      .filter(Boolean)
      .join(' ') || 'A figure is shown in the document.',
  );

  return [
    {
      documentId: document.documentId,
      renderVersionId: '',
      blockId: block.blockId,
      charStart: 0,
      charEnd: caption.length,
      segmentKind: 'figure_summary',
      sourceText: caption,
      sourceContextBefore: '',
      sourceContextAfter: '',
      spokenText,
      playbackDirective: 'continue',
      focusBlockId: null,
      resumeToken: null,
      warnings: [],
      narrationModel: null,
    },
  ];
}

async function buildMathBlockSegments(
  document: IStudyDocument,
  renderVersion: IDocumentRenderVersion,
  blocks: IDocumentBlock[],
  blockIndex: number,
  headingPath: string[],
  narrationModel: string,
  runNarrationModel: NarrationRunner,
): Promise<SegmentDraft[]> {
  const block = blocks[blockIndex];
  const sourceText = block.contentMarkdown || block.plainText;
  const fallbackNarration = verbalizeMathLikeText(sourceText);
  const sourceContextBefore = getContextBefore(blocks, blockIndex);
  const sourceContextAfter = getContextAfter(blocks, blockIndex);

  try {
    const raw = await runNarrationModel(
      buildDisplayMathSpeechMessages({
        documentTitle: document.title,
        headingPath,
        blockId: block.blockId,
        sourceMarkdown: sourceText,
        contextBefore: sourceContextBefore,
        contextAfter: sourceContextAfter,
      }),
    );
    const parsed = extractJsonObject<DisplayMathNarrationEnvelope>(raw);
    if (!parsed) {
      throw new Error('Display math narration returned invalid JSON');
    }

    if (parsed.mode === 'handoff') {
      const handoffText = normalizeWhitespace(
        [parsed.prePauseText ?? '', parsed.handoffText ?? '']
          .filter(Boolean)
          .join(' ') || 'The next equation is best inspected visually in the document.',
      );
      const resumeText = normalizeWhitespace(parsed.resumeText ?? 'Continue when you are ready.');
      const resumeToken = hashValue(`${block.blockId}:${resumeText}:${NARRATION_POLICY_VERSION}`);

      return [
        {
          documentId: document.documentId,
          renderVersionId: '',
          blockId: block.blockId,
          charStart: 0,
          charEnd: resolveBlockText(block).length,
          segmentKind: 'math_block_narration',
          sourceText,
          sourceContextBefore,
          sourceContextAfter,
          spokenText: handoffText,
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken,
          warnings: [],
          narrationModel,
        },
        {
          documentId: document.documentId,
          renderVersionId: '',
          blockId: block.blockId,
          charStart: 0,
          charEnd: resolveBlockText(block).length,
          segmentKind: 'pause_for_visual',
          sourceText,
          sourceContextBefore,
          sourceContextAfter,
          spokenText: '',
          playbackDirective: 'pause_for_visual',
          focusBlockId: parsed.focusBlockId ?? block.blockId,
          resumeToken,
          warnings: [],
          narrationModel,
        },
        {
          documentId: document.documentId,
          renderVersionId: '',
          blockId: block.blockId,
          charStart: 0,
          charEnd: resolveBlockText(block).length,
          segmentKind: 'resume_after_pause',
          sourceText,
          sourceContextBefore,
          sourceContextAfter,
          spokenText: resumeText,
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken,
          warnings: [],
          narrationModel,
        },
      ];
    }

    return [
      {
        documentId: document.documentId,
        renderVersionId: '',
        blockId: block.blockId,
        charStart: 0,
        charEnd: resolveBlockText(block).length,
        segmentKind: 'math_block_narration',
        sourceText,
        sourceContextBefore,
        sourceContextAfter,
        spokenText: normalizeWhitespace(parsed.equationNarration ?? fallbackNarration),
        playbackDirective: 'continue',
        focusBlockId: null,
        resumeToken: null,
        warnings: [],
        narrationModel,
      },
    ];
  } catch {
    const denseEquation = sourceText.length > 180 || mathSymbolDensity(sourceText) >= 0.08;
    if (denseEquation) {
      const resumeToken = hashValue(`${block.blockId}:fallback:${NARRATION_POLICY_VERSION}`);
      return [
        {
          documentId: document.documentId,
          renderVersionId: '',
          blockId: block.blockId,
          charStart: 0,
          charEnd: resolveBlockText(block).length,
          segmentKind: 'math_block_narration',
          sourceText,
          sourceContextBefore,
          sourceContextAfter,
          spokenText: 'The next equation is shown on screen. Please inspect it in the document.',
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken,
          warnings: ['math_block_fallback'],
          narrationModel,
        },
        {
          documentId: document.documentId,
          renderVersionId: '',
          blockId: block.blockId,
          charStart: 0,
          charEnd: resolveBlockText(block).length,
          segmentKind: 'pause_for_visual',
          sourceText,
          sourceContextBefore,
          sourceContextAfter,
          spokenText: '',
          playbackDirective: 'pause_for_visual',
          focusBlockId: block.blockId,
          resumeToken,
          warnings: ['math_block_fallback'],
          narrationModel,
        },
        {
          documentId: document.documentId,
          renderVersionId: '',
          blockId: block.blockId,
          charStart: 0,
          charEnd: resolveBlockText(block).length,
          segmentKind: 'resume_after_pause',
          sourceText,
          sourceContextBefore,
          sourceContextAfter,
          spokenText: 'Continue when you are ready.',
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken,
          warnings: ['math_block_fallback'],
          narrationModel,
        },
      ];
    }

    return [
      {
        documentId: document.documentId,
        renderVersionId: '',
        blockId: block.blockId,
        charStart: 0,
        charEnd: resolveBlockText(block).length,
        segmentKind: 'math_block_narration',
        sourceText,
        sourceContextBefore,
        sourceContextAfter,
        spokenText: fallbackNarration,
        playbackDirective: 'continue',
        focusBlockId: null,
        resumeToken: null,
        warnings: ['math_block_fallback'],
        narrationModel,
      },
    ];
  }
}

function buildCodeSegments(document: IStudyDocument, block: IDocumentBlock): SegmentDraft[] {
  return [
    {
      documentId: document.documentId,
      renderVersionId: '',
      blockId: block.blockId,
      charStart: 0,
      charEnd: resolveBlockText(block).length,
      segmentKind: 'text',
      sourceText: block.contentMarkdown,
      sourceContextBefore: '',
      sourceContextAfter: '',
      spokenText: 'A code example is shown here. Refer to the document for the exact syntax.',
      playbackDirective: 'continue',
      focusBlockId: null,
      resumeToken: null,
      warnings: [],
      narrationModel: null,
    },
  ];
}

async function segmentBlock(
  document: IStudyDocument,
  renderVersion: IDocumentRenderVersion,
  blocks: IDocumentBlock[],
  blockIndex: number,
  headingPaths: Map<string, string[]>,
  narrationModel: string,
  runNarrationModel: NarrationRunner,
): Promise<SegmentDraft[]> {
  const block = blocks[blockIndex];
  const headingPath = headingPaths.get(block.blockId) ?? [];

  if (block.type === 'page_break') {
    return buildPageBreakSegments(document, block);
  }

  if (block.type === 'table') {
    return buildTableSegments(document, block);
  }

  if (block.type === 'figure') {
    return buildFigureSegments(document, renderVersion, block);
  }

  if (block.type === 'math_block') {
    return buildMathBlockSegments(
      document,
      renderVersion,
      blocks,
      blockIndex,
      headingPath,
      narrationModel,
      runNarrationModel,
    );
  }

  if (block.type === 'code') {
    return buildCodeSegments(document, block);
  }

  if (block.type === 'heading') {
    return buildTextSegments(document, block, headingPath, narrationModel, runNarrationModel, 'heading');
  }

  if (block.type === 'caption') {
    return buildTextSegments(document, block, headingPath, narrationModel, runNarrationModel, 'caption');
  }

  return buildTextSegments(document, block, headingPath, narrationModel, runNarrationModel, 'text');
}

export async function buildDocumentSpeechPlan(
  input: BuildPlanInput,
): Promise<BuiltSpeechPlan> {
  const blocks = input.renderVersion.documentIrJson.blocks.filter(isSpeakableBlock);
  const headingPaths = computeHeadingPaths(blocks);
  const sourceBlocksJson = blocks.map((block) => ({
    blockId: block.blockId,
    blockType: block.type,
    blockFingerprint: blockFingerprint(block),
  }));
  const speechSurfaceFingerprint = hashValue(
    JSON.stringify({
      version: NARRATION_POLICY_VERSION,
      renderVersionId: input.renderVersion.renderVersionId,
      blocks: sourceBlocksJson,
    }),
  );

  const segmentGroups = await Promise.all(
    blocks.map((block, blockIndex) =>
      segmentBlock(
        input.document,
        input.renderVersion,
        blocks,
        blockIndex,
        headingPaths,
        input.narrationModel,
        input.runNarrationModel,
      ),
    ),
  );

  const flattenedDrafts = segmentGroups
    .flat()
    .map((draft) => ({
      ...draft,
      renderVersionId: input.renderVersion.renderVersionId,
    }))
    .filter((draft) => draft.playbackDirective === 'pause_for_visual' || draft.spokenText.length > 0);

  const { planId, segments } = finalizeSegments(
    input.document.documentId,
    input.renderVersion.renderVersionId,
    speechSurfaceFingerprint,
    flattenedDrafts,
  );

  return {
    planId,
    documentId: input.document.documentId,
    renderVersionId: input.renderVersion.renderVersionId,
    speechSurfaceFingerprint,
    narrationPolicyVersion: NARRATION_POLICY_VERSION,
    sourceBlocksJson,
    segments,
  };
}
