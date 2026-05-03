import path from 'node:path';
import crypto from 'node:crypto';
import type {
  DocumentIngestionStrategy,
  DocumentSourceKind,
  IDocumentBlock,
  IDocumentIR,
  IDocumentOutlineItem,
} from '@librechat/data-schemas';

type NormalizeInput = {
  documentId: string;
  projectId?: string | null;
  sourceFileId: string;
  sourceMimeType: string;
  sourceFilename?: string | null;
  sourcePath?: string | null;
  title: string;
  text: string;
  ocrPages?: OCRPageAssetPage[];
  renderVersion: number;
};

type NormalizeOutput = {
  ir: IDocumentIR;
  sourceKind: DocumentSourceKind;
  ingestionStrategy: DocumentIngestionStrategy;
};

type OCRPageAssetImage = {
  id: string;
  topLeftX: number;
  topLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
  imageBase64: string;
  imageAnnotation?: string | null;
  reusable?: boolean | null;
};

type OCRPageAssetPage = {
  index: number;
  dimensions: {
    dpi: number;
    height: number;
    width: number;
  };
  images: OCRPageAssetImage[];
};

type DocumentAsset = {
  assetId: string;
  assetType: 'image';
  source: 'ocr_page_image';
  ocrImageId: string;
  pageNumber: number;
  imageIndex: number;
  mimeType: string;
  annotation?: string | null;
  reusable?: boolean;
  bounds: {
    topLeftX: number;
    topLeftY: number;
    bottomRightX: number;
    bottomRightY: number;
    width: number;
    height: number;
  };
};

const codeFencePattern = /^```/;
const headingPattern = /^(#{1,6})\s+(.+)$/;
const listPattern = /^\s*(?:[-*+]|\d+\.)\s+/;
const blockquotePattern = /^\s*>\s?/;
const pageHeadingPattern = /^#\s*PAGE\s+(\d+)\s*$/i;
const tableSeparatorPattern = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;
const structuralHeadingPattern =
  /^(?:Definitions?|Theorems?|Remarks?|Lemmas?|Propositions?|Corollaries?|Examples?|Problems?|Solutions?)\s+\d+(?:\.\d+)*/;
const standaloneStructuralLabelPattern =
  /^(?:Definitions?|Theorems?|Remarks?|Lemmas?|Propositions?|Corollaries?|Examples?|Problems?|Solutions?)$/;
const numberedSectionPattern = /^\d+(?:\.\d+)+\s+\S/;
const numberedStatementPattern = /^(\d+(?:\.\d+)*)\s+([\s\S]+)$/u;
const denseTextStructuralPattern =
  /\b(?:Definitions?|Theorems?|Remarks?|Lemmas?|Propositions?|Corollaries?|Examples?|Problems?|Solutions?)\s+\d+(?:\.\d+)*\b|\b\d+(?:\.\d+)+\s+[A-Z]/;
const controlCharacterPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const compactSectionHeadingMaxLength = 140;
const figureCaptionPattern =
  /^(?:\([a-z]\)\s*\n\s*)*(?:Figure|Fig\.)\s+\d+[A-Za-z]?(?::|\.)\s+/i;
const tableCaptionPattern = /^Table\s+\d+[A-Za-z]?(?::|\.)\s+/i;
const subfigureCaptionPattern = /^\([a-z]\)\s+\S/i;
const imagePlaceholderPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
const htmlEntityPattern = /&(nbsp|lt|gt|amp|quot|#39|#x27);/gi;
const mathCommandPattern =
  /\\(?:forall|exists|sum|prod|frac|hat|tilde|bar|vec|overline|underline|sqrt|text|mathrm|mathbb|mathbf|mathcal|operatorname|left|right|cdot|times|leq|geq|neq|approx|sim|to|mapsto|rightarrow|leftarrow|in|notin|subset|subseteq|supset|cup|cap|mid|int|iint|oint|partial|nabla|alpha|beta|gamma|delta|epsilon|varepsilon|theta|lambda|mu|nu|pi|rho|sigma|tau|phi|varphi|psi|omega)\b/;
const mathStructurePattern = /[_^{}=<>]|\\[()[\]{}]|\\(?:sum|prod|frac|hat|text|forall|exists|rightarrow|leftarrow|in|subset|cup|cap|int|partial|leq|geq|neq)\b/;
const equationNumberPattern = /^\(?\d+\)?$/;
const alignmentEnvironmentPattern =
  /\\begin\{(?:aligned|align|array|matrix|pmatrix|bmatrix|cases|split|eqnarray)\}/;
const htmlEntities: Record<string, string> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  '#39': "'",
  '#x27': "'",
};

type DocumentSourceParams = {
  sourceMimeType: string;
  sourceFilename?: string | null;
  sourcePath?: string | null;
};

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
}

function decodeHtmlEntities(value: string): string {
  return value.replace(htmlEntityPattern, (match, entity: string) => {
    const decoded = htmlEntities[entity.toLowerCase()];
    return decoded ?? match;
  });
}

function escapeLooseAmpersands(value: string): string {
  if (alignmentEnvironmentPattern.test(value)) {
    return value;
  }

  return value.replace(/(^|[^\\])&(?=[^&])/g, '$1\\\\&');
}

function inferMimeTypeFromFilename(sourceFilename?: string | null): string | null {
  const extension = path.extname(sourceFilename ?? '').toLowerCase();
  if (extension === '.pdf') {
    return 'application/pdf';
  }
  if (extension === '.md' || extension === '.markdown') {
    return 'text/markdown';
  }
  if (extension === '.txt') {
    return 'text/plain';
  }
  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (extension === '.epub') {
    return 'application/epub+zip';
  }
  return null;
}

export function resolveSourceMimeType(params: DocumentSourceParams): string {
  if (
    params.sourceMimeType !== 'text/plain' &&
    params.sourceMimeType !== 'application/octet-stream'
  ) {
    return params.sourceMimeType;
  }

  return inferMimeTypeFromFilename(params.sourceFilename) ?? params.sourceMimeType;
}

export function detectSourceKind(params: DocumentSourceParams): DocumentSourceKind {
  const mimeType = resolveSourceMimeType(params);
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (mimeType === 'text/markdown') {
    return 'markdown';
  }
  if (mimeType === 'text/plain') {
    return 'text';
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (mimeType === 'application/epub+zip') {
    return 'epub';
  }
  return 'other';
}

export function detectIngestionStrategy(
  params: DocumentSourceParams & {
    text: string;
  },
): DocumentIngestionStrategy {
  const mimeType = resolveSourceMimeType(params);
  const normalizedText = normalizeLineEndings(params.text).trim();

  if (params.sourcePath === 'document_parser') {
    return 'document_parser';
  }
  if (/ocr/i.test(params.sourcePath ?? '') || pageHeadingPattern.test(normalizedText)) {
    return 'ocr_markdown';
  }
  if (mimeType === 'text/markdown') {
    return 'markdown_direct';
  }
  if (mimeType === 'text/plain') {
    return 'text_direct';
  }
  if (/^#{1,6}\s+/m.test(normalizedText) || /```|^\s*(?:[-*+]|\d+\.)\s+/m.test(normalizedText)) {
    return 'document_parser';
  }
  return 'plain_text';
}

function cleanupDenseText(value: string): string {
  return normalizeLineEndings(value)
    .replace(controlCharacterPattern, ' ')
    .replace(/([A-Za-z])-\s+([a-z])/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function shouldHeuristicallySegmentText(text: string, mimeType: string): boolean {
  if (mimeType === 'text/markdown') {
    return false;
  }

  if (/^#{1,6}\s+/m.test(text) || /```|^\s*(?:[-*+]|\d+\.)\s+/m.test(text)) {
    return false;
  }

  const nonEmptyLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (nonEmptyLines.length === 0) {
    return false;
  }

  const averageLineLength =
    nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / nonEmptyLines.length;

  return (
    averageLineLength >= 180 ||
    (nonEmptyLines.length <= 3 && text.length >= 800 && denseTextStructuralPattern.test(text))
  );
}

function splitLabeledChunk(chunk: string): string[] {
  const labeledMatch = chunk.match(
    /^(Definitions?|Theorems?|Remarks?|Lemmas?|Propositions?|Corollaries?|Examples?|Problems?|Solutions?)\s+(\d+(?:\.\d+)*)(?:\s+\(([^)]+)\))?\s+([\s\S]+)$/u,
  );
  if (!labeledMatch) {
    return [chunk];
  }

  const [, kind, number, title, body] = labeledMatch;
  if (!startsLikeStructuredBody(body)) {
    return [chunk];
  }

  const heading = [`${toSingularStructuralLabel(kind)} ${number}`, title?.trim()]
    .filter(Boolean)
    .join(' ');

  return [`### ${heading}`, body.trim()];
}

function toSingularStructuralLabel(value: string): string {
  switch (value.trim().toLowerCase()) {
    case 'definitions':
      return 'Definition';
    case 'theorems':
      return 'Theorem';
    case 'remarks':
      return 'Remark';
    case 'lemmas':
      return 'Lemma';
    case 'propositions':
      return 'Proposition';
    case 'corollaries':
      return 'Corollary';
    case 'examples':
      return 'Example';
    case 'problems':
      return 'Problem';
    case 'solutions':
      return 'Solution';
    default:
      return value.trim();
  }
}

function startsLikeStructuredBody(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return /^[A-Z[(“"'`]/u.test(trimmed);
}

function splitNumberedChunkWithLabel(chunk: string, label: string): string[] | null {
  const numberedMatch = chunk.match(numberedStatementPattern);
  if (!numberedMatch) {
    return null;
  }

  const [, number, body] = numberedMatch;
  const trimmedBody = body.trim();
  if (!startsLikeStructuredBody(trimmedBody)) {
    return null;
  }

  return [`### ${toSingularStructuralLabel(label)} ${number}`, trimmedBody];
}

function toCompactSectionHeading(chunk: string): string | null {
  if (!numberedSectionPattern.test(chunk)) {
    return null;
  }

  const trimmedChunk = chunk.trim();
  const numberedMatch = trimmedChunk.match(numberedStatementPattern);
  if (!numberedMatch || !startsLikeStructuredBody(numberedMatch[2])) {
    return null;
  }

  if (trimmedChunk.length > compactSectionHeadingMaxLength) {
    return null;
  }

  return `## ${trimmedChunk}`;
}

function toSegmentedMarkdownPage(pageText: string, pageNumber: number): string {
  const cleaned = cleanupDenseText(pageText)
    .replace(/\s+(?=(?:\d+(?:\.\d+)+)\s+[A-Z])/g, '\n\n')
    .replace(
      /\s+(?=(?:Definitions?|Theorems?|Remarks?|Lemmas?|Propositions?|Corollaries?|Examples?|Problems?|Solutions?)\s+\d+(?:\.\d+)*)/g,
      '\n\n',
    );

  const rawChunks = cleaned
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (let index = 0; index < rawChunks.length; index += 1) {
    const chunk = rawChunks[index];

    if (standaloneStructuralLabelPattern.test(chunk)) {
      const labeledChunk = splitNumberedChunkWithLabel(rawChunks[index + 1] ?? '', chunk);
      if (labeledChunk) {
        chunks.push(...labeledChunk);
        index += 1;
        continue;
      }
    }

    if (structuralHeadingPattern.test(chunk)) {
      chunks.push(...splitLabeledChunk(chunk));
      continue;
    }

    const compactSectionHeading = toCompactSectionHeading(chunk);
    if (compactSectionHeading) {
      chunks.push(compactSectionHeading);
      continue;
    }

    chunks.push(chunk);
  }

  return [`# PAGE ${pageNumber}`, ...chunks].join('\n\n');
}

function prepareTextForNormalization(text: string, params: DocumentSourceParams): string {
  const normalizedText = normalizeLineEndings(text).trim();
  const resolvedMimeType = resolveSourceMimeType(params);

  if (!shouldHeuristicallySegmentText(normalizedText, resolvedMimeType)) {
    return normalizedText;
  }

  const pageSegments = normalizedText
    .split('\n')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (pageSegments.length === 0) {
    return normalizedText;
  }

  return pageSegments
    .map((segment, index) => toSegmentedMarkdownPage(segment, index + 1))
    .join('\n\n');
}

function createBlockId(type: IDocumentBlock['type'], index: number, content: string): string {
  const hash = crypto.createHash('sha1').update(`${type}:${content}`).digest('hex').slice(0, 12);
  return `block-${String(index + 1).padStart(4, '0')}-${hash}`;
}

function simplifyInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\\([\\()[\]{}])/g, '$1')
    .trim();
}

function toPlainText(type: IDocumentBlock['type'], content: string): string {
  if (type === 'code') {
    return content
      .split('\n')
      .filter((line) => !codeFencePattern.test(line.trim()))
      .join('\n')
      .trim();
  }

  if (type === 'math_block') {
    return content
      .replace(/^\$\$|\$\$$/g, '')
      .replace(/^\\\[|\\\]$/g, '')
      .trim();
  }

  return simplifyInlineMarkdown(
    content
      .replace(/^(#{1,6})\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
      .replace(/^\s*\|/gm, '')
      .replace(/\|\s*$/gm, '')
      .replace(/\|/g, ' ')
      .replace(/\n{3,}/g, '\n\n'),
  );
}

function pushBlock(
  blocks: IDocumentBlock[],
  params: {
    type: IDocumentBlock['type'];
    contentMarkdown: string;
    assetId?: string | null;
    sourcePageStart?: number | null;
    sourcePageEnd?: number | null;
    level?: number | null;
    title?: string | null;
  },
) {
  const sanitizedContent =
    params.type === 'math_block'
      ? escapeLooseAmpersands(decodeHtmlEntities(params.contentMarkdown.trim()))
      : decodeHtmlEntities(params.contentMarkdown.trim());
  const contentMarkdown = sanitizedContent;
  if (!contentMarkdown) {
    return;
  }

  const index = blocks.length;
  const blockId = createBlockId(params.type, index, contentMarkdown);
  blocks.push({
    blockId,
    type: params.type,
    assetId: params.assetId ?? null,
    level: params.level ?? null,
    title: params.title ?? null,
    sourcePageStart: params.sourcePageStart ?? null,
    sourcePageEnd: params.sourcePageEnd ?? params.sourcePageStart ?? null,
    contentMarkdown,
    contentHtml: null,
    plainText: toPlainText(params.type, contentMarkdown),
    anchorPath: `block:${blockId}`,
  });
}

function samePage(left?: IDocumentBlock | null, right?: IDocumentBlock | null): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    (left.sourcePageStart ?? left.sourcePageEnd ?? null) ===
    (right.sourcePageStart ?? right.sourcePageEnd ?? null)
  );
}

function isFigureCaptionBlock(block: IDocumentBlock): boolean {
  return block.type === 'paragraph' && figureCaptionPattern.test(block.plainText.trim());
}

function isTableCaptionBlock(block: IDocumentBlock): boolean {
  return block.type === 'paragraph' && tableCaptionPattern.test(block.plainText.trim());
}

function isFigureCaptionText(value: string): boolean {
  const trimmed = value.trim();
  return figureCaptionPattern.test(trimmed) || subfigureCaptionPattern.test(trimmed);
}

function extractImagePlaceholderTargets(value: string): string[] {
  const matches = value.matchAll(imagePlaceholderPattern);
  return Array.from(matches, (match) => match[2]?.trim()).filter(Boolean);
}

function stripImagePlaceholders(value: string): string {
  return value.replace(imagePlaceholderPattern, '').replace(/\n{3,}/g, '\n\n').trim();
}

function withUpdatedContent(
  block: IDocumentBlock,
  type: IDocumentBlock['type'],
  contentMarkdown: string,
  assetId?: string | null,
): IDocumentBlock {
  const nextContent =
    type === 'math_block'
      ? escapeLooseAmpersands(decodeHtmlEntities(contentMarkdown))
      : decodeHtmlEntities(contentMarkdown);
  return {
    ...block,
    type,
    assetId: assetId ?? null,
    contentMarkdown: nextContent,
    plainText: toPlainText(type, nextContent),
  };
}

function mergeTableCaptions(blocks: IDocumentBlock[]): IDocumentBlock[] {
  const merged: IDocumentBlock[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (!isTableCaptionBlock(block)) {
      merged.push(block);
      continue;
    }

    const next = blocks[index + 1];
    const previous = merged[merged.length - 1];

    if (next?.type === 'table' && samePage(block, next)) {
      blocks[index + 1] = withUpdatedContent(
        next,
        'table',
        `${block.contentMarkdown}\n\n${next.contentMarkdown}`,
      );
      continue;
    }

    if (previous?.type === 'table' && samePage(block, previous)) {
      merged[merged.length - 1] = withUpdatedContent(
        previous,
        'table',
        `${previous.contentMarkdown}\n\n${block.contentMarkdown}`,
      );
      continue;
    }

    merged.push(block);
  }

  return merged;
}

function inferImageMimeType(imageId?: string | null): string {
  const normalized = (imageId ?? '').trim().toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (normalized.endsWith('.webp')) {
    return 'image/webp';
  }
  if (normalized.endsWith('.gif')) {
    return 'image/gif';
  }

  return 'image/png';
}

function mergeTrailingFigureCaptions(blocks: IDocumentBlock[]): IDocumentBlock[] {
  const merged: IDocumentBlock[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const previous = merged[merged.length - 1];

    if (isFigureCaptionBlock(block) && previous?.type === 'figure' && samePage(previous, block)) {
      const previousContent = previous.contentMarkdown.trim();
      const nextContent = previousContent
        ? `${previousContent}\n\n${block.contentMarkdown}`
        : block.contentMarkdown;

      merged[merged.length - 1] = withUpdatedContent(
        previous,
        'figure',
        nextContent,
        previous.assetId,
      );
      continue;
    }

    merged.push(block);
  }

  return merged;
}

function buildFigureAssets(ocrPages?: OCRPageAssetPage[]): DocumentAsset[] {
  if (!ocrPages?.length) {
    return [];
  }

  return ocrPages.flatMap((page) =>
    (page.images || [])
      .filter((image) => Boolean(image.imageBase64))
      .sort((left, right) =>
        Boolean(left.reusable) === Boolean(right.reusable)
          ? left.topLeftY === right.topLeftY
            ? left.topLeftX - right.topLeftX
            : left.topLeftY - right.topLeftY
          : Number(Boolean(left.reusable)) - Number(Boolean(right.reusable)),
      )
      .map((image, imageIndex) => ({
        assetId: `ocr-figure-${page.index + 1}-${imageIndex + 1}-${image.id || 'image'}`,
        assetType: 'image' as const,
        source: 'ocr_page_image' as const,
        ocrImageId: image.id,
        pageNumber: page.index + 1,
        imageIndex: imageIndex + 1,
        mimeType: inferImageMimeType(image.id),
        annotation: image.imageAnnotation ?? null,
        reusable: Boolean(image.reusable),
        bounds: {
          topLeftX: image.topLeftX,
          topLeftY: image.topLeftY,
          bottomRightX: image.bottomRightX,
          bottomRightY: image.bottomRightY,
          width: Math.max(0, image.bottomRightX - image.topLeftX),
          height: Math.max(0, image.bottomRightY - image.topLeftY),
        },
      })),
  );
}

function italicizeCaption(caption: string): string {
  const trimmed = caption.trim();
  return trimmed ? `*${trimmed}*` : '';
}

function buildFallbackFigureCaption(asset: DocumentAsset): string {
  return asset.annotation?.trim() || `Figure from page ${asset.pageNumber}`;
}

function takePageAsset(pageAssets: DocumentAsset[]): DocumentAsset | null {
  const disposableIndex = pageAssets.findIndex((asset) => !asset.reusable);
  if (disposableIndex >= 0) {
    const [asset] = pageAssets.splice(disposableIndex, 1);
    return asset ?? null;
  }

  return pageAssets.find((asset) => asset.reusable) ?? null;
}

function takePageAssetByPlaceholderId(
  pageAssets: DocumentAsset[],
  placeholderId: string,
): DocumentAsset | null {
  const assetIndex = pageAssets.findIndex((asset) => asset.ocrImageId === placeholderId);
  if (assetIndex < 0) {
    return null;
  }

  const [asset] = pageAssets.splice(assetIndex, 1);
  return asset ?? null;
}

function looksLikeStandaloneMathLine(value: string): boolean {
  const trimmed = decodeHtmlEntities(value.trim());
  if (!trimmed || equationNumberPattern.test(trimmed)) {
    return true;
  }

  const proseWordCount = (trimmed.match(/(?<!\\)\b[A-Za-z]{4,}\b/g) ?? []).length;
  return mathStructurePattern.test(trimmed) && mathCommandPattern.test(trimmed) && proseWordCount <= 6;
}

function isStandaloneMathParagraph(lines: string[]): boolean {
  const nonEmptyLines = lines
    .map((line) => line.trim())
    .filter(Boolean);

  if (nonEmptyLines.length === 0) {
    return false;
  }

  if (nonEmptyLines.some((line) => /(^|[^\\])\$/u.test(line))) {
    return false;
  }

  let signalCount = 0;
  for (const line of nonEmptyLines) {
    if (!looksLikeStandaloneMathLine(line)) {
      return false;
    }
    if (!equationNumberPattern.test(decodeHtmlEntities(line.trim()))) {
      signalCount += 1;
    }
  }

  return signalCount > 0;
}

function toMathBlockMarkdown(lines: string[]): string {
  const body = decodeHtmlEntities(lines.join('\n').trim());
  if (!body) {
    return '';
  }

  if (body.startsWith('$$') || body.startsWith('\\[')) {
    return body;
  }

  return `$$\n${body}\n$$`;
}

function attachFigureAssets(
  blocks: IDocumentBlock[],
  assets: DocumentAsset[],
): { blocks: IDocumentBlock[]; assets: DocumentAsset[] } {
  if (assets.length === 0) {
    return { blocks, assets };
  }

  const assetsByPage = new Map<number, DocumentAsset[]>();
  assets.forEach((asset) => {
    const pageAssets = assetsByPage.get(asset.pageNumber) ?? [];
    pageAssets.push(asset);
    assetsByPage.set(asset.pageNumber, pageAssets);
  });

  const result: IDocumentBlock[] = [];
  let currentPage: number | null = null;

  const flushRemainingAssets = (pageNumber: number | null) => {
    if (pageNumber == null) {
      return;
    }

    const remaining = assetsByPage.get(pageNumber) ?? [];
    while (remaining.length > 0) {
      const asset = remaining.find((candidate) => !candidate.reusable);
      if (!asset) {
        break;
      }
      remaining.splice(remaining.indexOf(asset), 1);

      pushBlock(result, {
        type: 'figure',
        assetId: asset.assetId,
        contentMarkdown: italicizeCaption(buildFallbackFigureCaption(asset)),
        sourcePageStart: pageNumber,
        sourcePageEnd: pageNumber,
      });
    }
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const blockPage: number | null = block.sourcePageStart ?? block.sourcePageEnd ?? currentPage;
    if (currentPage != null && blockPage != null && blockPage !== currentPage) {
      flushRemainingAssets(currentPage);
    }
    currentPage = blockPage ?? currentPage;

    const placeholderTargets =
      blockPage != null ? extractImagePlaceholderTargets(block.contentMarkdown) : [];
    if (blockPage != null && placeholderTargets.length > 0) {
      const pageAssets = assetsByPage.get(blockPage) ?? [];

      if (placeholderTargets.length === 1) {
        const asset = takePageAssetByPlaceholderId(pageAssets, placeholderTargets[0]);
        if (asset) {
          let captionMarkdown = stripImagePlaceholders(block.contentMarkdown);
          const nextBlock = blocks[index + 1];

          if (
            !captionMarkdown &&
            nextBlock?.type === 'paragraph' &&
            samePage(block, nextBlock) &&
            extractImagePlaceholderTargets(nextBlock.contentMarkdown).length === 0 &&
            isFigureCaptionText(nextBlock.plainText)
          ) {
            captionMarkdown = nextBlock.contentMarkdown;
            index += 1;
          }

          result.push(
            withUpdatedContent(
              block,
              'figure',
              captionMarkdown || italicizeCaption(buildFallbackFigureCaption(asset)),
              asset.assetId,
            ),
          );
          continue;
        }
      }

      placeholderTargets.forEach((placeholderId) => {
        takePageAssetByPlaceholderId(pageAssets, placeholderId);
      });
    }

    if (isFigureCaptionBlock(block) && blockPage != null) {
      const pageAssets = assetsByPage.get(blockPage) ?? [];
      const asset = takePageAsset(pageAssets);
      if (asset) {
        result.push(
          withUpdatedContent(block, 'figure', italicizeCaption(block.contentMarkdown), asset.assetId),
        );
        continue;
      }
    }

    if (isTableCaptionBlock(block) && blockPage != null) {
      const pageAssets = assetsByPage.get(blockPage) ?? [];
      const asset = takePageAsset(pageAssets);
      if (asset) {
        result.push(withUpdatedContent(block, 'figure', block.contentMarkdown, asset.assetId));
        continue;
      }
    }

    result.push(block);
  }

  flushRemainingAssets(currentPage);

  return {
    blocks: mergeTrailingFigureCaptions(result),
    assets,
  };
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index]?.trim() ?? '';
  const next = lines[index + 1]?.trim() ?? '';
  return current.includes('|') && tableSeparatorPattern.test(next);
}

function normalizeBlocks(text: string): IDocumentBlock[] {
  const lines = normalizeLineEndings(text).split('\n');
  const blocks: IDocumentBlock[] = [];
  let index = 0;
  let currentPage: number | null = null;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const pageMatch = trimmed.match(pageHeadingPattern);
    if (pageMatch) {
      currentPage = Number(pageMatch[1]);
      pushBlock(blocks, {
        type: 'page_break',
        contentMarkdown: `# PAGE ${currentPage}`,
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
      });
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(headingPattern);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      pushBlock(blocks, {
        type: 'heading',
        contentMarkdown: trimmed,
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
        level,
        title,
      });
      index += 1;
      continue;
    }

    if (codeFencePattern.test(trimmed)) {
      const collected: string[] = [rawLine];
      index += 1;
      while (index < lines.length) {
        collected.push(lines[index] ?? '');
        if (codeFencePattern.test((lines[index] ?? '').trim())) {
          index += 1;
          break;
        }
        index += 1;
      }

      pushBlock(blocks, {
        type: 'code',
        contentMarkdown: collected.join('\n'),
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
      });
      continue;
    }

    if (trimmed === '$$' || trimmed === '\\[') {
      const closing = trimmed === '$$' ? '$$' : '\\]';
      const collected: string[] = [rawLine];
      index += 1;
      while (index < lines.length) {
        collected.push(lines[index] ?? '');
        if ((lines[index] ?? '').trim() === closing) {
          index += 1;
          break;
        }
        index += 1;
      }

      pushBlock(blocks, {
        type: 'math_block',
        contentMarkdown: collected.join('\n'),
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
      });
      continue;
    }

    if (isTableStart(lines, index)) {
      const collected: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trim().includes('|')) {
        collected.push(lines[index] ?? '');
        index += 1;
      }

      pushBlock(blocks, {
        type: 'table',
        contentMarkdown: collected.join('\n'),
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
      });
      continue;
    }

    if (blockquotePattern.test(trimmed)) {
      const collected: string[] = [];
      while (index < lines.length && blockquotePattern.test((lines[index] ?? '').trim())) {
        collected.push(lines[index] ?? '');
        index += 1;
      }

      pushBlock(blocks, {
        type: 'blockquote',
        contentMarkdown: collected.join('\n'),
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
      });
      continue;
    }

    if (listPattern.test(trimmed)) {
      const collected: string[] = [];
      while (index < lines.length) {
        const next = lines[index] ?? '';
        if (!next.trim()) {
          break;
        }
        if (!listPattern.test(next.trim()) && !/^\s{2,}\S/.test(next)) {
          break;
        }
        collected.push(next);
        index += 1;
      }

      pushBlock(blocks, {
        type: 'list',
        contentMarkdown: collected.join('\n'),
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
      });
      continue;
    }

    const collected: string[] = [];
    while (index < lines.length) {
      const next = lines[index] ?? '';
      const nextTrimmed = next.trim();
      if (
        !nextTrimmed ||
        pageHeadingPattern.test(nextTrimmed) ||
        headingPattern.test(nextTrimmed) ||
        codeFencePattern.test(nextTrimmed) ||
        nextTrimmed === '$$' ||
        nextTrimmed === '\\[' ||
        blockquotePattern.test(nextTrimmed) ||
        listPattern.test(nextTrimmed) ||
        isTableStart(lines, index)
      ) {
        break;
      }
      collected.push(next);
      index += 1;
    }

    if (isStandaloneMathParagraph(collected)) {
      pushBlock(blocks, {
        type: 'math_block',
        contentMarkdown: toMathBlockMarkdown(collected),
        sourcePageStart: currentPage,
        sourcePageEnd: currentPage,
      });
      continue;
    }

    pushBlock(blocks, {
      type: 'paragraph',
      contentMarkdown: collected.join('\n'),
      sourcePageStart: currentPage,
      sourcePageEnd: currentPage,
    });
  }

  return blocks;
}

function buildOutline(blocks: IDocumentBlock[]): IDocumentOutlineItem[] {
  return blocks
    .filter((block) => block.type === 'heading' && block.title && block.level)
    .map((block) => ({
      id: block.blockId,
      blockId: block.blockId,
      depth: block.level ?? 1,
      title: block.title ?? '',
      anchorPath: block.anchorPath,
    }));
}

function buildAnchorIndex(blocks: IDocumentBlock[]) {
  return blocks.reduce<Record<string, { blockId: string; type: IDocumentBlock['type'] }>>(
    (acc, block) => {
      acc[block.blockId] = {
        blockId: block.blockId,
        type: block.type,
      };
      return acc;
    },
    {},
  );
}

export function normalizeDocumentText(input: NormalizeInput): NormalizeOutput {
  const sourceMimeType = resolveSourceMimeType({
    sourceMimeType: input.sourceMimeType,
    sourceFilename: input.sourceFilename,
    sourcePath: input.sourcePath,
  });
  const normalizedText = prepareTextForNormalization(input.text, {
    sourceMimeType,
    sourceFilename: input.sourceFilename,
    sourcePath: input.sourcePath,
  });
  const initialBlocks = normalizeBlocks(normalizedText);
  const tableCaptionMergedBlocks = mergeTableCaptions(initialBlocks);
  const figureAssets = buildFigureAssets(input.ocrPages);
  const { blocks, assets } = attachFigureAssets(tableCaptionMergedBlocks, figureAssets);
  const outline = buildOutline(blocks);
  const sourceKind = detectSourceKind({
    sourceMimeType,
    sourceFilename: input.sourceFilename,
    sourcePath: input.sourcePath,
  });
  const ingestionStrategy = detectIngestionStrategy({
    sourceMimeType,
    sourceFilename: input.sourceFilename,
    sourcePath: input.sourcePath,
    text: input.text,
  });

  const ir: IDocumentIR = {
    documentId: input.documentId,
    projectId: input.projectId ?? null,
    sourceFileId: input.sourceFileId,
    sourceType: sourceMimeType,
    title: input.title,
    blocks,
    outline,
    citations: [],
    assets,
    mathSpans: [],
    anchorIndex: buildAnchorIndex(blocks),
    renderVersion: input.renderVersion,
  };

  return {
    ir,
    sourceKind,
    ingestionStrategy,
  };
}
