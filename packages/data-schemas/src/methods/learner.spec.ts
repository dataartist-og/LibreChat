import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '../models';
import { createMethods } from './index';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

describe('Learner Methods', () => {
  const userId = 'learner-user';
  let mongoServer: MongoMemoryServer;
  let methods: ReturnType<typeof createMethods>;

  beforeAll(async () => {
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
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  it('creates a learner profile and persists graph entities', async () => {
    const profile = await methods.createLearnerProfile(userId, {
      profileSummaryMarkdown: 'The learner is building intuition for posterior estimation.',
      knowledgeLevelSummary: 'Early-stage understanding with emerging code confidence.',
      currentFocusLabels: ['posterior estimation'],
      lastUpdatedFromSurface: 'dialog',
    });

    const node = await methods.upsertLearnerKnowledgeNode(userId, {
      label: 'Posterior estimation',
      normalizedLabel: 'posterior estimation',
      category: 'concept',
      mastery: 0.42,
      confidence: 0.55,
      status: 'practicing',
      evidenceSummary: 'Checkpoint response connected the posterior to graph scoring.',
      aliases: ['posterior over DAGs'],
      sourceRefs: [
        {
          surface: 'dialog',
          sourceId: 'dialog-1',
          label: 'Posterior estimation',
        },
      ],
    });

    const nodeUpdate = await methods.upsertLearnerKnowledgeNode(userId, {
      learnerNodeId: node.learnerNodeId,
      label: 'Posterior estimation',
      normalizedLabel: 'posterior estimation',
      category: 'concept',
      mastery: 0.58,
      confidence: 0.66,
      status: 'solid',
      evidenceSummary: 'A code exercise reinforced the same concept.',
      aliases: ['posterior over DAGs', 'graph posterior'],
      sourceRefs: [
        {
          surface: 'document',
          sourceId: 'document-1',
          label: 'Abstract',
        },
      ],
    });

    const implementationNode = await methods.upsertLearnerKnowledgeNode(userId, {
      label: 'Training entry point',
      normalizedLabel: 'training entry point',
      category: 'implementation',
      mastery: 0.34,
      confidence: 0.49,
      status: 'emerging',
      evidenceSummary: 'The learner identified train.py as the first entry point.',
      sourceRefs: [
        {
          surface: 'dialog',
          sourceId: 'dialog-1',
          label: 'train.py',
        },
      ],
    });

    const edge = await methods.upsertLearnerKnowledgeEdge(userId, {
      fromNodeId: node.learnerNodeId,
      toNodeId: implementationNode.learnerNodeId,
      relation: 'bridges',
      weight: 0.61,
    });

    const event = await methods.createLearnerEvent(userId, {
      surface: 'dialog',
      eventType: 'checkpoint_passed',
      sourceId: 'dialog-1',
      sourceTitle: 'Posterior estimation',
      summary: 'The learner passed a posterior checkpoint.',
      appliedJson: {
        nodeIds: [node.learnerNodeId],
      },
    });

    const storedProfile = await methods.getLearnerProfile(userId);
    const nodes = await methods.listLearnerKnowledgeNodes(userId);
    const edges = await methods.listLearnerKnowledgeEdges(userId);
    const events = await methods.listLearnerEvents(userId, { limit: 10 });

    expect(profile.profileId).toBeTruthy();
    expect(storedProfile?.knowledgeLevelSummary).toContain('Early-stage');
    expect(nodeUpdate.evidenceCount).toBe(2);
    expect(nodes).toHaveLength(2);
    expect(edges[0]?.learnerEdgeId).toBe(edge.learnerEdgeId);
    expect(events[0]?.eventId).toBe(event.eventId);
  });
});
