import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import { integrateClarification, selectClarificationModel } from './service';

describe('selectClarificationModel', () => {
  const originalReverseProxy = process.env.OPENAI_REVERSE_PROXY;
  const originalInlineModel = process.env.INLINE_CLARIFICATION_MODEL;
  const originalOpenAIModel = process.env.OPENAI_MODEL;

  afterEach(() => {
    process.env.OPENAI_REVERSE_PROXY = originalReverseProxy;
    process.env.INLINE_CLARIFICATION_MODEL = originalInlineModel;
    process.env.OPENAI_MODEL = originalOpenAIModel;
  });

  it('prefers a supported proxy model when the default direct model is unavailable', () => {
    process.env.OPENAI_REVERSE_PROXY = 'http://127.0.0.1:10531/v1';
    delete process.env.INLINE_CLARIFICATION_MODEL;
    delete process.env.OPENAI_MODEL;

    expect(selectClarificationModel(['gpt-5.4-mini', 'gpt-5.4'])).toBe('gpt-5.4-mini');
  });
});

describe('integrateClarification', () => {
  const userId = 'clarification-user';
  const conversationId = '11111111-1111-4111-8111-111111111111';
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

  it('updates the parent message and records a message revision', async () => {
    const project = await methods.createProject(userId, {
      name: 'Thermodynamics',
    });

    await mongoose.models.Conversation.create({
      conversationId,
      user: userId,
      projectId: project.projectId,
      title: 'Entropy',
      endpoint: 'openAI',
    });

    await mongoose.models.Message.create({
      messageId: 'message-1',
      conversationId,
      parentMessageId: 'root',
      user: userId,
      sender: 'Assistant',
      isCreatedByUser: false,
      projectId: project.projectId,
      text: 'Entropy increases in isolated systems.',
    });

    const clarification = await methods.createClarification(userId, {
      projectId: project.projectId,
      conversationId,
      parentMessageId: 'message-1',
      anchorStart: 0,
      anchorEnd: 7,
      anchorText: 'Entropy',
      anchorContextBefore: 'Beginning of explanation.',
      anchorContextAfter: ' increases in isolated systems.',
      clarificationQuestion: 'What does entropy mean here?',
      clarificationAnswer: 'It measures how many microscopic configurations are compatible with the macroscopic state.',
      status: 'active',
    });

    const mergedText =
      'Entropy increases in isolated systems.\n\nIt measures how many microscopic configurations are compatible with the macroscopic state.';

    const updatedClarification = await integrateClarification(
      {
        getConvo: methods.getConvo,
        getMessages: methods.getMessages,
        getMessage: methods.getMessage,
        createClarification: methods.createClarification,
        listClarifications: methods.listClarifications,
        getClarification: methods.getClarification,
        updateClarification: methods.updateClarification,
        createMessageRevision: methods.createMessageRevision,
        listMessageRevisions: methods.listMessageRevisions,
        saveMessage: methods.saveMessage,
        listProjectSources: methods.listProjectSources,
        getFiles: methods.getFiles,
      },
      { userId },
      {
        clarificationId: clarification.clarificationId,
        mergedText,
      },
    );

    const updatedMessage = await methods.getMessage({
      user: userId,
      messageId: 'message-1',
    });
    expect(updatedMessage?.text).toBe(mergedText);

    const revisions = await methods.listMessageRevisions(userId, 'message-1');
    expect(revisions).toHaveLength(1);
    expect(revisions[0].previousText).toBe('Entropy increases in isolated systems.');
    expect(revisions[0].updatedText).toBe(mergedText);

    expect(updatedClarification?.status).toBe('integrated');
    expect(updatedClarification?.integratedAt).toBeTruthy();
  });
});
