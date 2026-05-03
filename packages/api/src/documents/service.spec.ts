import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import {
  createDocumentClarification,
  createDocumentVisualization,
  createStudyDocumentFromFile,
  getExploreStudyDocumentWorkspace,
  integrateDocumentClarification,
  importStudyDocument,
  listExploreStudyDocuments,
  updateStudyDocumentSharing,
} from './service';

const mockChatCreate = jest.fn();
const mockPersistVisualizationPayload = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockChatCreate,
      },
    },
    models: {
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
  })),
}));

jest.mock('~/visualizations/storage', () => ({
  persistVisualizationPayload: (...args: unknown[]) => mockPersistVisualizationPayload(...args),
  loadVisualizationPayload: jest.fn(),
}));

describe('document service', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const userIdTwo = new mongoose.Types.ObjectId().toString();
  const projectId = 'project-1';
  let mongoServer: MongoMemoryServer;
  let methods: ReturnType<typeof createMethods>;

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    createModels(mongoose);
    methods = createMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    mockChatCreate.mockReset();
    mockPersistVisualizationPayload.mockReset();
    mockPersistVisualizationPayload.mockImplementation(
      async (_appConfig, visualizationId: string, _mimeType: string, _content: string) => ({
        storageMode: 'hybrid',
        compiledRenderText: null,
        compiledRenderStoragePath: `uploads/visualizations/${visualizationId}.svg`,
        storageByteSize: 4096,
      }),
    );

    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  async function createSourceFile(
    text: string,
    options: {
      userId?: string;
      type?: string;
      filename?: string;
      filepath?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    const fileId = new mongoose.Types.ObjectId().toString();
    const file = await methods.createFile(
      {
        file_id: fileId,
        user: new mongoose.Types.ObjectId(options.userId ?? userId),
        projectId,
        filename: options.filename ?? 'entropy.pdf',
        filepath: options.filepath ?? `/tmp/${fileId}.pdf`,
        type: options.type ?? 'application/pdf',
        bytes: Buffer.byteLength(text, 'utf8'),
        text,
        metadata: options.metadata,
      },
      true,
    );

    if (!file) {
      throw new Error('Failed to create source file fixture');
    }

    return file;
  }

  async function createWorkspace(ownerUserId = userId) {
    const file = await createSourceFile(
      [
        '# Entropy',
        '',
        'Entropy increases in isolated systems.',
        '',
        '- Disorder',
        '- Microstates',
      ].join('\n'),
      {
        userId: ownerUserId,
      },
    );

    return createStudyDocumentFromFile(methods, ownerUserId, {
      sourceFileId: file.file_id,
      projectId,
      title: 'Entropy Notes',
    });
  }

  it('creates a document workspace from extracted file text and reuses existing documents by source file', async () => {
    const workspace = await createWorkspace();

    expect(workspace.document.title).toBe('Entropy Notes');
    expect(workspace.document.sourceKind).toBe('pdf');
    expect(workspace.document.ingestionStatus).toBe('ready');
    expect(workspace.document.ingestionStrategy).toBe('document_parser');
    expect(workspace.renderVersion.versionNumber).toBe(1);
    expect(workspace.overlay?.overlayJson).toEqual({
      integratedClarificationIds: [],
      integratedVisualizationIds: [],
    });
    expect(
      workspace.renderVersion.documentIrJson.blocks.some((block) => block.type === 'heading'),
    ).toBe(true);
    expect(
      workspace.renderVersion.documentIrJson.blocks.some((block) => block.type === 'paragraph'),
    ).toBe(true);
    expect(
      workspace.renderVersion.documentIrJson.blocks.some((block) => block.type === 'list'),
    ).toBe(true);

    const duplicateWorkspace = await createStudyDocumentFromFile(methods, userId, {
      sourceFileId: workspace.document.sourceFileId,
      projectId,
    });

    expect(duplicateWorkspace.document.documentId).toBe(workspace.document.documentId);
    expect(await methods.listStudyDocuments(userId, { projectId })).toHaveLength(1);
  });

  it('integrates document clarifications and syncs the active overlay', async () => {
    const workspace = await createWorkspace();
    const paragraphBlock = workspace.renderVersion.documentIrJson.blocks.find(
      (block) => block.type === 'paragraph',
    );

    if (!paragraphBlock) {
      throw new Error('Paragraph block fixture was not created');
    }

    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'Entropy measures how many microscopic states fit the same macrostate.',
          },
        },
      ],
    });

    const clarification = await createDocumentClarification(methods, userId, {
      documentId: workspace.document.documentId,
      renderVersionId: workspace.renderVersion.renderVersionId,
      anchor: {
        blockId: paragraphBlock.blockId,
        blockType: paragraphBlock.type,
        anchorText: 'Entropy',
        anchorContextBefore: '',
        anchorContextAfter: ' increases in isolated systems.',
        startOffset: 0,
        endOffset: 7,
        headingPath: [],
        pageStart: paragraphBlock.sourcePageStart ?? null,
        pageEnd: paragraphBlock.sourcePageEnd ?? null,
      },
      clarificationQuestion: 'What does entropy mean here?',
    });

    const integratedClarification = await integrateDocumentClarification(methods, userId, {
      clarificationId: clarification.clarificationId,
    });

    const overlay = await methods.getActiveDocumentOverlay(userId, workspace.document.documentId);

    expect(integratedClarification?.status).toBe('integrated');
    expect(integratedClarification?.integratedAt).toBeTruthy();
    expect(overlay?.overlayJson.integratedClarificationIds).toEqual([
      clarification.clarificationId,
    ]);
  });

  it('infers pdf source metadata and segments dense extracted parser text into stable blocks', async () => {
    const file = await createSourceFile(
      [
        '2 1 Differentiable Manifolds 1.1 Some Definitions and Theorems on Differentiable Manifolds Definitions 1.1 Let M be a topological space. A covering of M is a collection of open subsets of M.',
        '1.1 Some Definitions and Theorems on Differentiable Manifolds 3 Theorem 1.2 (Partition of Unity) Let M be a manifold and let { U α } α ∈ A be a locally finite covering of M.',
      ].join('\n'),
      {
        type: 'text/plain',
        filename: 'part_book_equations.pdf',
        filepath: 'document_parser',
      },
    );

    const workspace = await createStudyDocumentFromFile(methods, userId, {
      sourceFileId: file.file_id,
      projectId,
    });

    expect(workspace.document.sourceMimeType).toBe('application/pdf');
    expect(workspace.document.sourceKind).toBe('pdf');
    expect(workspace.document.ingestionStrategy).toBe('document_parser');
    expect(
      workspace.renderVersion.documentIrJson.blocks.some((block) => block.type === 'page_break'),
    ).toBe(true);
    expect(
      workspace.renderVersion.documentIrJson.blocks.some((block) => block.type === 'heading'),
    ).toBe(true);
    expect(workspace.renderVersion.documentIrJson.blocks.length).toBeGreaterThanOrEqual(5);
    expect(workspace.renderVersion.outlineJson.length).toBeGreaterThan(0);
  });

  it('hydrates OCR figure assets by OCR image id instead of positional index', async () => {
    const file = await createSourceFile(
      ['# PAGE 1', '![img-1.jpeg](img-1.jpeg)', '', 'Figure 1: Latent clusters.'].join('\n'),
      {
        type: 'application/pdf',
        filename: 'test_data.pdf',
        filepath: 'mistral_ocr',
        metadata: {
          ocr: {
            provider: 'mistral',
            pages: [
              {
                index: 0,
                dimensions: {
                  dpi: 200,
                  height: 1000,
                  width: 800,
                },
                images: [
                  {
                    id: 'page-snapshot-1',
                    topLeftX: 0,
                    topLeftY: 0,
                    bottomRightX: 800,
                    bottomRightY: 1000,
                    imageBase64: 'c25hcHNob3QtYmFzZTY0',
                    reusable: true,
                  },
                  {
                    id: 'img-1.jpeg',
                    topLeftX: 100,
                    topLeftY: 120,
                    bottomRightX: 500,
                    bottomRightY: 520,
                    imageBase64: 'data:image/jpeg;base64,ZmlndXJlLWJhc2U2NA==',
                  },
                ],
              },
            ],
          },
        },
      },
    );

    const workspace = await createStudyDocumentFromFile(methods, userId, {
      sourceFileId: file.file_id,
      projectId,
      title: 'Test Data',
    });

    const figureBlock = workspace.renderVersion.documentIrJson.blocks.find(
      (block) => block.type === 'figure',
    );
    const hydratedAsset = workspace.renderVersion.documentIrJson.assets?.find(
      (asset) => asset.assetId === figureBlock?.assetId,
    ) as { dataUri?: string | null; ocrImageId?: string | null } | undefined;

    expect(figureBlock?.plainText).toBe('Figure 1: Latent clusters.');
    expect(hydratedAsset?.ocrImageId).toBe('img-1.jpeg');
    expect(hydratedAsset?.dataUri).toBe('data:image/jpeg;base64,ZmlndXJlLWJhc2U2NA==');
  });

  it('creates document visualizations with the same visualization id used for persisted payload storage', async () => {
    const workspace = await createWorkspace();
    const paragraphBlock = workspace.renderVersion.documentIrJson.blocks.find(
      (block) => block.type === 'paragraph',
    );

    if (!paragraphBlock) {
      throw new Error('Paragraph block fixture was not created');
    }

    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
          },
        },
      ],
    });

    const visualization = await createDocumentVisualization(methods, userId, {
      documentId: workspace.document.documentId,
      renderVersionId: workspace.renderVersion.renderVersionId,
      anchor: {
        blockId: paragraphBlock.blockId,
        blockType: paragraphBlock.type,
        anchorText: 'Entropy increases',
        anchorContextBefore: '',
        anchorContextAfter: ' in isolated systems.',
        startOffset: 0,
        endOffset: 17,
        headingPath: [],
        pageStart: paragraphBlock.sourcePageStart ?? null,
        pageEnd: paragraphBlock.sourcePageEnd ?? null,
      },
      prompt: 'Visualize how entropy changes in an isolated system.',
      artifactType: 'svg',
    });

    expect(visualization.visualizationId).toBeTruthy();
    expect(visualization.rootVisualizationId).toBe(visualization.visualizationId);
    expect(visualization.compiledRenderStoragePath).toBe(
      `uploads/visualizations/${visualization.visualizationId}.svg`,
    );
    expect(mockPersistVisualizationPayload).toHaveBeenCalledWith(
      undefined,
      visualization.visualizationId,
      'image/svg+xml',
      '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
    );
  });

  it('supports public explore preview, import, and owner privacy toggles', async () => {
    const ownerWorkspace = await createWorkspace(userId);
    const paragraphBlock = ownerWorkspace.renderVersion.documentIrJson.blocks.find(
      (block) => block.type === 'paragraph',
    );

    if (!paragraphBlock) {
      throw new Error('Paragraph block fixture was not created');
    }

    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'Entropy measures how many microscopic states fit the same macrostate.',
          },
        },
      ],
    });

    const clarification = await createDocumentClarification(methods, userId, {
      documentId: ownerWorkspace.document.documentId,
      renderVersionId: ownerWorkspace.renderVersion.renderVersionId,
      anchor: {
        blockId: paragraphBlock.blockId,
        blockType: paragraphBlock.type,
        anchorText: 'Entropy',
        anchorContextBefore: '',
        anchorContextAfter: ' increases in isolated systems.',
        startOffset: 0,
        endOffset: 7,
        headingPath: [],
        pageStart: paragraphBlock.sourcePageStart ?? null,
        pageEnd: paragraphBlock.sourcePageEnd ?? null,
      },
      clarificationQuestion: 'What does entropy mean here?',
    });

    await integrateDocumentClarification(methods, userId, {
      clarificationId: clarification.clarificationId,
    });

    const exploreDocuments = await listExploreStudyDocuments(methods, userIdTwo);
    expect(exploreDocuments).toHaveLength(1);
    expect(exploreDocuments[0].documentId).toBe(ownerWorkspace.document.documentId);
    expect(exploreDocuments[0].isOwner).toBe(false);
    expect(exploreDocuments[0].isImported).toBe(false);

    const sharedPreview = await getExploreStudyDocumentWorkspace(
      methods,
      userIdTwo,
      ownerWorkspace.document.documentId,
    );
    expect(sharedPreview.document.isOwner).toBe(false);
    expect(sharedPreview.document.isImported).toBe(false);
    expect(sharedPreview.clarifications).toHaveLength(1);
    expect(sharedPreview.clarifications[0].clarificationAnswer).toContain('microscopic states');

    const importedWorkspace = await importStudyDocument(
      methods,
      userIdTwo,
      ownerWorkspace.document.documentId,
    );
    expect(importedWorkspace.document.isOwner).toBe(false);
    expect(importedWorkspace.document.isImported).toBe(true);
    expect(importedWorkspace.clarifications).toHaveLength(1);
    expect(importedWorkspace.clarifications[0].clarificationQuestion).toBe(
      clarification.clarificationQuestion,
    );

    const importedDocuments = await methods.listStudyDocuments(userIdTwo);
    expect(importedDocuments).toHaveLength(1);

    const updatedDocument = await updateStudyDocumentSharing(methods, userId, {
      documentId: ownerWorkspace.document.documentId,
      sharingVisibility: 'private',
    });
    expect(updatedDocument.sharingVisibility).toBe('private');

    const exploreAfterPrivacyToggle = await listExploreStudyDocuments(methods, userIdTwo);
    expect(exploreAfterPrivacyToggle).toHaveLength(0);
  });
});
