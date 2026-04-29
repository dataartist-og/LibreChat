import crypto from 'node:crypto';
import OpenAI from 'openai';
import type {
  AllMethods,
  AppConfig,
  DocumentIngestionStrategy,
  IDocumentAnchor,
  IDocumentBlock,
  IDocumentClarification,
  IDocumentIR,
  IDocumentOverlay,
  IDocumentRenderVersion,
  IDocumentVisualization,
  IMongoFile,
  IStudyDocument,
  VisualizationArtifactType,
} from '@librechat/data-schemas';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getConfiguredOpenAIBaseURL } from '~/files/native';
import { recordLearnerObservation } from '~/learners';
import { persistVisualizationPayload, loadVisualizationPayload } from '~/visualizations/storage';
import { sanitizeVisualizationByType } from '~/visualizations/sanitize';
import { detectSourceKind, normalizeDocumentText, resolveSourceMimeType } from './normalize';
import { buildDocumentClarificationMessages, buildDocumentVisualizationMessages } from './prompt';

type DocumentModelContext = {
  appConfig?: AppConfig;
};

type BlockContext = {
  type: string;
  text: string;
};

type CreateStudyDocumentPayload = {
  sourceFileId: string;
  projectId?: string | null;
  title?: string | null;
};

type UpdateStudyDocumentSharingPayload = {
  documentId: string;
  sharingVisibility: IStudyDocument['sharingVisibility'];
};

type CreateDocumentClarificationPayload = {
  documentId: string;
  renderVersionId: string;
  anchor: IDocumentAnchor;
  clarificationQuestion: string;
};

type IntegrateDocumentClarificationPayload = {
  clarificationId: string;
  displayMode?: 'integrated' | 'nested';
};

type CreateDocumentVisualizationPayload = {
  documentId: string;
  renderVersionId: string;
  anchor: IDocumentAnchor;
  prompt: string;
  artifactType: VisualizationArtifactType;
};

type IntegrateDocumentVisualizationPayload = {
  visualizationId: string;
  displayMode?: 'integrated' | 'nested';
};

type DocumentWorkspace = {
  document: IStudyDocument;
  renderVersion: IDocumentRenderVersion;
  overlay: IDocumentOverlay | null;
  clarifications: IDocumentClarification[];
  visualizations: IDocumentVisualization[];
};

const DEFAULT_DIRECT_MODEL = 'gpt-4o-mini';
const DEFAULT_PROXY_MODELS = ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-5.4', 'gpt-5', 'gpt-4o-mini'];

type OCRPageInput = NonNullable<NonNullable<IMongoFile['metadata']>['ocr']>['pages'][number];

type HydratableDocumentAsset = {
  assetId: string;
  source: string;
  pageNumber: number;
  imageIndex: number;
  ocrImageId?: string | null;
  mimeType?: string;
  [key: string]: unknown;
};

export interface DocumentServiceDeps {
  findFileById: AllMethods['findFileById'];
  getFiles: AllMethods['getFiles'];
  createStudyDocument: AllMethods['createStudyDocument'];
  listStudyDocuments: AllMethods['listStudyDocuments'];
  listExploreStudyDocuments: AllMethods['listExploreStudyDocuments'];
  getStudyDocument: AllMethods['getStudyDocument'];
  getOwnedStudyDocument: AllMethods['getOwnedStudyDocument'];
  getSharedStudyDocument: AllMethods['getSharedStudyDocument'];
  getStudyDocumentBySourceFile: AllMethods['getStudyDocumentBySourceFile'];
  addStudyDocumentToLibrary: AllMethods['addStudyDocumentToLibrary'];
  updateStudyDocument: AllMethods['updateStudyDocument'];
  createDocumentRenderVersion: AllMethods['createDocumentRenderVersion'];
  listDocumentRenderVersions: AllMethods['listDocumentRenderVersions'];
  getDocumentRenderVersion: AllMethods['getDocumentRenderVersion'];
  getActiveDocumentRenderVersion: AllMethods['getActiveDocumentRenderVersion'];
  setActiveDocumentRenderVersion: AllMethods['setActiveDocumentRenderVersion'];
  createDocumentOverlay: AllMethods['createDocumentOverlay'];
  listDocumentOverlays: AllMethods['listDocumentOverlays'];
  getActiveDocumentOverlay: AllMethods['getActiveDocumentOverlay'];
  setActiveDocumentOverlay: AllMethods['setActiveDocumentOverlay'];
  createDocumentClarification: AllMethods['createDocumentClarification'];
  listDocumentClarifications: AllMethods['listDocumentClarifications'];
  getDocumentClarification: AllMethods['getDocumentClarification'];
  updateDocumentClarification: AllMethods['updateDocumentClarification'];
  createDocumentVisualization: AllMethods['createDocumentVisualization'];
  listDocumentVisualizations: AllMethods['listDocumentVisualizations'];
  getDocumentVisualization: AllMethods['getDocumentVisualization'];
  updateDocumentVisualization: AllMethods['updateDocumentVisualization'];
  createLearnerProfile: AllMethods['createLearnerProfile'];
  getLearnerProfile: AllMethods['getLearnerProfile'];
  updateLearnerProfile: AllMethods['updateLearnerProfile'];
  listLearnerKnowledgeNodes: AllMethods['listLearnerKnowledgeNodes'];
  getLearnerKnowledgeNodeByLabel: AllMethods['getLearnerKnowledgeNodeByLabel'];
  upsertLearnerKnowledgeNode: AllMethods['upsertLearnerKnowledgeNode'];
  listLearnerKnowledgeEdges: AllMethods['listLearnerKnowledgeEdges'];
  upsertLearnerKnowledgeEdge: AllMethods['upsertLearnerKnowledgeEdge'];
  createLearnerEvent: AllMethods['createLearnerEvent'];
  listLearnerEvents: AllMethods['listLearnerEvents'];
}

async function resolveSourceFileWithText(
  deps: DocumentServiceDeps,
  userId: string,
  sourceFile: IMongoFile,
): Promise<IMongoFile> {
  if (sourceFile.text?.trim() || !sourceFile.temp_file_id) {
    return sourceFile;
  }

  const linkedFiles =
    (await deps.getFiles(
      {
        user: userId,
        temp_file_id: sourceFile.temp_file_id,
        text: { $exists: true, $ne: null },
      },
      { updatedAt: -1 },
      {
        file_id: 1,
        temp_file_id: 1,
        text: 1,
        metadata: 1,
      },
    )) ?? [];

  const extracted = linkedFiles.find((file) => file.text?.trim());
  if (!extracted?.text?.trim()) {
    return sourceFile;
  }

  return {
    ...sourceFile,
    text: extracted.text,
    metadata: sourceFile.metadata ?? extracted.metadata,
  };
}

async function safeRecordDocumentObservation(
  deps: DocumentServiceDeps,
  userId: string,
  payload: Parameters<typeof recordLearnerObservation>[2],
): Promise<void> {
  try {
    await recordLearnerObservation(deps, userId, payload);
  } catch {
    // Learner-state updates should not block document flows.
  }
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for document study mode');
  }

  return new OpenAI({
    apiKey,
    baseURL: getConfiguredOpenAIBaseURL(),
  });
}

function getModelCandidates(preferredModel?: string | null): string[] {
  return [preferredModel, ...DEFAULT_PROXY_MODELS, DEFAULT_DIRECT_MODEL].filter(
    (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
  );
}

async function resolveModel(client: OpenAI, preferredModel?: string | null): Promise<string> {
  const candidates = getModelCandidates(preferredModel);
  if (!getConfiguredOpenAIBaseURL()) {
    return candidates[0];
  }

  try {
    const models = await client.models.list();
    const available = new Set(models.data.map((model) => model.id));
    return candidates.find((candidate) => available.has(candidate)) ?? candidates[0];
  } catch {
    return candidates[0];
  }
}

function extractJsonBlock(raw: string): string | null {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function stripCodeFences(raw: string): string {
  const fencedMatch = raw.match(/```(?:html|svg|mermaid|markdown)?\s*([\s\S]*?)```/i);
  return fencedMatch?.[1]?.trim() ?? raw.trim();
}

function sanitizeTitle(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\-_:,.() ]/gu, '')
    .trim()
    .slice(0, 80);
}

function getFallbackTitle(value: string): string {
  return sanitizeTitle(value) || 'Document visualization';
}

function parseVisualizationEnvelope(
  rawResponse: string,
  artifactType: VisualizationArtifactType,
  prompt: string,
  model: string,
) {
  const jsonCandidate = extractJsonBlock(rawResponse);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as {
        title?: string;
        description?: string;
        artifact_type?: VisualizationArtifactType;
        content?: string;
      };

      if (parsed.content && typeof parsed.content === 'string') {
        return {
          title: parsed.title?.trim() || getFallbackTitle(prompt),
          description: parsed.description?.trim() || '',
          artifactType: parsed.artifact_type ?? artifactType,
          content: parsed.content.trim(),
          rawResponse,
          model,
        };
      }
    } catch {
      // Fall through to raw content handling.
    }
  }

  const stripped = stripCodeFences(rawResponse);
  if (!stripped) {
    throw new Error('Visualization generation returned empty content');
  }

  return {
    title: getFallbackTitle(prompt),
    description: '',
    artifactType,
    content: stripped,
    rawResponse,
    model,
  };
}

function getHeadingPath(blocks: IDocumentBlock[], blockId: string): string[] {
  const targetIndex = blocks.findIndex((block) => block.blockId === blockId);
  if (targetIndex < 0) {
    return [];
  }

  const headingStack: Array<{ level: number; title: string }> = [];
  for (let index = 0; index <= targetIndex; index += 1) {
    const block = blocks[index];
    if (block.type !== 'heading' || !block.title || !block.level) {
      continue;
    }

    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= block.level) {
      headingStack.pop();
    }

    headingStack.push({
      level: block.level,
      title: block.title,
    });
  }

  return headingStack.map((item) => item.title);
}

function toBlockContext(block?: IDocumentBlock | null): BlockContext | null {
  if (!block) {
    return null;
  }

  return {
    type: block.type,
    text: block.plainText || block.contentMarkdown,
  };
}

function getOCRPages(file?: IMongoFile | null) {
  const pages = file?.metadata?.ocr?.pages;
  if (!pages?.length) {
    return undefined;
  }

  return pages.map((page) => ({
    index: page.index,
    dimensions: page.dimensions,
    images: (page.images || []).map((image) => ({
      id: image.id,
      topLeftX: image.topLeftX,
      topLeftY: image.topLeftY,
      bottomRightX: image.bottomRightX,
      bottomRightY: image.bottomRightY,
      imageBase64: image.imageBase64,
      imageAnnotation: image.imageAnnotation ?? null,
      reusable: image.reusable ?? null,
    })),
  }));
}

function isHydratableDocumentAsset(asset: unknown): asset is HydratableDocumentAsset {
  if (!asset || typeof asset !== 'object') {
    return false;
  }

  const candidate = asset as HydratableDocumentAsset;
  return (
    typeof candidate.assetId === 'string' &&
    candidate.source === 'ocr_page_image' &&
    typeof candidate.pageNumber === 'number' &&
    typeof candidate.imageIndex === 'number'
  );
}

function toDocumentAssetDataUri(imageBase64: string, mimeType?: string | null): string {
  const trimmed = imageBase64.trim();
  if (/^data:/i.test(trimmed)) {
    return trimmed;
  }

  return `data:${mimeType || 'image/png'};base64,${trimmed}`;
}

function hydrateDocumentAssets(
  renderVersion: IDocumentRenderVersion,
  sourceFile?: IMongoFile | null,
): IDocumentRenderVersion {
  const ocrPages = sourceFile?.metadata?.ocr?.pages;
  if (!ocrPages?.length) {
    return renderVersion;
  }

  const pageLookup = new Map<number, OCRPageInput>();
  ocrPages.forEach((page) => {
    pageLookup.set(page.index + 1, page);
  });

  const storedAssets =
    renderVersion.documentIrJson.assets && renderVersion.documentIrJson.assets.length > 0
      ? renderVersion.documentIrJson.assets
      : renderVersion.assetsJson ?? [];

  if (!storedAssets.length) {
    return renderVersion;
  }

  const hydratedAssets = storedAssets.map((asset) => {
    if (!isHydratableDocumentAsset(asset)) {
      return asset;
    }

    const page = pageLookup.get(asset.pageNumber);
    const image =
      (asset.ocrImageId
        ? page?.images?.find((candidate) => candidate.id === asset.ocrImageId)
        : null) ?? page?.images?.[asset.imageIndex - 1];
    if (!image?.imageBase64) {
      return asset;
    }

    return {
      ...asset,
      dataUri: toDocumentAssetDataUri(image.imageBase64, asset.mimeType),
    };
  });

  return {
    ...renderVersion,
    documentIrJson: {
      ...(renderVersion.documentIrJson as IDocumentIR),
      assets: hydratedAssets,
    },
    assetsJson: hydratedAssets,
  } as IDocumentRenderVersion;
}

function requireBlock(renderVersion: IDocumentRenderVersion, blockId: string): IDocumentBlock {
  const block = renderVersion.documentIrJson.blocks.find(
    (candidate) => candidate.blockId === blockId,
  );
  if (!block) {
    throw new Error('Document anchor block not found');
  }
  return block;
}

function getAdjacentBlocks(renderVersion: IDocumentRenderVersion, blockId: string) {
  const blocks = renderVersion.documentIrJson.blocks;
  const index = blocks.findIndex((candidate) => candidate.blockId === blockId);
  if (index < 0) {
    return {
      previousBlock: null,
      nextBlock: null,
    };
  }

  return {
    previousBlock: blocks[index - 1] ?? null,
    nextBlock: blocks[index + 1] ?? null,
  };
}

function buildClarificationOverlayData(
  clarifications: IDocumentClarification[],
  visualizations: IDocumentVisualization[],
) {
  return {
    integratedClarificationIds: clarifications
      .filter((clarification) => clarification.status === 'integrated')
      .map((clarification) => clarification.clarificationId),
    integratedVisualizationIds: visualizations
      .filter(
        (visualization) =>
          visualization.integrationState === 'integrated' &&
          !visualization.deletedAt &&
          visualization.status !== 'archived',
      )
      .map((visualization) => visualization.visualizationId),
  };
}

async function syncDocumentOverlay(
  deps: DocumentServiceDeps,
  userId: string,
  documentId: string,
  renderVersionId: string,
) {
  const [clarifications, visualizations, overlays] = await Promise.all([
    deps.listDocumentClarifications(userId, {
      documentId,
      renderVersionId,
      includeArchived: false,
    }),
    deps.listDocumentVisualizations(userId, {
      documentId,
      renderVersionId,
      includeDeleted: false,
      includeArchived: false,
      includeAllVersions: false,
    }),
    deps.listDocumentOverlays(userId, documentId),
  ]);

  const overlay = await deps.createDocumentOverlay(userId, {
    documentId,
    renderVersionId,
    overlayVersionNumber: (overlays[0]?.overlayVersionNumber ?? 0) + 1,
    overlayJson: buildClarificationOverlayData(clarifications, visualizations),
    isActive: true,
  });

  await deps.setActiveDocumentOverlay(userId, documentId, overlay.overlayId);
  await deps.updateStudyDocument(userId, documentId, {
    activeOverlayId: overlay.overlayId,
  });

  return overlay;
}

function decorateDocumentForViewer(userId: string, document: IStudyDocument): IStudyDocument {
  const isOwner = document.createdByUserId === userId;
  const isImported = !isOwner && document.libraryUserIds.includes(userId);

  return {
    ...document,
    isImported,
    isOwner,
  };
}

async function buildWorkspace(
  deps: DocumentServiceDeps,
  viewerUserId: string,
  document: IStudyDocument,
  options: {
    annotationUserId?: string;
  } = {},
): Promise<DocumentWorkspace> {
  const annotationUserId = options.annotationUserId ?? viewerUserId;
  const renderVersion =
    (document.activeRenderVersionId
      ? await deps.getDocumentRenderVersion(annotationUserId, document.activeRenderVersionId)
      : await deps.getActiveDocumentRenderVersion(annotationUserId, document.documentId)) ?? null;

  if (!renderVersion) {
    throw new Error('Document render version not found');
  }

  const [overlay, clarifications, visualizations, sourceFile] = await Promise.all([
    deps.getActiveDocumentOverlay(annotationUserId, document.documentId),
    deps.listDocumentClarifications(annotationUserId, {
      documentId: document.documentId,
      renderVersionId: renderVersion.renderVersionId,
      includeArchived: false,
    }),
    deps.listDocumentVisualizations(annotationUserId, {
      documentId: document.documentId,
      renderVersionId: renderVersion.renderVersionId,
      includeDeleted: false,
      includeArchived: false,
      includeAllVersions: false,
    }),
    deps.findFileById(document.sourceFileId),
  ]);

  return {
    document: decorateDocumentForViewer(viewerUserId, document),
    renderVersion: hydrateDocumentAssets(renderVersion, sourceFile),
    overlay,
    clarifications,
    visualizations,
  };
}

async function copySharedDocumentState(
  deps: DocumentServiceDeps,
  userId: string,
  document: IStudyDocument,
): Promise<void> {
  const renderVersion =
    (document.activeRenderVersionId
      ? await deps.getDocumentRenderVersion(document.createdByUserId, document.activeRenderVersionId)
      : await deps.getActiveDocumentRenderVersion(document.createdByUserId, document.documentId)) ??
    null;

  if (!renderVersion) {
    return;
  }

  const [existingOverlay, sourceClarifications, sourceVisualizations, overlays] = await Promise.all([
    deps.getActiveDocumentOverlay(userId, document.documentId),
    deps.listDocumentClarifications(document.createdByUserId, {
      documentId: document.documentId,
      renderVersionId: renderVersion.renderVersionId,
      includeArchived: false,
    }),
    deps.listDocumentVisualizations(document.createdByUserId, {
      documentId: document.documentId,
      renderVersionId: renderVersion.renderVersionId,
      includeDeleted: false,
      includeArchived: false,
      includeAllVersions: false,
    }),
    deps.listDocumentOverlays(userId, document.documentId),
  ]);

  if (existingOverlay || (sourceClarifications.length === 0 && sourceVisualizations.length === 0)) {
    return;
  }

  const clarificationIdMap = new Map<string, string>();
  for (const clarification of sourceClarifications) {
    const createdClarification = await deps.createDocumentClarification(userId, {
      documentId: clarification.documentId,
      renderVersionId: clarification.renderVersionId,
      overlayId: null,
      anchor: clarification.anchor,
      clarificationQuestion: clarification.clarificationQuestion,
      clarificationAnswer: clarification.clarificationAnswer,
      promptText: clarification.promptText ?? null,
      modelProvider: clarification.modelProvider ?? null,
      modelName: clarification.modelName ?? null,
      status: clarification.status,
      integratedAt: clarification.integratedAt ?? null,
    });

    clarificationIdMap.set(clarification.clarificationId, createdClarification.clarificationId);
  }

  const visualizationIdMap = new Map<string, string>();
  for (const visualization of sourceVisualizations) {
    const createdVisualization = await deps.createDocumentVisualization(userId, {
      documentId: visualization.documentId,
      renderVersionId: visualization.renderVersionId,
      overlayId: null,
      anchor: visualization.anchor,
      title: visualization.title,
      description: visualization.description,
      artifactType: visualization.artifactType,
      status: visualization.status,
      storageMode: visualization.storageMode,
      canonicalSourceText: visualization.canonicalSourceText,
      canonicalSourceMimeType: visualization.canonicalSourceMimeType ?? null,
      compiledRenderText: visualization.compiledRenderText ?? null,
      compiledRenderMimeType: visualization.compiledRenderMimeType,
      compiledRenderStoragePath: visualization.compiledRenderStoragePath ?? null,
      sourcePrompt: visualization.sourcePrompt,
      generationModel: visualization.generationModel ?? null,
      generationMetadata: visualization.generationMetadata ?? null,
      integrationState: visualization.integrationState,
      isLatestVersion: true,
      versionNumber: 1,
      parentVisualizationId: null,
      rootVisualizationId: null,
      integratedAt: visualization.integratedAt ?? null,
      deletedAt: null,
    });

    visualizationIdMap.set(visualization.visualizationId, createdVisualization.visualizationId);
  }

  const overlay = await deps.createDocumentOverlay(userId, {
    documentId: document.documentId,
    renderVersionId: renderVersion.renderVersionId,
    overlayVersionNumber: (overlays[0]?.overlayVersionNumber ?? 0) + 1,
    overlayJson: {
      integratedClarificationIds: sourceClarifications
        .filter((clarification) => clarification.status === 'integrated')
        .map((clarification) => clarificationIdMap.get(clarification.clarificationId))
        .filter((clarificationId): clarificationId is string => Boolean(clarificationId)),
      integratedVisualizationIds: sourceVisualizations
        .filter(
          (visualization) =>
            visualization.integrationState === 'integrated' &&
            !visualization.deletedAt &&
            visualization.status !== 'archived',
        )
        .map((visualization) => visualizationIdMap.get(visualization.visualizationId))
        .filter((visualizationId): visualizationId is string => Boolean(visualizationId)),
    },
    isActive: true,
  });

  await deps.setActiveDocumentOverlay(userId, document.documentId, overlay.overlayId);
}

function getClarificationPreferredModel() {
  return process.env.INLINE_CLARIFICATION_MODEL || process.env.OPENAI_MODEL || null;
}

function getVisualizationPreferredModel() {
  return (
    process.env.INLINE_VISUALIZATION_MODEL ||
    process.env.INLINE_CLARIFICATION_MODEL ||
    process.env.OPENAI_MODEL ||
    null
  );
}

export async function listStudyDocuments(
  deps: DocumentServiceDeps,
  userId: string,
  params?: { projectId?: string | null },
) {
  const documents = await deps.listStudyDocuments(userId, params);
  return documents.map((document) => decorateDocumentForViewer(userId, document));
}

export async function listExploreStudyDocuments(
  deps: DocumentServiceDeps,
  userId: string,
  params?: { projectId?: string | null },
) {
  const documents = await deps.listExploreStudyDocuments(userId, params);
  return documents.map((document) => decorateDocumentForViewer(userId, document));
}

export async function createStudyDocumentFromFile(
  deps: DocumentServiceDeps,
  userId: string,
  payload: CreateStudyDocumentPayload,
) {
  const existing = await deps.getStudyDocumentBySourceFile(userId, payload.sourceFileId);
  if (existing) {
    return buildWorkspace(deps, userId, existing);
  }

  const sourceFile = await deps.findFileById(payload.sourceFileId, { user: userId });
  if (!sourceFile) {
    throw new Error('Source file not found');
  }

  const file = await resolveSourceFileWithText(deps, userId, sourceFile);

  if (!file.text || !file.text.trim()) {
    throw new Error('Source file does not contain extracted document text');
  }

  const sourceMimeType = resolveSourceMimeType({
    sourceMimeType: file.type,
    sourceFilename: file.filename,
    sourcePath: file.filepath,
  });
  const sourceKind = detectSourceKind({
    sourceMimeType,
    sourceFilename: file.filename,
    sourcePath: file.filepath,
  });

  const document = await deps.createStudyDocument(userId, {
    projectId: payload.projectId ?? file.projectId ?? null,
    sourceFileId: file.file_id,
    title: payload.title?.trim() || file.filename,
    sourceMimeType,
    sourceKind,
    ingestionStatus: 'processing',
    ingestionStrategy: 'plain_text',
    activeRenderVersionId: null,
    activeOverlayId: null,
  });

  const normalized = normalizeDocumentText({
    documentId: document.documentId,
    projectId: document.projectId ?? null,
    sourceFileId: file.file_id,
    sourceMimeType,
    sourceFilename: file.filename,
    sourcePath: file.filepath,
    title: document.title,
    text: file.text,
    ocrPages: getOCRPages(file),
    renderVersion: 1,
  });

  const renderVersion = await deps.createDocumentRenderVersion(userId, {
    documentId: document.documentId,
    versionNumber: 1,
    documentIrJson: normalized.ir,
    renderHtml: null,
    outlineJson: normalized.ir.outline,
    assetsJson: normalized.ir.assets ?? [],
    isActive: true,
  });

  const overlay = await deps.createDocumentOverlay(userId, {
    documentId: document.documentId,
    renderVersionId: renderVersion.renderVersionId,
    overlayVersionNumber: 1,
    overlayJson: {
      integratedClarificationIds: [],
      integratedVisualizationIds: [],
    },
    isActive: true,
  });

  const updatedDocument = await deps.updateStudyDocument(userId, document.documentId, {
    ingestionStatus: 'ready',
    sourceMimeType,
    sourceKind: normalized.sourceKind,
    ingestionStrategy: normalized.ingestionStrategy,
    activeRenderVersionId: renderVersion.renderVersionId,
    activeOverlayId: overlay.overlayId,
    projectId: document.projectId ?? null,
    title: document.title,
  });

  return buildWorkspace(deps, userId, updatedDocument ?? document);
}

export async function getStudyDocumentWorkspace(
  deps: DocumentServiceDeps,
  userId: string,
  documentId: string,
) {
  const document = await deps.getStudyDocument(userId, documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  return buildWorkspace(deps, userId, document);
}

export async function getExploreStudyDocumentWorkspace(
  deps: DocumentServiceDeps,
  userId: string,
  documentId: string,
) {
  const document = await deps.getSharedStudyDocument(documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  return buildWorkspace(deps, userId, document, {
    annotationUserId: document.createdByUserId,
  });
}

export async function importStudyDocument(
  deps: DocumentServiceDeps,
  userId: string,
  documentId: string,
) {
  const existingWorkspaceDocument = await deps.getStudyDocument(userId, documentId);
  if (existingWorkspaceDocument) {
    return buildWorkspace(deps, userId, existingWorkspaceDocument);
  }

  const document = await deps.getSharedStudyDocument(documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  await deps.addStudyDocumentToLibrary(userId, documentId);
  await copySharedDocumentState(deps, userId, document);

  const importedDocument = await deps.getStudyDocument(userId, documentId);
  if (!importedDocument) {
    throw new Error('Document not found');
  }

  return buildWorkspace(deps, userId, importedDocument);
}

export async function updateStudyDocumentSharing(
  deps: DocumentServiceDeps,
  userId: string,
  payload: UpdateStudyDocumentSharingPayload,
) {
  const document = await deps.getOwnedStudyDocument(userId, payload.documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  const updatedDocument = await deps.updateStudyDocument(userId, payload.documentId, {
    sharingVisibility: payload.sharingVisibility,
  });

  if (!updatedDocument) {
    throw new Error('Document not found');
  }

  return decorateDocumentForViewer(userId, updatedDocument);
}

export async function reingestStudyDocument(
  deps: DocumentServiceDeps,
  userId: string,
  documentId: string,
) {
  const document = await deps.getOwnedStudyDocument(userId, documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  const sourceFile = await deps.findFileById(document.sourceFileId, { user: userId });
  if (!sourceFile) {
    throw new Error('Source file does not contain extracted document text');
  }

  const file = await resolveSourceFileWithText(deps, userId, sourceFile);
  if (!file.text?.trim()) {
    throw new Error('Source file does not contain extracted document text');
  }

  const sourceMimeType = resolveSourceMimeType({
    sourceMimeType: file.type,
    sourceFilename: file.filename,
    sourcePath: file.filepath,
  });
  const versions = await deps.listDocumentRenderVersions(userId, documentId);
  const nextVersionNumber = (versions[0]?.versionNumber ?? 0) + 1;

  const normalized = normalizeDocumentText({
    documentId: document.documentId,
    projectId: document.projectId ?? null,
    sourceFileId: file.file_id,
    sourceMimeType,
    sourceFilename: file.filename,
    sourcePath: file.filepath,
    title: document.title,
    text: file.text,
    ocrPages: getOCRPages(file),
    renderVersion: nextVersionNumber,
  });

  const renderVersion = await deps.createDocumentRenderVersion(userId, {
    documentId: document.documentId,
    versionNumber: nextVersionNumber,
    documentIrJson: normalized.ir,
    renderHtml: null,
    outlineJson: normalized.ir.outline,
    assetsJson: normalized.ir.assets ?? [],
    isActive: true,
  });

  await deps.setActiveDocumentRenderVersion(
    userId,
    document.documentId,
    renderVersion.renderVersionId,
  );

  const overlays = await deps.listDocumentOverlays(userId, document.documentId);
  const overlay = await deps.createDocumentOverlay(userId, {
    documentId: document.documentId,
    renderVersionId: renderVersion.renderVersionId,
    overlayVersionNumber: (overlays[0]?.overlayVersionNumber ?? 0) + 1,
    overlayJson: {
      integratedClarificationIds: [],
      integratedVisualizationIds: [],
    },
    isActive: true,
  });

  await deps.setActiveDocumentOverlay(userId, document.documentId, overlay.overlayId);

  const updatedDocument = await deps.updateStudyDocument(userId, document.documentId, {
    ingestionStatus: 'ready',
    sourceMimeType,
    sourceKind: normalized.sourceKind,
    ingestionStrategy: normalized.ingestionStrategy as DocumentIngestionStrategy,
    activeRenderVersionId: renderVersion.renderVersionId,
    activeOverlayId: overlay.overlayId,
  });

  return buildWorkspace(deps, userId, updatedDocument ?? document);
}

export async function createDocumentClarification(
  deps: DocumentServiceDeps,
  userId: string,
  payload: CreateDocumentClarificationPayload,
) {
  const document = await deps.getStudyDocument(userId, payload.documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  const renderVersion = await deps.getDocumentRenderVersion(userId, payload.renderVersionId);
  if (!renderVersion || renderVersion.documentId !== document.documentId) {
    throw new Error('Document render version not found');
  }

  const block = requireBlock(renderVersion, payload.anchor.blockId);
  const { previousBlock, nextBlock } = getAdjacentBlocks(renderVersion, payload.anchor.blockId);
  const client = getOpenAIClient();
  const model = await resolveModel(client, getClarificationPreferredModel());
  const messages = buildDocumentClarificationMessages({
    documentTitle: document.title,
    headingPath: getHeadingPath(renderVersion.documentIrJson.blocks, payload.anchor.blockId),
    selectedText: payload.anchor.anchorText,
    contextBefore: payload.anchor.anchorContextBefore,
    contextAfter: payload.anchor.anchorContextAfter,
    currentBlock: toBlockContext(block) ?? { type: block.type, text: block.contentMarkdown },
    previousBlock: toBlockContext(previousBlock),
    nextBlock: toBlockContext(nextBlock),
    clarificationQuestion: payload.clarificationQuestion.trim(),
  }) as ChatCompletionMessageParam[];

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages,
  });

  const answer =
    completion.choices[0]?.message?.content?.trim() || 'No clarification answer was generated.';

  const clarification = await deps.createDocumentClarification(userId, {
    documentId: document.documentId,
    renderVersionId: renderVersion.renderVersionId,
    anchor: {
      ...payload.anchor,
      headingPath: getHeadingPath(renderVersion.documentIrJson.blocks, payload.anchor.blockId),
    },
    clarificationQuestion: payload.clarificationQuestion.trim(),
    clarificationAnswer: answer,
    promptText: payload.clarificationQuestion.trim(),
    modelProvider: 'openai',
    modelName: model,
    status: 'active',
    integratedAt: null,
  });

  await safeRecordDocumentObservation(deps, userId, {
    surface: 'document',
    eventType: 'document_clarification',
    sourceId: document.documentId,
    sourceTitle: document.title,
    summary: `The learner requested a document clarification on "${payload.anchor.anchorText}" in ${document.title}.`,
    payloadJson: {
      clarificationId: clarification.clarificationId,
      renderVersionId: renderVersion.renderVersionId,
      headingPath: clarification.anchor.headingPath,
      question: payload.clarificationQuestion.trim(),
    },
    conceptHints: [
      {
        label: clarification.anchor.headingPath?.at(-1) ?? payload.anchor.anchorText,
        category: 'concept',
        mastery: 0.26,
        confidence: 0.42,
        evidenceSummary: payload.clarificationQuestion.trim(),
        sourceLabel: payload.anchor.anchorText,
      },
    ],
  });

  return clarification;
}

export async function integrateDocumentClarification(
  deps: DocumentServiceDeps,
  userId: string,
  payload: IntegrateDocumentClarificationPayload,
) {
  const clarification = await deps.getDocumentClarification(userId, payload.clarificationId);
  if (!clarification) {
    throw new Error('Document clarification not found');
  }

  const status = payload.displayMode === 'nested' ? 'active' : 'integrated';
  const updated = await deps.updateDocumentClarification(userId, clarification.clarificationId, {
    status,
    integratedAt: status === 'integrated' ? new Date() : null,
  });

  await syncDocumentOverlay(deps, userId, clarification.documentId, clarification.renderVersionId);

  return updated;
}

export async function archiveDocumentClarification(
  deps: DocumentServiceDeps,
  userId: string,
  clarificationId: string,
) {
  const clarification = await deps.getDocumentClarification(userId, clarificationId);
  if (!clarification) {
    throw new Error('Document clarification not found');
  }

  const updated = await deps.updateDocumentClarification(userId, clarificationId, {
    status: 'archived',
    integratedAt: null,
  });

  await syncDocumentOverlay(deps, userId, clarification.documentId, clarification.renderVersionId);

  return updated;
}

async function buildStoredVisualization(
  appConfig: AppConfig | undefined,
  visualizationId: string,
  artifactType: VisualizationArtifactType,
  generated: {
    title: string;
    description: string;
    artifactType: VisualizationArtifactType;
    content: string;
    rawResponse: string;
    model: string;
  },
) {
  const sanitized = sanitizeVisualizationByType(artifactType, generated.content);
  const persisted = await persistVisualizationPayload(
    appConfig,
    visualizationId,
    sanitized.compiledRenderMimeType,
    sanitized.compiledRenderText,
  );

  return {
    title: generated.title,
    description: generated.description,
    canonicalSourceText: sanitized.canonicalSourceText,
    canonicalSourceMimeType: sanitized.canonicalSourceMimeType,
    compiledRenderText: persisted.compiledRenderText,
    compiledRenderMimeType: sanitized.compiledRenderMimeType,
    compiledRenderStoragePath: persisted.compiledRenderStoragePath,
    storageMode: persisted.storageMode,
    generationMetadata: {
      rawResponse: generated.rawResponse,
      warnings: sanitized.warnings,
      originalMimeType: sanitized.canonicalSourceMimeType,
      sanitizedMimeType: sanitized.compiledRenderMimeType,
      storageByteSize: persisted.storageByteSize,
    },
    generationModel: generated.model,
  };
}

function assertSupportedArtifactType(artifactType: VisualizationArtifactType) {
  if (!['html_app', 'svg', 'mermaid'].includes(artifactType)) {
    throw new Error(`Artifact type "${artifactType}" is not supported in document study mode`);
  }
}

export async function createDocumentVisualization(
  deps: DocumentServiceDeps,
  userId: string,
  payload: CreateDocumentVisualizationPayload,
  context: DocumentModelContext = {},
) {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new Error('Visualization prompt is required');
  }

  assertSupportedArtifactType(payload.artifactType);

  const document = await deps.getStudyDocument(userId, payload.documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  const renderVersion = await deps.getDocumentRenderVersion(userId, payload.renderVersionId);
  if (!renderVersion || renderVersion.documentId !== document.documentId) {
    throw new Error('Document render version not found');
  }

  const block = requireBlock(renderVersion, payload.anchor.blockId);
  const { previousBlock, nextBlock } = getAdjacentBlocks(renderVersion, payload.anchor.blockId);
  const client = getOpenAIClient();
  const model = await resolveModel(client, getVisualizationPreferredModel());
  const messages = buildDocumentVisualizationMessages({
    documentTitle: document.title,
    headingPath: getHeadingPath(renderVersion.documentIrJson.blocks, payload.anchor.blockId),
    selectedText: payload.anchor.anchorText,
    contextBefore: payload.anchor.anchorContextBefore,
    contextAfter: payload.anchor.anchorContextAfter,
    currentBlock: toBlockContext(block) ?? { type: block.type, text: block.contentMarkdown },
    previousBlock: toBlockContext(previousBlock),
    nextBlock: toBlockContext(nextBlock),
    prompt,
    artifactType: payload.artifactType,
  }) as ChatCompletionMessageParam[];

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages,
  });

  const rawResponse = completion.choices[0]?.message?.content?.trim();
  if (!rawResponse) {
    throw new Error('Visualization generation returned no content');
  }

  const generated = parseVisualizationEnvelope(rawResponse, payload.artifactType, prompt, model);
  assertSupportedArtifactType(generated.artifactType);

  const visualizationId = crypto.randomUUID();
  const stored = await buildStoredVisualization(
    context.appConfig,
    visualizationId,
    generated.artifactType,
    generated,
  );

  const visualization = await deps.createDocumentVisualization(userId, {
    visualizationId,
    documentId: document.documentId,
    renderVersionId: renderVersion.renderVersionId,
    anchor: {
      ...payload.anchor,
      headingPath: getHeadingPath(renderVersion.documentIrJson.blocks, payload.anchor.blockId),
    },
    title: stored.title,
    description: stored.description,
    artifactType: generated.artifactType,
    status: 'ready',
    storageMode: stored.storageMode,
    canonicalSourceText: stored.canonicalSourceText,
    canonicalSourceMimeType: stored.canonicalSourceMimeType,
    compiledRenderText: stored.compiledRenderText,
    compiledRenderMimeType: stored.compiledRenderMimeType,
    compiledRenderStoragePath: stored.compiledRenderStoragePath,
    sourcePrompt: prompt,
    generationModel: stored.generationModel,
    generationMetadata: stored.generationMetadata,
    integrationState: 'nested_only',
    isLatestVersion: true,
    versionNumber: 1,
    parentVisualizationId: null,
    rootVisualizationId: null,
    integratedAt: null,
    deletedAt: null,
  });

  await safeRecordDocumentObservation(deps, userId, {
    surface: 'document',
    eventType: 'document_visualization',
    sourceId: document.documentId,
    sourceTitle: document.title,
    summary: `The learner requested a ${payload.artifactType} document visualization for "${payload.anchor.anchorText}" in ${document.title}.`,
    payloadJson: {
      visualizationId: visualization.visualizationId,
      renderVersionId: renderVersion.renderVersionId,
      artifactType: payload.artifactType,
      prompt,
    },
    conceptHints: [
      {
        label: visualization.anchor.headingPath?.at(-1) ?? payload.anchor.anchorText,
        category: 'bridge',
        mastery: 0.3,
        confidence: 0.45,
        evidenceSummary: prompt,
        sourceLabel: payload.anchor.anchorText,
      },
    ],
  });

  return visualization;
}

export async function integrateDocumentVisualization(
  deps: DocumentServiceDeps,
  userId: string,
  payload: IntegrateDocumentVisualizationPayload,
) {
  const visualization = await deps.getDocumentVisualization(userId, payload.visualizationId, true);
  if (!visualization) {
    throw new Error('Document visualization not found');
  }

  const integrationState = payload.displayMode === 'nested' ? 'nested_only' : 'integrated';

  const updated = await deps.updateDocumentVisualization(userId, visualization.visualizationId, {
    integrationState,
    integratedAt: integrationState === 'integrated' ? new Date() : null,
  });

  await syncDocumentOverlay(deps, userId, visualization.documentId, visualization.renderVersionId);

  return updated;
}

export async function deleteDocumentVisualization(
  deps: DocumentServiceDeps,
  userId: string,
  visualizationId: string,
) {
  const visualization = await deps.getDocumentVisualization(userId, visualizationId, true);
  if (!visualization) {
    throw new Error('Document visualization not found');
  }

  const updated = await deps.updateDocumentVisualization(userId, visualization.visualizationId, {
    deletedAt: new Date(),
    status: 'archived',
    isLatestVersion: false,
    integrationState: 'detached',
    integratedAt: null,
  });

  await syncDocumentOverlay(deps, userId, visualization.documentId, visualization.renderVersionId);

  return updated;
}

export async function getDocumentVisualizationRenderPayload(
  deps: DocumentServiceDeps,
  userId: string,
  visualizationId: string,
  context: DocumentModelContext = {},
) {
  const visualization = await deps.getDocumentVisualization(userId, visualizationId, false);
  if (!visualization || visualization.deletedAt || visualization.status === 'archived') {
    throw new Error('Document visualization not found');
  }

  return loadVisualizationPayload(
    context.appConfig,
    visualization.compiledRenderMimeType,
    visualization.compiledRenderText,
    visualization.compiledRenderStoragePath,
  );
}
