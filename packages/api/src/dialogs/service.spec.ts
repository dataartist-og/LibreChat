import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { RepoContext } from './repo';
import {
  createDialog,
  createDialogCell,
  createDialogClarification,
  createDialogVisualization,
  createStarterDialog,
  executeDialogCell,
  getDialogTutorWorkspace,
  runDialogTutorAction,
} from './service';
import { getLearnerWorkspace } from '~/learners/service';
import { createStudyDocumentFromFile } from '~/documents/service';

const mockChatCreate = jest.fn();
const mockPersistVisualizationPayload = jest.fn();
const mockEnsureRepoContext = jest.fn();
const mockExecuteInKernel = jest.fn();

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

jest.mock('./repo', () => ({
  ensureRepoContext: (...args: unknown[]) => mockEnsureRepoContext(...args),
}));

jest.mock('./kernel', () => ({
  executeInKernel: (...args: unknown[]) => mockExecuteInKernel(...args),
  closeKernelSession: jest.fn(),
}));

describe('dialog service', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const projectId = 'dialog-project-1';
  const repoContext: RepoContext = {
    repoUrl: 'https://github.com/tristandeleu/jax-dag-gflownet',
    repoSlug: 'tristandeleu/jax-dag-gflownet',
    repoPath: '/tmp/repos/tristandeleu__jax-dag-gflownet',
    readmeMarkdown: '# jax-dag-gflownet\n\nTrain DAG GFlowNets with JAX.',
    summary: 'Train DAG GFlowNets with JAX.',
    treeLines: ['README.md', 'train.py', 'gflownet/', 'gflownet/env.py'],
    importantPaths: ['train.py', 'gflownet/env.py', 'gflownet/models.py'],
    previews: [
      {
        path: 'train.py',
        content: 'def main():\n    print("training")\n',
      },
    ],
  };
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
    mockEnsureRepoContext.mockReset();
    mockExecuteInKernel.mockReset();

    mockEnsureRepoContext.mockResolvedValue(repoContext);
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

  async function createSourceFile(text: string) {
    const fileId = new mongoose.Types.ObjectId().toString();
    const file = await methods.createFile(
      {
        file_id: fileId,
        user: new mongoose.Types.ObjectId(userId),
        projectId,
        filename: '2202.13903.pdf',
        filepath: `/tmp/${fileId}.pdf`,
        type: 'application/pdf',
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

  async function createPaperWorkspace() {
    const file = await createSourceFile(
      [
        '# Bayesian Structure Learning with Generative Flow Networks',
        '',
        '## Abstract',
        '',
        'We learn posterior distributions over DAGs with a GFlowNet objective.',
        '',
        '## Method',
        '',
        'We define a trajectory balance objective over graph construction paths.',
      ].join('\n'),
    );

    return createStudyDocumentFromFile(methods, userId, {
      sourceFileId: file.file_id,
      projectId,
      title: 'Bayesian Structure Learning with Generative Flow Networks',
    });
  }

  it('initializes a combined tutor graph and materializes only the active step', async () => {
    const documentWorkspace = await createPaperWorkspace();

    const workspace = await createStarterDialog(methods, userId, {
      documentId: documentWorkspace.document.documentId,
      repoUrl: repoContext.repoUrl,
      projectId,
    });
    const tutor = await getDialogTutorWorkspace(methods, userId, workspace.dialog.dialogId);
    const activeNode = tutor.nodes.find((node) => node.nodeId === tutor.tutorState?.activeNodeId);

    expect(workspace.imports.map((dialogImport) => dialogImport.sourceType).sort()).toEqual([
      'paper',
      'repository',
    ]);
    expect(workspace.sourceMaps.length).toBeGreaterThan(0);
    expect(workspace.cells).toHaveLength(3);
    expect(workspace.cells.map((cell) => cell.metadataJson?.authoredBy)).toEqual([
      'tutor',
      'tutor',
      'tutor',
    ]);
    expect(workspace.cells.some((cell) => cell.metadataJson?.cellRole === 'checkpoint')).toBe(true);
    expect(tutor.nodes.map((node) => node.nodeType)).toEqual(
      expect.arrayContaining(['concept', 'implementation', 'bridge', 'verification', 'synthesis']),
    );
    expect(activeNode?.nodeType).toBe('bridge');
    expect(activeNode?.status).toBe('in_progress');
  });

  it('uses model-generated planner output when a structured plan is returned', async () => {
    const documentWorkspace = await createPaperWorkspace();

    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              nodes: [
                {
                  node_type: 'concept',
                  title: 'Posterior foundations',
                  objective: 'Understand how the posterior over DAGs is defined in the paper.',
                  priority: 5,
                  planner_notes: 'Start from the posterior before inspecting files.',
                  anchor_labels: ['Method'],
                },
                {
                  node_type: 'implementation',
                  title: 'Training entry path',
                  objective: 'Trace the main training entry path in the repository.',
                  priority: 15,
                  planner_notes: 'Follow train.py into the main modules.',
                  anchor_labels: ['train.py'],
                },
                {
                  node_type: 'synthesis',
                  title: 'Posterior-to-code synthesis',
                  objective: 'Explain how the posterior objective maps onto the training stack.',
                  priority: 50,
                  planner_notes: 'Close with a theory-to-code teach-back.',
                  anchor_labels: ['Method', 'train.py'],
                },
              ],
            }),
          },
        },
      ],
    });

    const workspace = await createStarterDialog(methods, userId, {
      documentId: documentWorkspace.document.documentId,
      repoUrl: repoContext.repoUrl,
      projectId,
    });
    const tutor = await getDialogTutorWorkspace(methods, userId, workspace.dialog.dialogId);

    expect(tutor.nodes.map((node) => node.title)).toEqual(
      expect.arrayContaining([
        'Posterior foundations',
        'Training entry path',
        'Posterior-to-code synthesis',
      ]),
    );
  });

  it('uses model-generated tutor step content when a structured step is returned', async () => {
    mockChatCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                nodes: [],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                note_title: 'State abstraction walkthrough',
                instruction_markdown:
                  '## State abstraction walkthrough\n\nFocus on how the environment stores the partial DAG before looking at the rest of the training loop.',
                checkpoint_prompt:
                  'Explain what the environment state must store before an action can be chosen.',
                code_paths: ['gflownet/env.py'],
              }),
            },
          },
        ],
      });

    const workspace = await createStarterDialog(methods, userId, {
      repoUrl: repoContext.repoUrl,
      projectId,
    });
    const codeCell = workspace.cells.find((cell) => cell.cellType === 'code');
    const checkpointCell = workspace.cells.find(
      (cell) => cell.cellType === 'prompt' && cell.metadataJson?.cellRole === 'checkpoint',
    );

    expect(workspace.cells[0]?.title).toBe('State abstraction walkthrough');
    expect(workspace.cells[0]?.sourceMarkdown).toContain(
      'Focus on how the environment stores the partial DAG',
    );
    expect(codeCell?.sourceCode).toContain('gflownet/env.py');
    expect(checkpointCell?.metadataJson?.checkpointPrompt).toBe(
      'Explain what the environment state must store before an action can be chosen.',
    );
  });

  it('breaks down the active node into child plan nodes and activates the first child', async () => {
    const documentWorkspace = await createPaperWorkspace();
    const starter = await createStarterDialog(methods, userId, {
      documentId: documentWorkspace.document.documentId,
      repoUrl: repoContext.repoUrl,
      projectId,
    });
    const beforeTutor = await getDialogTutorWorkspace(methods, userId, starter.dialog.dialogId);
    const activeNodeId = beforeTutor.tutorState?.activeNodeId;

    if (!activeNodeId) {
      throw new Error('Expected active node');
    }

    const response = await runDialogTutorAction(methods, userId, starter.dialog.dialogId, {
      action: 'break_down',
    });
    const parentNode = response.tutor.nodes.find((node) => node.nodeId === activeNodeId);
    const childNodes = response.tutor.nodes.filter((node) => node.parentNodeId === activeNodeId);

    expect(parentNode?.status).toBe('needs_breakdown');
    expect(childNodes.length).toBeGreaterThanOrEqual(2);
    expect(response.tutor.tutorState?.activeNodeId).toBe(childNodes[0]?.nodeId);
    expect(response.workspace.cells.length).toBeGreaterThan(starter.cells.length);
  });

  it('routes checkpoint prompt execution into evaluator mode and advances after understood', async () => {
    const starter = await createStarterDialog(methods, userId, {
      repoUrl: repoContext.repoUrl,
      projectId,
    });
    const tutor = await getDialogTutorWorkspace(methods, userId, starter.dialog.dialogId);
    const activeNodeId = tutor.tutorState?.activeNodeId;
    const checkpointCell = starter.cells.find(
      (cell) => cell.cellType === 'prompt' && cell.metadataJson?.cellRole === 'checkpoint',
    );

    if (!activeNodeId || !checkpointCell) {
      throw new Error('Expected checkpoint cell fixture');
    }

    await methods.updateDialogCell(userId, checkpointCell.cellId, {
      sourceMarkdown:
        'I would start from train.py, trace the entrypoint, and explain how the environment is wired into the model.',
    });

    mockChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              passed: true,
              score: 0.84,
              feedback:
                'The response identifies the right entry point and explains the intended inspection path.',
              next_step: 'Move on to the next node and verify the flow with a concrete code check.',
            }),
          },
        },
      ],
    });

    const executedWorkspace = await executeDialogCell(
      methods,
      userId,
      starter.dialog.dialogId,
      checkpointCell.cellId,
    );
    const evaluatedTutor = await getDialogTutorWorkspace(methods, userId, starter.dialog.dialogId);
    const updatedActiveNode = evaluatedTutor.nodes.find((node) => node.nodeId === activeNodeId);
    const outputCell = executedWorkspace.cells.find(
      (cell) =>
        cell.cellType === 'output' && cell.metadataJson?.sourceCellId === checkpointCell.cellId,
    );

    expect(outputCell?.sourceMarkdown).toContain('Checkpoint Feedback');
    expect(updatedActiveNode?.masteryEvidenceJson).toMatchObject({
      checkpointPassed: true,
    });

    const advanced = await runDialogTutorAction(methods, userId, starter.dialog.dialogId, {
      action: 'understood',
      nodeId: activeNodeId,
    });
    const masteredNode = advanced.tutor.nodes.find((node) => node.nodeId === activeNodeId);

    expect(masteredNode?.status).toBe('mastered');
    expect(advanced.tutor.tutorState?.activeNodeId).not.toBe(activeNodeId);
  });

  it('records code execution evidence on the active implementation node', async () => {
    mockExecuteInKernel.mockResolvedValueOnce({
      stdout: 'train.py\n',
      stderr: '',
      error: null,
      traceback: null,
      result: { repr: "'ok'" },
    });

    const starter = await createStarterDialog(methods, userId, {
      repoUrl: repoContext.repoUrl,
      projectId,
    });
    const tutor = await getDialogTutorWorkspace(methods, userId, starter.dialog.dialogId);
    const activeNodeId = tutor.tutorState?.activeNodeId;
    const codeCell = starter.cells.find((cell) => cell.cellType === 'code');

    if (!activeNodeId || !codeCell) {
      throw new Error('Expected implementation code cell fixture');
    }

    await executeDialogCell(methods, userId, starter.dialog.dialogId, codeCell.cellId);
    const updatedTutor = await getDialogTutorWorkspace(methods, userId, starter.dialog.dialogId);
    const activeNode = updatedTutor.nodes.find((node) => node.nodeId === activeNodeId);

    expect(activeNode?.masteryEvidenceJson).toMatchObject({
      codeRuns: 1,
      codeSuccesses: 1,
      lastCodeStatus: 'succeeded',
    });

    const learner = await getLearnerWorkspace(methods, userId);
    expect(learner.recentEvents[0]?.eventType).toBe('code_execution_succeeded');
  });

  it('records failed execution output when kernel execution errors', async () => {
    mockExecuteInKernel.mockRejectedValueOnce(new Error('kernel session exited unexpectedly'));

    const initialWorkspace = await createDialog(methods, userId, {
      projectId,
      title: 'Execution failure dialog',
    });
    const updatedWorkspace = await createDialogCell(
      methods,
      userId,
      initialWorkspace.dialog.dialogId,
      {
        cellType: 'code',
        title: 'Inspect repo',
        sourceCode: 'print(repo_root)',
      },
    );
    const codeCell = updatedWorkspace.cells.find((cell) => cell.cellType === 'code');

    if (!codeCell) {
      throw new Error('Expected code cell fixture');
    }

    const workspace = await executeDialogCell(
      methods,
      userId,
      initialWorkspace.dialog.dialogId,
      codeCell.cellId,
    );

    const latestRun = workspace.executionRuns[0];
    const outputCell = workspace.cells.find(
      (cell) => cell.cellType === 'output' && cell.metadataJson?.sourceCellId === codeCell.cellId,
    );

    expect(latestRun?.status).toBe('failed');
    expect(outputCell?.sourceMarkdown).toContain('kernel session exited unexpectedly');
  });

  it('creates dialog-cell clarifications and visualizations anchored to note content', async () => {
    mockChatCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'A DAG is a directed acyclic graph used here to represent structure.',
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
            },
          },
        ],
      });

    const workspace = await createDialog(methods, userId, {
      projectId,
      title: 'Anchored study dialog',
    });
    const noteCell = workspace.cells.find((cell) => cell.cellType === 'note');

    if (!noteCell) {
      throw new Error('Expected note cell fixture');
    }

    const anchor = {
      cellId: noteCell.cellId,
      anchorText: 'dialog',
      anchorContextBefore: 'Use this ',
      anchorContextAfter: ' to mix notes, code, and pedagogical prompts.',
      startOffset: 20,
      endOffset: 26,
    };

    const clarification = await createDialogClarification(methods, userId, {
      dialogId: workspace.dialog.dialogId,
      cellId: noteCell.cellId,
      anchor,
      clarificationQuestion: 'What is this dialog for?',
    });
    const visualization = await createDialogVisualization(
      methods,
      userId,
      {
        dialogId: workspace.dialog.dialogId,
        cellId: noteCell.cellId,
        anchor,
        prompt: 'Visualize the relationship between note, code, and prompt cells.',
        artifactType: 'svg',
      },
      {},
    );

    expect(clarification.cellId).toBe(noteCell.cellId);
    expect(clarification.anchor.anchorText).toBe('dialog');
    expect(visualization.cellId).toBe(noteCell.cellId);
    expect(visualization.rootVisualizationId).toBe(visualization.visualizationId);
    expect(visualization.compiledRenderStoragePath).toBe(
      `uploads/visualizations/${visualization.visualizationId}.svg`,
    );
  });
});
