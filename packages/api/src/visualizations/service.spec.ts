import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import {
  createVisualization,
  deleteVisualization,
  refineVisualization,
  getVisualizationRenderPayload,
  integrateVisualization,
  regenerateVisualization,
  selectVisualizationModel,
  suggestVisualizationOptions,
} from './service';

const mockChatCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockChatCreate,
      },
    },
    images: {
      generate: jest.fn(),
    },
    models: {
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
  })),
}));

describe('selectVisualizationModel', () => {
  const originalReverseProxy = process.env.OPENAI_REVERSE_PROXY;
  const originalVisualizationModel = process.env.INLINE_VISUALIZATION_MODEL;
  const originalOpenAIModel = process.env.OPENAI_MODEL;

  afterEach(() => {
    process.env.OPENAI_REVERSE_PROXY = originalReverseProxy;
    process.env.INLINE_VISUALIZATION_MODEL = originalVisualizationModel;
    process.env.OPENAI_MODEL = originalOpenAIModel;
  });

  it('prefers a supported proxy model when the direct default is unavailable', () => {
    process.env.OPENAI_REVERSE_PROXY = 'http://127.0.0.1:10531/v1';
    delete process.env.INLINE_VISUALIZATION_MODEL;
    delete process.env.OPENAI_MODEL;

    expect(selectVisualizationModel(['gpt-5.4-mini', 'gpt-5.4'])).toBe('gpt-5.4-mini');
  });
});

describe('visualization service lifecycle', () => {
  const userId = 'visualization-user';
  const conversationId = '22222222-2222-4222-8222-222222222222';
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
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));

    const project = await methods.createProject(userId, {
      name: 'Dynamical Systems',
    });

    await mongoose.models.Conversation.create({
      conversationId,
      user: userId,
      projectId: project.projectId,
      title: 'Phase portraits',
      endpoint: 'openAI',
    });

    await mongoose.models.Message.create({
      messageId: 'message-visual-1',
      conversationId,
      parentMessageId: 'root',
      user: userId,
      sender: 'Assistant',
      isCreatedByUser: false,
      projectId: project.projectId,
      text: 'A phase portrait shows how trajectories move through state space.',
    });
  });

  it('suggests visualization options from the anchored context', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content_profile: 'conceptual',
              focus_summary: 'The phrase would benefit from a spatial view of the dynamics.',
              suggestions: [
                {
                  label: 'State-space sketch',
                  artifact_type: 'svg',
                  proposed_prompt:
                    'Create an SVG diagram that shows the phase portrait axes and representative trajectories for this passage.',
                  understanding_gain:
                    'It would make the geometry of the explanation easier to picture.',
                  reasoning: 'The highlighted text names a spatial concept.',
                },
              ],
            }),
          },
        },
      ],
    });

    const suggestions = await suggestVisualizationOptions(
      {
        getConvo: methods.getConvo,
        getMessages: methods.getMessages,
        getMessage: methods.getMessage,
        createVisualization: methods.createVisualization,
        listVisualizations: methods.listVisualizations,
        listVisualizationVersions: methods.listVisualizationVersions,
        getVisualization: methods.getVisualization,
        updateVisualization: methods.updateVisualization,
        setVisualizationLatestVersion: methods.setVisualizationLatestVersion,
        getLatestVisualizationVersion: methods.getLatestVisualizationVersion,
        listProjectSources: methods.listProjectSources,
        getFiles: methods.getFiles,
      },
      userId,
      {
        projectId: undefined,
        conversationId,
        parentMessageId: 'message-visual-1',
        anchorStart: 2,
        anchorEnd: 15,
        anchorText: 'phase portrait',
        anchorContextBefore: 'A ',
        anchorContextAfter: ' shows how trajectories move.',
        existingClarifications: [
          {
            question: 'What does phase portrait mean?',
            answer: 'It visualizes the state space and its flow.',
          },
        ],
      },
    );

    expect(suggestions.contentProfile).toBe('conceptual');
    expect(suggestions.suggestions).toHaveLength(1);
    expect(suggestions.suggestions[0]).toEqual(
      expect.objectContaining({
        label: 'State-space sketch',
        artifactType: 'svg',
      }),
    );
  });

  it('creates a persisted html visualization artifact', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Phase portrait intuition',
              description: 'A lightweight HTML control surface.',
              artifact_type: 'html_app',
              content:
                '<!DOCTYPE html><html><body><script src="https://example.com/remote.js"></script><div>phase portrait</div></body></html>',
            }),
          },
        },
      ],
    });

    const visualization = await createVisualization(
      {
        getConvo: methods.getConvo,
        getMessages: methods.getMessages,
        getMessage: methods.getMessage,
        createVisualization: methods.createVisualization,
        listVisualizations: methods.listVisualizations,
        listVisualizationVersions: methods.listVisualizationVersions,
        getVisualization: methods.getVisualization,
        updateVisualization: methods.updateVisualization,
        setVisualizationLatestVersion: methods.setVisualizationLatestVersion,
        getLatestVisualizationVersion: methods.getLatestVisualizationVersion,
        listProjectSources: methods.listProjectSources,
        getFiles: methods.getFiles,
      },
      userId,
      {
        projectId: undefined,
        conversationId,
        parentMessageId: 'message-visual-1',
        anchorStart: 2,
        anchorEnd: 15,
        anchorText: 'phase portrait',
        anchorContextBefore: 'A ',
        anchorContextAfter: ' shows how trajectories move.',
        prompt: 'Build an interactive intuition for a phase portrait.',
        artifactType: 'html_app',
      },
    );

    expect(visualization.status).toBe('ready');
    expect(visualization.artifactType).toBe('html_app');
    expect(visualization.compiledRenderMimeType).toBe('text/html');
    expect(visualization.compiledRenderText).toContain('phase portrait');
    expect(visualization.compiledRenderText).not.toContain('remote.js');
  });

  it('regenerates into a new version without losing the prior version', async () => {
    const original = await methods.createVisualization(userId, {
      projectId: null,
      conversationId,
      parentMessageId: 'message-visual-1',
      anchorStart: 2,
      anchorEnd: 15,
      anchorText: 'phase portrait',
      anchorContextBefore: 'A ',
      anchorContextAfter: ' shows how trajectories move.',
      anchorPath: null,
      inlineThreadId: null,
      title: 'Phase portrait v1',
      description: 'Original HTML app.',
      artifactType: 'html_app',
      status: 'ready',
      storageMode: 'db_inline',
      canonicalSourceText: '<html><body><div>v1</div></body></html>',
      canonicalSourceMimeType: 'text/html',
      compiledRenderText: '<html><body><div>v1</div></body></html>',
      compiledRenderMimeType: 'text/html',
      compiledRenderStoragePath: null,
      sourcePrompt: 'Original prompt',
      generationModel: 'gpt-4o-mini',
      generationMetadata: { warnings: [] },
      integrationState: 'nested_only',
      isLatestVersion: true,
      versionNumber: 1,
    });

    mockChatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Phase portrait v2',
              description: 'Regenerated HTML app.',
              artifact_type: 'html_app',
              content: '<!DOCTYPE html><html><body><div>v2</div></body></html>',
            }),
          },
        },
      ],
    });

    const regenerated = await regenerateVisualization(
      {
        getConvo: methods.getConvo,
        getMessages: methods.getMessages,
        getMessage: methods.getMessage,
        createVisualization: methods.createVisualization,
        listVisualizations: methods.listVisualizations,
        listVisualizationVersions: methods.listVisualizationVersions,
        getVisualization: methods.getVisualization,
        updateVisualization: methods.updateVisualization,
        setVisualizationLatestVersion: methods.setVisualizationLatestVersion,
        getLatestVisualizationVersion: methods.getLatestVisualizationVersion,
        listProjectSources: methods.listProjectSources,
        getFiles: methods.getFiles,
      },
      userId,
      {
        visualizationId: original.visualizationId,
      },
    );

    const originalAfter = await methods.getVisualization(userId, original.visualizationId, true);
    const versions = await methods.listVisualizationVersions(
      userId,
      regenerated.rootVisualizationId ?? regenerated.visualizationId,
    );

    expect(regenerated.versionNumber).toBe(2);
    expect(regenerated.isLatestVersion).toBe(true);
    expect(originalAfter?.isLatestVersion).toBe(false);
    expect(versions).toHaveLength(2);
  });

  it('refines into a new version using a follow-up instruction', async () => {
    const original = await methods.createVisualization(userId, {
      projectId: null,
      conversationId,
      parentMessageId: 'message-visual-1',
      anchorStart: 2,
      anchorEnd: 15,
      anchorText: 'phase portrait',
      anchorContextBefore: 'A ',
      anchorContextAfter: ' shows how trajectories move.',
      anchorPath: null,
      inlineThreadId: null,
      title: 'Phase portrait v1',
      description: 'Original HTML app.',
      artifactType: 'html_app',
      status: 'ready',
      storageMode: 'db_inline',
      canonicalSourceText: '<html><body><div>v1</div></body></html>',
      canonicalSourceMimeType: 'text/html',
      compiledRenderText: '<html><body><div>v1</div></body></html>',
      compiledRenderMimeType: 'text/html',
      compiledRenderStoragePath: null,
      sourcePrompt: 'Show the phase portrait.',
      generationModel: 'gpt-4o-mini',
      generationMetadata: { warnings: [] },
      integrationState: 'nested_only',
      isLatestVersion: true,
      versionNumber: 1,
    });

    mockChatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Phase portrait v2',
              description: 'Refined HTML app.',
              artifact_type: 'html_app',
              content: '<!DOCTYPE html><html><body><div>v2 with controls</div></body></html>',
            }),
          },
        },
      ],
    });

    const refined = await refineVisualization(
      {
        getConvo: methods.getConvo,
        getMessages: methods.getMessages,
        getMessage: methods.getMessage,
        createVisualization: methods.createVisualization,
        listVisualizations: methods.listVisualizations,
        listVisualizationVersions: methods.listVisualizationVersions,
        getVisualization: methods.getVisualization,
        updateVisualization: methods.updateVisualization,
        setVisualizationLatestVersion: methods.setVisualizationLatestVersion,
        getLatestVisualizationVersion: methods.getLatestVisualizationVersion,
        listProjectSources: methods.listProjectSources,
        getFiles: methods.getFiles,
      },
      userId,
      {
        visualizationId: original.visualizationId,
        instruction: 'Add controls that let the user vary the starting point.',
      },
    );

    const originalAfter = await methods.getVisualization(userId, original.visualizationId, true);
    const versions = await methods.listVisualizationVersions(
      userId,
      refined.rootVisualizationId ?? refined.visualizationId,
    );

    expect(refined.versionNumber).toBe(2);
    expect(refined.isLatestVersion).toBe(true);
    expect(refined.sourcePrompt).toContain('Refinement instruction: Add controls');
    expect(refined.canonicalSourceText).toContain('v2 with controls');
    expect(originalAfter?.isLatestVersion).toBe(false);
    expect(versions).toHaveLength(2);
  });

  it('integrates, renders, and soft-deletes a visualization while preserving lineage', async () => {
    const original = await methods.createVisualization(userId, {
      projectId: null,
      conversationId,
      parentMessageId: 'message-visual-1',
      anchorStart: 2,
      anchorEnd: 15,
      anchorText: 'phase portrait',
      anchorContextBefore: 'A ',
      anchorContextAfter: ' shows how trajectories move.',
      anchorPath: null,
      inlineThreadId: null,
      title: 'Phase portrait v1',
      description: 'Original HTML app.',
      artifactType: 'html_app',
      status: 'ready',
      storageMode: 'db_inline',
      canonicalSourceText: '<html><body><div>v1</div></body></html>',
      canonicalSourceMimeType: 'text/html',
      compiledRenderText: '<html><body><div>v1</div></body></html>',
      compiledRenderMimeType: 'text/html',
      compiledRenderStoragePath: null,
      sourcePrompt: 'Original prompt',
      generationModel: 'gpt-4o-mini',
      generationMetadata: { warnings: [] },
      integrationState: 'nested_only',
      isLatestVersion: false,
      versionNumber: 1,
    });

    const latest = await methods.createVisualization(userId, {
      projectId: null,
      conversationId,
      parentMessageId: 'message-visual-1',
      anchorStart: 2,
      anchorEnd: 15,
      anchorText: 'phase portrait',
      anchorContextBefore: 'A ',
      anchorContextAfter: ' shows how trajectories move.',
      anchorPath: null,
      inlineThreadId: null,
      parentVisualizationId: original.visualizationId,
      rootVisualizationId: original.rootVisualizationId ?? original.visualizationId,
      title: 'Phase portrait v2',
      description: 'Latest HTML app.',
      artifactType: 'html_app',
      status: 'ready',
      storageMode: 'db_inline',
      canonicalSourceText: '<html><body><div>v2</div></body></html>',
      canonicalSourceMimeType: 'text/html',
      compiledRenderText: '<html><body><div>v2</div></body></html>',
      compiledRenderMimeType: 'text/html',
      compiledRenderStoragePath: null,
      sourcePrompt: 'Latest prompt',
      generationModel: 'gpt-4o-mini',
      generationMetadata: { warnings: [] },
      integrationState: 'nested_only',
      isLatestVersion: true,
      versionNumber: 2,
    });
    await methods.setVisualizationLatestVersion(
      userId,
      latest.rootVisualizationId ?? latest.visualizationId,
      latest.visualizationId,
    );

    const integrated = await integrateVisualization(
      {
        getConvo: methods.getConvo,
        getMessages: methods.getMessages,
        getMessage: methods.getMessage,
        createVisualization: methods.createVisualization,
        listVisualizations: methods.listVisualizations,
        listVisualizationVersions: methods.listVisualizationVersions,
        getVisualization: methods.getVisualization,
        updateVisualization: methods.updateVisualization,
        setVisualizationLatestVersion: methods.setVisualizationLatestVersion,
        getLatestVisualizationVersion: methods.getLatestVisualizationVersion,
        listProjectSources: methods.listProjectSources,
        getFiles: methods.getFiles,
      },
      userId,
      {
        visualizationId: latest.visualizationId,
        messageId: 'message-visual-1',
      },
    );

    expect(integrated?.integrationState).toBe('integrated');

    const renderPayload = await getVisualizationRenderPayload(
      {
        getConvo: methods.getConvo,
        getMessages: methods.getMessages,
        getMessage: methods.getMessage,
        createVisualization: methods.createVisualization,
        listVisualizations: methods.listVisualizations,
        listVisualizationVersions: methods.listVisualizationVersions,
        getVisualization: methods.getVisualization,
        updateVisualization: methods.updateVisualization,
        setVisualizationLatestVersion: methods.setVisualizationLatestVersion,
        getLatestVisualizationVersion: methods.getLatestVisualizationVersion,
        listProjectSources: methods.listProjectSources,
        getFiles: methods.getFiles,
      },
      userId,
      latest.visualizationId,
    );

    expect(renderPayload.mimeType).toBe('text/html');
    expect(typeof renderPayload.body).toBe('string');
    expect(renderPayload.body).toContain('v2');

    const deleted = await deleteVisualization(
      {
        getConvo: methods.getConvo,
        getMessages: methods.getMessages,
        getMessage: methods.getMessage,
        createVisualization: methods.createVisualization,
        listVisualizations: methods.listVisualizations,
        listVisualizationVersions: methods.listVisualizationVersions,
        getVisualization: methods.getVisualization,
        updateVisualization: methods.updateVisualization,
        setVisualizationLatestVersion: methods.setVisualizationLatestVersion,
        getLatestVisualizationVersion: methods.getLatestVisualizationVersion,
        listProjectSources: methods.listProjectSources,
        getFiles: methods.getFiles,
      },
      userId,
      latest.visualizationId,
    );

    const originalAfter = await methods.getVisualization(userId, original.visualizationId, true);

    expect(deleted?.deletedAt).toBeTruthy();
    expect(deleted?.status).toBe('archived');
    expect(originalAfter?.isLatestVersion).toBe(true);
  });
});
