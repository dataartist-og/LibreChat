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

describe('Project and Clarification Methods', () => {
  const userId = 'project-user';
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

  it('supports project CRUD including archive', async () => {
    const defaultProject = await methods.ensureDefaultProject(userId);
    const createdProject = await methods.createProject(userId, {
      name: 'Linear Algebra',
      description: 'Matrices and proofs',
      color: '#2563eb',
    });

    const listedProjects = await methods.listProjects(userId);
    expect(listedProjects.map((project) => project.name)).toEqual(
      expect.arrayContaining([defaultProject.name, createdProject.name]),
    );

    const updatedProject = await methods.updateProject(userId, createdProject.projectId, {
      name: 'Advanced Linear Algebra',
    });
    expect(updatedProject?.name).toBe('Advanced Linear Algebra');

    const archivedProject = await methods.archiveProject(userId, createdProject.projectId);
    expect(archivedProject?.archivedAt).toBeTruthy();

    const activeProjects = await methods.listProjects(userId);
    expect(activeProjects.find((project) => project.projectId === createdProject.projectId)).toBeUndefined();
  });

  it('supports project source CRUD', async () => {
    const project = await methods.createProject(userId, {
      name: 'Quantum',
    });

    const createdSource = await methods.createProjectSource(userId, {
      projectId: project.projectId,
      sourceType: 'note',
      title: 'Lecture note',
      noteBody: 'Wavefunctions collapse under observation.',
    });
    expect(createdSource.projectId).toBe(project.projectId);

    const listedSources = await methods.listProjectSources(userId, project.projectId);
    expect(listedSources).toHaveLength(1);
    expect(listedSources[0].title).toBe('Lecture note');

    const updatedSource = await methods.updateProjectSource(userId, createdSource.sourceId, {
      title: 'Lecture note summary',
      noteBody: 'Wavefunctions do not literally collapse in every interpretation.',
    });
    expect(updatedSource?.title).toBe('Lecture note summary');

    const deletedSource = await methods.deleteProjectSource(userId, createdSource.sourceId);
    expect(deletedSource?.sourceId).toBe(createdSource.sourceId);
    expect(await methods.listProjectSources(userId, project.projectId)).toHaveLength(0);
  });

  it('supports clarification create, list, and update', async () => {
    const project = await methods.createProject(userId, {
      name: 'Biology',
    });

    const clarification = await methods.createClarification(userId, {
      projectId: project.projectId,
      conversationId: 'conversation-1',
      parentMessageId: 'message-1',
      anchorStart: 10,
      anchorEnd: 22,
      anchorText: 'mitochondria',
      anchorContextBefore: 'The ',
      anchorContextAfter: ' is the powerhouse.',
      clarificationQuestion: 'What does this organelle do?',
      clarificationAnswer: 'It generates ATP for the cell.',
      status: 'active',
    });

    const parentClarifications = await methods.listClarifications(userId, {
      conversationId: 'conversation-1',
      parentMessageId: 'message-1',
    });
    expect(parentClarifications).toHaveLength(1);
    expect(parentClarifications[0].clarificationId).toBe(clarification.clarificationId);

    const conversationClarifications = await methods.listClarifications(userId, {
      conversationId: 'conversation-1',
    });
    expect(conversationClarifications).toHaveLength(1);

    const updatedClarification = await methods.updateClarification(userId, clarification.clarificationId, {
      clarificationQuestion: 'What is ATP production here?',
      clarificationAnswer: 'This describes the cell using mitochondria to produce energy-rich ATP molecules.',
      status: 'collapsed',
    });

    expect(updatedClarification?.clarificationQuestion).toBe('What is ATP production here?');
    expect(updatedClarification?.status).toBe('collapsed');
  });

  it('allows clarification boundary contexts to be empty strings', async () => {
    const project = await methods.createProject(userId, {
      name: 'Calculus',
    });

    const clarification = await methods.createClarification(userId, {
      projectId: project.projectId,
      conversationId: 'conversation-2',
      parentMessageId: 'message-2',
      anchorStart: 0,
      anchorEnd: 5,
      anchorText: 'Limit',
      anchorContextBefore: '',
      anchorContextAfter: '',
      clarificationQuestion: 'What does limit mean here?',
      clarificationAnswer: 'It describes the value a function approaches.',
      status: 'active',
    });

    expect(clarification.anchorContextBefore).toBe('');
    expect(clarification.anchorContextAfter).toBe('');
  });
});
