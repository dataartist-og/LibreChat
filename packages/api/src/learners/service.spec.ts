import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import {
  getLearnerWorkspace,
  recordChatTurnLearnerObservation,
  recordLearnerObservation,
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
    models: {
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
  })),
}));

describe('learner service', () => {
  const userId = new mongoose.Types.ObjectId().toString();
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
  });

  it('records learner observations into profile, nodes, edges, and events', async () => {
    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              profile_summary_markdown:
                'The learner is connecting Bayesian structure learning concepts to implementation anchors.',
              knowledge_level_summary:
                'Conceptual understanding is emerging, and implementation fluency is starting to solidify.',
              current_focus_labels: ['posterior over DAGs', 'training entry point'],
              learning_preferences: {
                pacing: 'adaptive',
                prefers_bridged_examples: true,
              },
              nodes: [
                {
                  label: 'Posterior over DAGs',
                  category: 'concept',
                  mastery: 0.52,
                  confidence: 0.64,
                  evidence_summary: 'A checkpoint connected the posterior to graph scoring.',
                  aliases: ['graph posterior'],
                  source_labels: ['posterior'],
                },
                {
                  label: 'Training entry point',
                  category: 'implementation',
                  mastery: 0.38,
                  confidence: 0.55,
                  evidence_summary: 'The learner traced train.py as the entry point.',
                  aliases: [],
                  source_labels: ['train.py'],
                },
              ],
              edges: [
                {
                  from_label: 'Posterior over DAGs',
                  to_label: 'Training entry point',
                  relation: 'bridges',
                  weight: 0.66,
                },
              ],
            }),
          },
        },
      ],
    });

    const workspace = await recordLearnerObservation(methods, userId, {
      surface: 'dialog',
      eventType: 'checkpoint_passed',
      sourceId: 'dialog-1',
      sourceTitle: 'Posterior checkpoint',
      summary:
        'The learner passed a checkpoint that linked posterior reasoning to code inspection.',
      conceptHints: [
        {
          label: 'Posterior over DAGs',
          category: 'concept',
          mastery: 0.5,
          confidence: 0.6,
          evidenceSummary: 'Posterior checkpoint',
          sourceLabel: 'posterior',
        },
      ],
      relationHints: [
        {
          fromLabel: 'Posterior over DAGs',
          toLabel: 'Training entry point',
          relation: 'bridges',
          weight: 0.6,
        },
      ],
    });

    expect(workspace.profile.knowledgeLevelSummary).toContain('Conceptual understanding');
    expect(workspace.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(['Posterior over DAGs', 'Training entry point']),
    );
    expect(workspace.edges[0]?.relation).toBe('bridges');
    expect(workspace.recentEvents[0]?.eventType).toBe('checkpoint_passed');

    const reloaded = await getLearnerWorkspace(methods, userId);
    expect(reloaded.profile.currentFocusLabels).toEqual(
      expect.arrayContaining(['posterior over DAGs', 'training entry point']),
    );
  });

  it('falls back to heuristic learner updates when the model returns no structured response', async () => {
    mockChatCreate.mockResolvedValueOnce({ choices: [] });

    const workspace = await recordLearnerObservation(methods, userId, {
      surface: 'document',
      eventType: 'document_clarification',
      sourceId: 'document-1',
      sourceTitle: 'Bayesian Structure Learning',
      summary: 'The learner asked what the posterior means in the abstract.',
      conceptHints: [
        {
          label: 'posterior meaning',
          category: 'concept',
          mastery: 0.22,
          confidence: 0.41,
          evidenceSummary: 'Asked for a definition of the posterior.',
          sourceLabel: 'posterior',
        },
      ],
    });

    expect(workspace.nodes[0]?.label).toBe('posterior meaning');
    expect(workspace.profile.knowledgeLevelSummary).toContain('document');
    expect(workspace.recentEvents[0]?.surface).toBe('document');
  });

  it('records routine chat turns into learner memory', async () => {
    mockChatCreate.mockResolvedValueOnce({ choices: [] });

    const workspace = await recordChatTurnLearnerObservation(methods, userId, {
      conversationId: 'chat-1',
      conversationTitle: 'GFlowNet quick question',
      userText: 'Why do GFlowNets help Bayesian structure learning over DAGs?',
      assistantText:
        'They learn a sequential generative policy that produces DAGs with probability proportional to posterior weight, which improves coverage over many plausible graphs instead of only one solution.',
      endpoint: 'openAI',
      model: 'gpt-5',
    });

    expect(workspace).not.toBeNull();
    expect(workspace?.recentEvents[0]?.surface).toBe('chat');
    expect(workspace?.recentEvents[0]?.eventType).toBe('chat_turn_completed');
    expect(workspace?.recentEvents[0]?.sourceTitle).toBe('GFlowNet quick question');
    expect(workspace?.recentEvents[0]?.summary).toContain(
      'GFlowNets help Bayesian structure learning',
    );
  });
});
