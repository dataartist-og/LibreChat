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

describe('Dialog Methods', () => {
  const userId = 'dialog-user';
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

  it('supports dialog CRUD, ordered typed cells, and execution runs', async () => {
    const dialog = await methods.createDialog(userId, {
      title: 'Bayesian DAG study',
      description: 'Learn the paper and the repo together.',
      teachingMode: 'teach_me',
      selectedTrajectoryKey: 'bridged_path',
      metadataJson: {
        trajectories: [
          { key: 'bridged_path', title: 'Bridged', description: '', prompt: '', focus: [] },
        ],
      },
    });

    await methods.createDialogCell(userId, {
      dialogId: dialog.dialogId,
      position: 2,
      cellType: 'prompt',
      title: 'Ask for a path',
      sourceMarkdown: 'Where should I start?',
    });
    await methods.createDialogCell(userId, {
      dialogId: dialog.dialogId,
      position: 1,
      cellType: 'note',
      title: 'Orientation',
      sourceMarkdown: '# Welcome',
    });
    await methods.createDialogCell(userId, {
      dialogId: dialog.dialogId,
      position: 3,
      cellType: 'code',
      title: 'Inspect repo',
      sourceCode: 'print(repo_root)',
    });

    const listedDialogs = await methods.listDialogs(userId);
    const orderedCells = await methods.listDialogCells(userId, dialog.dialogId);
    const promptCell = orderedCells.find((cell) => cell.cellType === 'prompt');

    if (!promptCell) {
      throw new Error('Expected prompt cell fixture');
    }

    const run = await methods.createDialogExecutionRun(userId, {
      dialogId: dialog.dialogId,
      cellId: promptCell.cellId,
      kernelSessionId: `prompt:${dialog.dialogId}`,
      status: 'running',
      startedAt: new Date(),
    });
    const updatedRun = await methods.updateDialogExecutionRun(userId, run.runId, {
      status: 'succeeded',
      resultJson: { content: 'Start with the bridge between theory and code.' },
      finishedAt: new Date(),
    });

    expect(listedDialogs).toHaveLength(1);
    expect(orderedCells.map((cell) => cell.cellType)).toEqual(['note', 'prompt', 'code']);
    expect(updatedRun?.status).toBe('succeeded');
    expect(updatedRun?.resultJson).toEqual({
      content: 'Start with the bridge between theory and code.',
    });
  });

  it('supports dialog imports, source maps, clarifications, and visualizations', async () => {
    const dialog = await methods.createDialog(userId, {
      title: 'Combined study dialog',
      teachingMode: 'hint_mode',
    });
    const noteCell = await methods.createDialogCell(userId, {
      dialogId: dialog.dialogId,
      position: 1,
      cellType: 'note',
      title: 'Paper overview',
      sourceMarkdown: 'DAG GFlowNets define a posterior over graph structures.',
    });

    const paperImport = await methods.createDialogImport(userId, {
      dialogId: dialog.dialogId,
      sourceType: 'paper',
      sourceRef: 'document-1',
      title: 'Bayesian Structure Learning with Generative Flow Networks',
    });
    const repoImport = await methods.createDialogImport(userId, {
      dialogId: dialog.dialogId,
      sourceType: 'repository',
      sourceRef: 'https://github.com/tristandeleu/jax-dag-gflownet',
      title: 'tristandeleu/jax-dag-gflownet',
    });
    const sourceMap = await methods.createDialogSourceMap(userId, {
      dialogId: dialog.dialogId,
      paperAnchor: 'Trajectory balance objective',
      repoPath: 'train.py',
      mappingType: 'starter_hypothesis',
      confidence: 0.78,
      notesMarkdown: 'Inspect the training entrypoint first.',
    });
    const clarification = await methods.createDialogClarification(userId, {
      dialogId: dialog.dialogId,
      cellId: noteCell.cellId,
      anchor: {
        cellId: noteCell.cellId,
        anchorText: 'posterior',
        anchorContextBefore: 'define a ',
        anchorContextAfter: ' over graph structures.',
        startOffset: 21,
        endOffset: 30,
      },
      clarificationQuestion: 'What is the posterior here?',
      clarificationAnswer: 'It is the distribution over candidate DAGs given the observed data.',
    });
    const visualization = await methods.createDialogVisualization(userId, {
      dialogId: dialog.dialogId,
      cellId: noteCell.cellId,
      anchor: clarification.anchor,
      title: 'Posterior intuition',
      description: 'A small SVG showing candidate DAG mass.',
      artifactType: 'svg',
      status: 'ready',
      storageMode: 'db_inline',
      canonicalSourceText: '<svg viewBox="0 0 10 10"></svg>',
      canonicalSourceMimeType: 'image/svg+xml',
      compiledRenderText: '<svg viewBox="0 0 10 10"></svg>',
      compiledRenderMimeType: 'image/svg+xml',
      sourcePrompt: 'Visualize posterior mass over DAG candidates.',
      generationModel: 'gpt-4o-mini',
      generationMetadata: {
        warnings: [],
      },
      integrationState: 'integrated',
      isLatestVersion: true,
      versionNumber: 1,
    });

    const listedImports = await methods.listDialogImports(userId, dialog.dialogId);
    const listedSourceMaps = await methods.listDialogSourceMaps(userId, dialog.dialogId);
    const listedClarifications = await methods.listDialogClarifications(userId, {
      dialogId: dialog.dialogId,
    });
    const listedVisualizations = await methods.listDialogVisualizations(userId, {
      dialogId: dialog.dialogId,
    });

    expect(listedImports.map((dialogImport) => dialogImport.importId)).toEqual([
      paperImport.importId,
      repoImport.importId,
    ]);
    expect(listedSourceMaps[0]?.mapId).toBe(sourceMap.mapId);
    expect(listedClarifications[0]?.clarificationId).toBe(clarification.clarificationId);
    expect(listedVisualizations[0]?.visualizationId).toBe(visualization.visualizationId);
    expect(listedVisualizations[0]?.integrationState).toBe('integrated');
  });

  it('supports persisted tutor state and dialog plan nodes', async () => {
    const dialog = await methods.createDialog(userId, {
      title: 'Adaptive tutor dialog',
      teachingMode: 'teach_me',
      selectedTrajectoryKey: 'theory_first',
    });

    const conceptNode = await methods.createDialogPlanNode(userId, {
      dialogId: dialog.dialogId,
      nodeType: 'concept',
      title: 'Paper foundations',
      objective: 'Understand the key assumptions and objects.',
      sourceAnchors: [
        {
          sourceType: 'paper',
          sourceRef: 'document-1',
          label: 'Abstract',
          detail: 'paper section',
        },
      ],
      depth: 0,
      priority: 10,
    });
    const implementationNode = await methods.createDialogPlanNode(userId, {
      dialogId: dialog.dialogId,
      parentNodeId: conceptNode.nodeId,
      dependencyNodeIds: [conceptNode.nodeId],
      nodeType: 'implementation',
      title: 'Entry point',
      objective: 'Find the first execution path.',
      sourceAnchors: [
        {
          sourceType: 'repository',
          sourceRef: 'https://github.com/example/repo',
          label: 'train.py',
          detail: 'repository path',
        },
      ],
      depth: 1,
      priority: 101,
    });
    await methods.createDialogTutorState(userId, {
      dialogId: dialog.dialogId,
      selectedTrajectoryKey: 'theory_first',
      activeNodeId: conceptNode.nodeId,
      rootNodeIds: [conceptNode.nodeId],
      learnerModelJson: {
        confidenceByNode: {},
      },
      planVersion: 1,
      lastTutorAction: 'initialized',
      completionState: 'active',
    });

    const listedNodes = await methods.listDialogPlanNodes(userId, dialog.dialogId);
    const updatedNode = await methods.updateDialogPlanNode(userId, conceptNode.nodeId, {
      status: 'mastered',
      masteryEvidenceJson: {
        confidence: 0.81,
      },
    });
    const tutorState = await methods.getDialogTutorState(userId, dialog.dialogId);
    const updatedTutorState = await methods.updateDialogTutorState(userId, dialog.dialogId, {
      activeNodeId: implementationNode.nodeId,
      lastTutorAction: 'advance',
    });

    expect(listedNodes.map((node) => node.nodeId)).toEqual([
      conceptNode.nodeId,
      implementationNode.nodeId,
    ]);
    expect(updatedNode?.status).toBe('mastered');
    expect(updatedNode?.masteryEvidenceJson).toEqual({ confidence: 0.81 });
    expect(tutorState?.activeNodeId).toBe(conceptNode.nodeId);
    expect(updatedTutorState?.activeNodeId).toBe(implementationNode.nodeId);
    expect(updatedTutorState?.lastTutorAction).toBe('advance');
  });
});
