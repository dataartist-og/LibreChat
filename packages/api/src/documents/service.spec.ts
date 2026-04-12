import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import {
  createDocumentClarification,
  createDocumentVisualization,
  createStudyDocumentFromFile,
  integrateDocumentClarification,
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
      type?: string;
      filename?: string;
      filepath?: string;
    } = {},
  ) {
    const fileId = new mongoose.Types.ObjectId().toString();
    const file = await methods.createFile(
      {
        file_id: fileId,
        user: new mongoose.Types.ObjectId(userId),
        projectId,
        filename: options.filename ?? 'entropy.pdf',
        filepath: options.filepath ?? `/tmp/${fileId}.pdf`,
        type: options.type ?? 'application/pdf',
        bytes: Buffer.byteLength(text, 'utf8'),
        text,
      },
      true,
    );

    if (!file) {
      throw new Error('Failed to create source file fixture');
    }

    return file;
  }

  async function createWorkspace() {
    const file = await createSourceFile(
      [
        '# Entropy',
        '',
        'Entropy increases in isolated systems.',
        '',
        '- Disorder',
        '- Microstates',
      ].join('\n'),
    );

    return createStudyDocumentFromFile(methods, userId, {
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
});
