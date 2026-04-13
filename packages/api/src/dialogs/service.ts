import crypto from 'node:crypto';
import OpenAI from 'openai';
import type {
  AllMethods,
  AppConfig,
  DialogPlanNodeStatus,
  DialogPlanNodeType,
  DialogTeachingMode,
  IDialogCell,
  IDialogCellAnchor,
  IDialogCellMetadata,
  IDialogClarification,
  IDialogExecutionRun,
  IDialogImport,
  IDialogPlanNode,
  IDialogPlanSourceAnchor,
  IDialogSourceMap,
  IDialogTrajectory,
  IDialogTutorState,
  IDialogVisualization,
  IDocumentRenderVersion,
  IStudyDialog,
  IStudyDocument,
  VisualizationArtifactType,
} from '@librechat/data-schemas';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getConfiguredOpenAIBaseURL } from '~/files/native';
import { getLearnerWorkspace, recordLearnerObservation, type LearnerWorkspace } from '~/learners';
import { sanitizeVisualizationByType } from '~/visualizations/sanitize';
import { loadVisualizationPayload, persistVisualizationPayload } from '~/visualizations/storage';
import { sanitizeTitle } from '~/utils/sanitizeTitle';
import { executeInKernel } from './kernel';
import { ensureRepoContext, type RepoContext } from './repo';

type DialogModelContext = {
  appConfig?: AppConfig;
};

type DialogWorkspace = {
  dialog: IStudyDialog;
  cells: IDialogCell[];
  imports: IDialogImport[];
  sourceMaps: IDialogSourceMap[];
  clarifications: IDialogClarification[];
  visualizations: IDialogVisualization[];
  executionRuns: IDialogExecutionRun[];
};

type DialogTutorWorkspace = {
  dialogId: string;
  tutorState: IDialogTutorState | null;
  nodes: IDialogPlanNode[];
};

type DialogTutorAction = 'advance' | 'understood' | 'break_down' | 'stuck' | 'skip';

type DialogTutorActionPayload = {
  action: DialogTutorAction;
  nodeId?: string | null;
};

type DialogTutorActionResponse = {
  workspace: DialogWorkspace;
  tutor: DialogTutorWorkspace;
};

type CreateDialogPayload = {
  projectId?: string | null;
  title?: string | null;
  description?: string | null;
  teachingMode?: DialogTeachingMode;
};

type CreateStarterDialogPayload = {
  projectId?: string | null;
  documentId?: string | null;
  repoUrl?: string | null;
  title?: string | null;
  teachingMode?: DialogTeachingMode;
};

type UpdateDialogPayload = {
  title?: string | null;
  description?: string | null;
  teachingMode?: DialogTeachingMode;
};

type CreateDialogCellPayload = {
  cellType: IDialogCell['cellType'];
  title?: string | null;
  sourceMarkdown?: string | null;
  sourceCode?: string | null;
};

type UpdateDialogCellPayload = {
  title?: string | null;
  sourceMarkdown?: string | null;
  sourceCode?: string | null;
};

type SelectTrajectoryPayload = {
  trajectoryKey: string;
};

type CreateDialogClarificationPayload = {
  dialogId: string;
  cellId: string;
  anchor: IDialogCellAnchor;
  clarificationQuestion: string;
};

type IntegrateDialogClarificationPayload = {
  clarificationId: string;
  displayMode?: 'integrated' | 'nested';
};

type CreateDialogVisualizationPayload = {
  dialogId: string;
  cellId: string;
  anchor: IDialogCellAnchor;
  prompt: string;
  artifactType: VisualizationArtifactType;
};

type IntegrateDialogVisualizationPayload = {
  visualizationId: string;
  displayMode?: 'integrated' | 'nested';
};

type PaperContext = {
  document: IStudyDocument;
  renderVersion: IDocumentRenderVersion;
  abstractText: string;
  sectionTitles: string[];
  equationSnippet: string | null;
  keywords: string[];
};

type PromptContext = {
  dialog: IStudyDialog;
  cells: IDialogCell[];
  imports: IDialogImport[];
  sourceMaps: IDialogSourceMap[];
  activePrompt: string;
  selectedTrajectory: IDialogTrajectory | null;
  activeNode: IDialogPlanNode | null;
  planNodes: IDialogPlanNode[];
  tutorState: IDialogTutorState | null;
  learner: LearnerWorkspace | null;
};

type DialogCheckpointEvaluation = {
  passed: boolean;
  score: number;
  feedback: string;
  nextStep: string;
};

type VisualizationEnvelope = {
  title: string;
  description: string;
  artifactType: VisualizationArtifactType;
  content: string;
  rawResponse: string;
  model: string;
};

type DialogTutorStepPlan = {
  noteTitle: string;
  instructionMarkdown: string;
  codeTitle: string | null;
  codePaths: string[];
  checkpointTitle: string;
  checkpointPrompt: string;
};

const DEFAULT_DIRECT_MODEL = 'gpt-4o-mini';
const DEFAULT_PROXY_MODELS = ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-5.4', 'gpt-5', 'gpt-4o-mini'];
const supportedVisualizationArtifactTypes = new Set<VisualizationArtifactType>([
  'html_app',
  'svg',
  'mermaid',
]);
const stopWords = new Set([
  'about',
  'after',
  'algorithm',
  'analysis',
  'between',
  'code',
  'data',
  'from',
  'into',
  'learning',
  'main',
  'paper',
  'repository',
  'section',
  'study',
  'that',
  'their',
  'there',
  'these',
  'this',
  'understand',
  'using',
  'with',
]);

export interface DialogServiceDeps {
  createDialog: AllMethods['createDialog'];
  listDialogs: AllMethods['listDialogs'];
  getDialog: AllMethods['getDialog'];
  updateDialog: AllMethods['updateDialog'];
  createDialogCell: AllMethods['createDialogCell'];
  listDialogCells: AllMethods['listDialogCells'];
  getDialogCell: AllMethods['getDialogCell'];
  updateDialogCell: AllMethods['updateDialogCell'];
  createDialogExecutionRun: AllMethods['createDialogExecutionRun'];
  listDialogExecutionRuns: AllMethods['listDialogExecutionRuns'];
  updateDialogExecutionRun: AllMethods['updateDialogExecutionRun'];
  createDialogPlanNode: AllMethods['createDialogPlanNode'];
  listDialogPlanNodes: AllMethods['listDialogPlanNodes'];
  getDialogPlanNode: AllMethods['getDialogPlanNode'];
  updateDialogPlanNode: AllMethods['updateDialogPlanNode'];
  createDialogTutorState: AllMethods['createDialogTutorState'];
  getDialogTutorState: AllMethods['getDialogTutorState'];
  updateDialogTutorState: AllMethods['updateDialogTutorState'];
  createDialogImport: AllMethods['createDialogImport'];
  listDialogImports: AllMethods['listDialogImports'];
  createDialogSourceMap: AllMethods['createDialogSourceMap'];
  listDialogSourceMaps: AllMethods['listDialogSourceMaps'];
  createDialogClarification: AllMethods['createDialogClarification'];
  listDialogClarifications: AllMethods['listDialogClarifications'];
  getDialogClarification: AllMethods['getDialogClarification'];
  updateDialogClarification: AllMethods['updateDialogClarification'];
  createDialogVisualization: AllMethods['createDialogVisualization'];
  listDialogVisualizations: AllMethods['listDialogVisualizations'];
  getDialogVisualization: AllMethods['getDialogVisualization'];
  updateDialogVisualization: AllMethods['updateDialogVisualization'];
  getStudyDocument: AllMethods['getStudyDocument'];
  getActiveDocumentRenderVersion: AllMethods['getActiveDocumentRenderVersion'];
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

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for dialog prompts and study augmentations');
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

function getDialogMetadata(dialog: IStudyDialog): Record<string, unknown> {
  return (dialog.metadataJson as Record<string, unknown> | null) ?? {};
}

function getTrajectories(dialog: IStudyDialog): IDialogTrajectory[] {
  const metadata = getDialogMetadata(dialog);
  const trajectories = metadata.trajectories;
  return Array.isArray(trajectories) ? (trajectories as IDialogTrajectory[]) : [];
}

function getCellMetadata(cell: IDialogCell): IDialogCellMetadata {
  return (cell.metadataJson as IDialogCellMetadata | null) ?? {};
}

function getNodeEvidence(node: IDialogPlanNode | null | undefined): Record<string, unknown> {
  return (node?.masteryEvidenceJson as Record<string, unknown> | null) ?? {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max);
}

function getNodeParents(nodes: IDialogPlanNode[], node: IDialogPlanNode): IDialogPlanNode[] {
  const byId = new Map(nodes.map((candidate) => [candidate.nodeId, candidate]));
  const parents: IDialogPlanNode[] = [];
  let currentParentId = node.parentNodeId ?? null;

  while (currentParentId) {
    const parent = byId.get(currentParentId);
    if (!parent) {
      break;
    }
    parents.unshift(parent);
    currentParentId = parent.parentNodeId ?? null;
  }

  return parents;
}

function getNodeChildren(nodes: IDialogPlanNode[], nodeId: string): IDialogPlanNode[] {
  return nodes
    .filter((candidate) => candidate.parentNodeId === nodeId)
    .sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
}

function getLeafNodes(nodes: IDialogPlanNode[]): IDialogPlanNode[] {
  const parentIds = new Set(
    nodes.filter((node) => node.parentNodeId).map((node) => node.parentNodeId as string),
  );
  return nodes.filter((node) => !parentIds.has(node.nodeId));
}

function getTrajectoryBias(trajectoryKey?: string | null): Record<DialogPlanNodeType, number> {
  switch (trajectoryKey) {
    case 'theory_first':
      return {
        concept: 0,
        bridge: 1,
        implementation: 2,
        verification: 3,
        synthesis: 4,
      };
    case 'code_first':
      return {
        implementation: 0,
        verification: 1,
        bridge: 2,
        concept: 3,
        synthesis: 4,
      };
    case 'reproduction_path':
      return {
        verification: 0,
        implementation: 1,
        bridge: 2,
        concept: 3,
        synthesis: 4,
      };
    case 'bridged_path':
    default:
      return {
        bridge: 0,
        concept: 1,
        implementation: 1,
        verification: 2,
        synthesis: 3,
      };
  }
}

function isNodeResolved(status: DialogPlanNodeStatus): boolean {
  return status === 'mastered' || status === 'skipped';
}

function areDependenciesSatisfied(nodes: IDialogPlanNode[], node: IDialogPlanNode): boolean {
  if (!node.dependencyNodeIds.length) {
    return true;
  }

  const statuses = new Map(nodes.map((candidate) => [candidate.nodeId, candidate.status]));
  return node.dependencyNodeIds.every((dependencyNodeId) =>
    isNodeResolved(statuses.get(dependencyNodeId) ?? 'not_started'),
  );
}

function getReadyLeafNodes(
  nodes: IDialogPlanNode[],
  selectedTrajectoryKey?: string | null,
): IDialogPlanNode[] {
  const bias = getTrajectoryBias(selectedTrajectoryKey);
  return getLeafNodes(nodes)
    .filter((node) => !isNodeResolved(node.status) && areDependenciesSatisfied(nodes, node))
    .sort((left, right) => {
      const biasDelta = bias[left.nodeType] - bias[right.nodeType];
      if (biasDelta !== 0) {
        return biasDelta;
      }

      return left.priority - right.priority || left.title.localeCompare(right.title);
    });
}

function computeNodeConfidence(node: IDialogPlanNode): number {
  const evidence = getNodeEvidence(node);
  let confidence = asNumber(evidence.confidence, 0.2);
  confidence += asNumber(evidence.understoodCount, 0) * 0.12;
  confidence += asNumber(evidence.codeSuccesses, 0) * 0.18;
  confidence +=
    (evidence.checkpointPassed === true ? 0.28 : 0) + asNumber(evidence.checkpointScore, 0) * 0.18;
  confidence -= asNumber(evidence.codeFailures, 0) * 0.12;
  confidence -= asNumber(evidence.stuckCount, 0) * 0.1;
  confidence -= asNumber(evidence.breakdownCount, 0) * 0.08;
  return clamp(confidence);
}

function nodeNeedsImplementationProof(node: IDialogPlanNode): boolean {
  return node.nodeType === 'implementation' || node.nodeType === 'verification';
}

function evaluateNodeMastery(
  node: IDialogPlanNode,
  options: { explicitUnderstood?: boolean } = {},
): boolean {
  const evidence = getNodeEvidence(node);
  const confidence = computeNodeConfidence(node);
  const hasCheckpointPass = evidence.checkpointPassed === true;
  const hasCodeSuccess = asNumber(evidence.codeSuccesses, 0) > 0;
  const explicitBoost = options.explicitUnderstood || asNumber(evidence.understoodCount, 0) > 0;

  if (node.nodeType === 'synthesis') {
    return (hasCheckpointPass && confidence >= 0.68) || (explicitBoost && confidence >= 0.62);
  }

  if (nodeNeedsImplementationProof(node)) {
    return (
      (hasCodeSuccess && (hasCheckpointPass || explicitBoost) && confidence >= 0.5) ||
      (explicitBoost && hasCheckpointPass && confidence >= 0.58) ||
      (explicitBoost && hasCodeSuccess && confidence >= 0.5) ||
      confidence >= 0.88
    );
  }

  return hasCheckpointPass || (explicitBoost && confidence >= 0.56) || confidence >= 0.82;
}

function summarizeSourceAnchors(anchors: IDialogPlanSourceAnchor[]): string {
  return anchors
    .slice(0, 5)
    .map((anchor) => [anchor.sourceType, anchor.label, anchor.detail].filter(Boolean).join(' · '))
    .join('\n');
}

function getNodeQuestion(node: IDialogPlanNode): string {
  switch (node.nodeType) {
    case 'implementation':
      return `Describe the implementation path for "${node.title}" and call out the first file or function you would inspect or modify.`;
    case 'verification':
      return `Explain what successful verification of "${node.title}" would look like and what output or behavior you expect to observe.`;
    case 'bridge':
      return `Connect the paper idea behind "${node.title}" to the code. Which source anchors matter most, and why?`;
    case 'synthesis':
      return `Summarize "${node.title}" as a teach-back: explain the idea, the implementation shape, and what would count as a convincing demonstration.`;
    case 'concept':
    default:
      return `Explain "${node.title}" in your own words. Focus on the objective, the key mechanism, and the one misconception to avoid.`;
  }
}

function getCellText(cell: IDialogCell): string {
  if (cell.cellType === 'code') {
    return cell.sourceCode ?? '';
  }

  return cell.sourceMarkdown ?? '';
}

function extractKeywords(value: string): string[] {
  const matches = value.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [];
  const counts = new Map<string, number>();

  for (const match of matches) {
    if (stopWords.has(match)) {
      continue;
    }
    counts.set(match, (counts.get(match) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([keyword]) => keyword);
}

function truncateText(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 3).trimEnd()}...`;
}

function normalizeEquationSnippet(value: string): string | null {
  let normalized = value
    .trim()
    .replace(/^```(?:latex|math)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const wrappedPatterns = [
    /^\$\$([\s\S]+)\$\$$/,
    /^\$([^$]+)\$$/,
    /^\\\(([\s\S]+)\\\)$/,
    /^\\\[([\s\S]+)\\\]$/,
  ];

  for (const pattern of wrappedPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      normalized = match[1].trim();
      break;
    }
  }

  normalized = normalized.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 180) {
    return null;
  }

  const sentenceLikeSegments = normalized
    .split(/[.!?]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (sentenceLikeSegments.length > 1) {
    return null;
  }

  return normalized;
}

function extractInlineEquation(value: string): string | null {
  const patterns = [
    /\$\$([\s\S]{1,220}?)\$\$/,
    /\$([^$\n]{1,180}?)\$/,
    /\\\(([\s\S]{1,180}?)\\\)/,
    /\\\[([\s\S]{1,220}?)\\\]/,
    /\bP\s*\([^)\n]{0,60}(?:\||\\mid)[^)\n]{0,60}\)[^\n]{0,80}/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const candidate = match?.[1] ?? match?.[0];
    const normalized = candidate ? normalizeEquationSnippet(candidate) : null;
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractEquationSnippet(
  blocks: IDocumentRenderVersion['documentIrJson']['blocks'],
  fallback: string | null,
): string | null {
  for (const block of blocks) {
    if (block.type === 'math_block') {
      const normalized = normalizeEquationSnippet(block.contentMarkdown ?? block.plainText ?? '');
      if (normalized) {
        return normalized;
      }
    }

    const inlineEquation = extractInlineEquation(block.contentMarkdown ?? block.plainText ?? '');
    if (inlineEquation) {
      return inlineEquation;
    }
  }

  return fallback;
}

function extractPaperContext(
  document: IStudyDocument,
  renderVersion: IDocumentRenderVersion,
): PaperContext {
  const blocks = renderVersion.documentIrJson.blocks;
  const abstractHeadingIndex = blocks.findIndex(
    (block) => block.type === 'heading' && block.title?.trim().toLowerCase() === 'abstract',
  );
  const abstractBlocks =
    abstractHeadingIndex >= 0
      ? blocks
          .slice(abstractHeadingIndex + 1)
          .filter((block) => block.type !== 'heading')
          .slice(0, 3)
      : blocks.filter((block) => block.type === 'paragraph').slice(0, 2);
  const abstractText = abstractBlocks
    .map((block) => block.plainText.trim())
    .join('\n\n')
    .trim();
  const equationSnippet = extractEquationSnippet(
    blocks,
    document.title.toLowerCase().includes('bayesian')
      ? 'P(G \\mid D) \\propto P(D \\mid G)P(G)'
      : null,
  );
  const sectionTitles = renderVersion.outlineJson.map((item) => item.title).slice(0, 8);
  const keywords = extractKeywords(
    [document.title, abstractText, sectionTitles.join(' ')].join(' '),
  );

  return {
    document,
    renderVersion,
    abstractText,
    sectionTitles,
    equationSnippet,
    keywords,
  };
}

function buildTrajectories(paperTitle?: string, repoSlug?: string): IDialogTrajectory[] {
  return [
    {
      key: 'theory_first',
      title: 'Theory-first path',
      description:
        'Start from the mathematical objects, assumptions, and paper sections before touching implementation details.',
      prompt: `Give me the theory-first path through ${paperTitle ?? 'this material'}${repoSlug ? ` and ${repoSlug}` : ''}. Explain what to understand first, why it matters, and which code files to defer until later.`,
      focus: ['paper goals', 'mathematical objects', 'assumptions'],
    },
    {
      key: 'code_first',
      title: 'Code-first path',
      description:
        'Start from the executable entry points, package layout, and data flow before going back to the theory.',
      prompt: `Give me the code-first path through ${repoSlug ?? 'this repository'}${paperTitle ? ` for ${paperTitle}` : ''}. Point me to entry points, training flow, and the files I should inspect in order.`,
      focus: ['entry points', 'training loop', 'package structure'],
    },
    {
      key: 'bridged_path',
      title: 'Bridged theory↔code',
      description:
        'Move back and forth between paper concepts and the files that seem to implement them.',
      prompt: `Map the main mathematical ideas in ${paperTitle ?? 'the paper'} to the most relevant files in ${repoSlug ?? 'the repository'}. For each mapping, explain why the file matters and what I should inspect inside it.`,
      focus: ['paper-to-code map', 'anchor files', 'reading order'],
    },
    {
      key: 'reproduction_path',
      title: 'Reproduction path',
      description:
        'Get the environment and example commands into a runnable state, then inspect the outputs with teaching-oriented guidance.',
      prompt: `Give me the reproduction-first path for ${repoSlug ?? 'this repository'}${paperTitle ? ` and relate it to ${paperTitle}` : ''}. Start with environment setup, the most likely runnable command, and what outputs I should pay attention to.`,
      focus: ['environment setup', 'commands', 'observable outputs'],
    },
  ];
}

function buildMappingRows(paperContext: PaperContext, repoContext: RepoContext) {
  const anchors = [
    ...paperContext.sectionTitles.slice(0, 4),
    ...paperContext.keywords.slice(0, 4),
  ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

  return anchors.slice(0, 6).map((anchor, index) => ({
    paperAnchor: anchor,
    repoPath:
      repoContext.importantPaths[index % Math.max(repoContext.importantPaths.length, 1)] ?? '',
    confidence: Math.max(0.42, 0.9 - index * 0.08),
    notesMarkdown: `Start by checking how **${anchor}** appears in \`${repoContext.importantPaths[index % Math.max(repoContext.importantPaths.length, 1)] ?? ''}\`.`,
  }));
}

function buildPaperAnchors(paperContext: PaperContext): IDialogPlanSourceAnchor[] {
  const sectionAnchors = paperContext.sectionTitles.slice(0, 4).map((title) => ({
    sourceType: 'paper' as const,
    sourceRef: paperContext.document.documentId,
    label: title,
    detail: 'paper section',
  }));

  if (sectionAnchors.length > 0) {
    return sectionAnchors;
  }

  return [
    {
      sourceType: 'paper',
      sourceRef: paperContext.document.documentId,
      label: paperContext.document.title,
      detail: 'paper overview',
    },
  ];
}

function buildRepoAnchors(repoContext: RepoContext): IDialogPlanSourceAnchor[] {
  return repoContext.importantPaths.slice(0, 4).map((repoPath) => ({
    sourceType: 'repository' as const,
    sourceRef: repoContext.repoUrl,
    label: repoPath,
    detail: 'repository path',
  }));
}

function buildMapAnchors(
  repoContext: RepoContext,
  sourceMaps: Array<Pick<IDialogSourceMap, 'paperAnchor' | 'repoPath'>>,
): IDialogPlanSourceAnchor[] {
  return sourceMaps.slice(0, 4).map((sourceMap) => ({
    sourceType: 'repository' as const,
    sourceRef: repoContext.repoUrl,
    label: sourceMap.repoPath,
    detail: `paper anchor: ${sourceMap.paperAnchor}`,
  }));
}

function getLearnerCategory(nodeType: DialogPlanNodeType) {
  if (nodeType === 'implementation') {
    return 'implementation' as const;
  }
  if (nodeType === 'bridge') {
    return 'bridge' as const;
  }
  if (nodeType === 'verification') {
    return 'verification' as const;
  }
  return 'concept' as const;
}

function estimateNodeMastery(node: IDialogPlanNode): number {
  const confidence = computeNodeConfidence(node);
  if (node.status === 'mastered') {
    return clamp(Math.max(confidence, 0.82));
  }
  if (node.status === 'skipped') {
    return clamp(Math.max(0.2, confidence * 0.55));
  }
  if (node.status === 'needs_breakdown') {
    return clamp(confidence * 0.45);
  }
  return clamp(confidence * 0.72);
}

function buildNodeObservationHint(
  node: IDialogPlanNode,
  summary: string,
  sourceLabel?: string | null,
): {
  label: string;
  category: ReturnType<typeof getLearnerCategory>;
  mastery: number;
  confidence: number;
  evidenceSummary: string;
  sourceLabel?: string | null;
} {
  return {
    label: node.title,
    category: getLearnerCategory(node.nodeType),
    mastery: estimateNodeMastery(node),
    confidence: computeNodeConfidence(node),
    evidenceSummary: summary,
    sourceLabel: sourceLabel ?? node.sourceAnchors[0]?.label ?? null,
  };
}

async function safeRecordDialogLearnerObservation(
  deps: DialogServiceDeps,
  userId: string,
  payload: Parameters<typeof recordLearnerObservation>[2],
): Promise<void> {
  try {
    await recordLearnerObservation(deps, userId, payload);
  } catch {
    // Learner-state synthesis should not block primary dialog interactions.
  }
}

function getLearnerSummary(learner: LearnerWorkspace | null): string {
  if (!learner) {
    return '';
  }

  const topNodes = learner.nodes
    .slice(0, 6)
    .map(
      (node) =>
        `- ${node.label} [${node.category}] mastery=${node.mastery.toFixed(2)} confidence=${node.confidence.toFixed(2)}`,
    )
    .join('\n');

  return [
    learner.profile.profileSummaryMarkdown ?? learner.profile.knowledgeLevelSummary,
    learner.profile.currentFocusLabels.length > 0
      ? `Current focus: ${learner.profile.currentFocusLabels.join(', ')}`
      : '',
    topNodes ? `Knowledge nodes:\n${topNodes}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function getAvailablePlanningAnchors(
  paperContext: PaperContext | null,
  repoContext: RepoContext | null,
  sourceMaps: Array<Pick<IDialogSourceMap, 'paperAnchor' | 'repoPath'>>,
): IDialogPlanSourceAnchor[] {
  return [
    ...(paperContext ? buildPaperAnchors(paperContext) : []),
    ...(repoContext ? buildRepoAnchors(repoContext) : []),
    ...(paperContext && repoContext ? buildMapAnchors(repoContext, sourceMaps) : []),
  ].filter(
    (anchor, index, anchors) =>
      anchors.findIndex(
        (candidate) =>
          candidate.sourceType === anchor.sourceType &&
          candidate.sourceRef === anchor.sourceRef &&
          candidate.label === anchor.label &&
          candidate.detail === anchor.detail,
      ) === index,
  );
}

function matchPlannerAnchors(
  availableAnchors: IDialogPlanSourceAnchor[],
  labels: string[],
  fallback: IDialogPlanSourceAnchor[],
): IDialogPlanSourceAnchor[] {
  const matched = labels
    .map((label) => {
      const normalizedLabel = label.trim().toLowerCase();
      return (
        availableAnchors.find((anchor) => anchor.label.toLowerCase() === normalizedLabel) ??
        availableAnchors.find((anchor) => anchor.label.toLowerCase().includes(normalizedLabel)) ??
        availableAnchors.find((anchor) => normalizedLabel.includes(anchor.label.toLowerCase()))
      );
    })
    .filter((anchor): anchor is IDialogPlanSourceAnchor => Boolean(anchor));

  return matched.length > 0 ? matched.slice(0, 4) : fallback;
}

function buildPlanningMessages(params: {
  learner: LearnerWorkspace | null;
  paperContext: PaperContext | null;
  repoContext: RepoContext | null;
  sourceMaps: Array<Pick<IDialogSourceMap, 'paperAnchor' | 'repoPath'>>;
  trajectory: IDialogTrajectory;
  availableAnchors: IDialogPlanSourceAnchor[];
}): ChatCompletionMessageParam[] {
  const paperSummary = params.paperContext
    ? [
        `Paper title: ${params.paperContext.document.title}`,
        params.paperContext.abstractText
          ? `Abstract:\n${truncateText(params.paperContext.abstractText, 1600)}`
          : '',
        params.paperContext.sectionTitles.length > 0
          ? `Sections: ${params.paperContext.sectionTitles.join(', ')}`
          : '',
        params.paperContext.equationSnippet
          ? `Representative equation: ${params.paperContext.equationSnippet}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';
  const repoSummary = params.repoContext
    ? [
        `Repository: ${params.repoContext.repoSlug}`,
        `Summary: ${params.repoContext.summary}`,
        params.repoContext.importantPaths.length > 0
          ? `Important paths: ${params.repoContext.importantPaths.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';
  const anchorSummary = params.availableAnchors
    .slice(0, 12)
    .map(
      (anchor) =>
        `- ${anchor.label} [${anchor.sourceType}]${anchor.detail ? ` ${anchor.detail}` : ''}`,
    )
    .join('\n');
  const sourceMapSummary = params.sourceMaps
    .slice(0, 8)
    .map((sourceMap) => `- ${sourceMap.paperAnchor} -> ${sourceMap.repoPath}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: [
        'You are planning a coarse curriculum graph for an interactive learning dialog.',
        'Return strict JSON with a top-level "nodes" array.',
        'Create 2 to 6 root nodes plus one synthesis node.',
        'Each node must include: node_type, title, objective, priority, planner_notes, anchor_labels.',
        'Valid node_type values: concept, implementation, bridge, verification, synthesis.',
        'Do not generate child nodes yet.',
        'Bias ordering and emphasis using the selected trajectory and the learner profile.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Selected trajectory: ${params.trajectory.title}`,
        `Trajectory prompt: ${params.trajectory.prompt}`,
        getLearnerSummary(params.learner),
        paperSummary,
        repoSummary,
        sourceMapSummary ? `Paper/code hints:\n${sourceMapSummary}` : '',
        anchorSummary ? `Available anchor labels:\n${anchorSummary}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

async function generateInitialPlanNodes(
  paperContext: PaperContext | null,
  repoContext: RepoContext | null,
  sourceMaps: Array<Pick<IDialogSourceMap, 'paperAnchor' | 'repoPath'>>,
  trajectory: IDialogTrajectory,
  learner: LearnerWorkspace | null,
): Promise<
  Array<{
    nodeType: DialogPlanNodeType;
    title: string;
    objective: string;
    sourceAnchors: IDialogPlanSourceAnchor[];
    priority: number;
    plannerNotes: string;
  }>
> {
  const fallback = buildInitialPlanNodes('', trajectory.key, paperContext, repoContext, sourceMaps);
  const availableAnchors = getAvailablePlanningAnchors(paperContext, repoContext, sourceMaps);

  try {
    const client = getOpenAIClient();
    const model = await resolveModel(client);
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: buildPlanningMessages({
        learner,
        paperContext,
        repoContext,
        sourceMaps,
        trajectory,
        availableAnchors,
      }),
    });
    const rawResponse = completion.choices[0]?.message?.content?.trim();
    const jsonCandidate = rawResponse ? extractJsonBlock(rawResponse) : null;
    if (!jsonCandidate) {
      return fallback;
    }

    const parsed = JSON.parse(jsonCandidate) as {
      nodes?: Array<{
        node_type?: DialogPlanNodeType;
        title?: string;
        objective?: string;
        priority?: number;
        planner_notes?: string;
        anchor_labels?: string[];
      }>;
    };
    const nodes = (parsed.nodes ?? [])
      .map((node, index) => {
        const fallbackNode = fallback[index] ?? fallback.at(-1);
        if (!fallbackNode) {
          return null;
        }

        const nodeType = node.node_type ?? fallbackNode.nodeType;
        return {
          nodeType,
          title: sanitizeTitle(node.title?.trim() || fallbackNode.title),
          objective: node.objective?.trim() || fallbackNode.objective,
          sourceAnchors: matchPlannerAnchors(
            availableAnchors,
            node.anchor_labels ?? [],
            fallbackNode.sourceAnchors,
          ),
          priority: typeof node.priority === 'number' ? node.priority : fallbackNode.priority,
          plannerNotes: node.planner_notes?.trim() || fallbackNode.plannerNotes,
        };
      })
      .filter(
        (
          node,
        ): node is {
          nodeType: DialogPlanNodeType;
          title: string;
          objective: string;
          sourceAnchors: IDialogPlanSourceAnchor[];
          priority: number;
          plannerNotes: string;
        } => Boolean(node && node.title && node.objective),
      );

    return nodes.length > 0 ? nodes.slice(0, 6) : fallback;
  } catch {
    return fallback;
  }
}

function buildBreakdownMessages(
  node: IDialogPlanNode,
  learner: LearnerWorkspace | null,
): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        'You are decomposing one curriculum node into smaller child nodes.',
        'Return strict JSON with a top-level "nodes" array of 2 to 5 items.',
        'Each node must include: node_type, title, objective.',
        'Use the same valid node_type values: concept, implementation, bridge, verification, synthesis.',
        'Make the child nodes more concrete and lower-granularity than the parent.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        getLearnerSummary(learner),
        `Parent node title: ${node.title}`,
        `Parent node type: ${node.nodeType}`,
        `Parent objective: ${node.objective}`,
        node.sourceAnchors.length > 0
          ? `Anchors:\n${summarizeSourceAnchors(node.sourceAnchors)}`
          : '',
        `Current node evidence: ${JSON.stringify(getNodeEvidence(node))}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

async function generateBreakdownTemplates(
  node: IDialogPlanNode,
  learner: LearnerWorkspace | null,
): Promise<
  Array<{
    nodeType: DialogPlanNodeType;
    title: string;
    objective: string;
  }>
> {
  const fallback = buildBreakdownTemplates(node);

  try {
    const client = getOpenAIClient();
    const model = await resolveModel(client);
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: buildBreakdownMessages(node, learner),
    });
    const rawResponse = completion.choices[0]?.message?.content?.trim();
    const jsonCandidate = rawResponse ? extractJsonBlock(rawResponse) : null;
    if (!jsonCandidate) {
      return fallback;
    }

    const parsed = JSON.parse(jsonCandidate) as {
      nodes?: Array<{
        node_type?: DialogPlanNodeType;
        title?: string;
        objective?: string;
      }>;
    };

    const nodes = (parsed.nodes ?? [])
      .map((child, index) => {
        const fallbackChild = fallback[index] ?? fallback.at(-1);
        if (!fallbackChild) {
          return null;
        }

        return {
          nodeType: child.node_type ?? fallbackChild.nodeType,
          title: sanitizeTitle(child.title?.trim() || fallbackChild.title),
          objective: child.objective?.trim() || fallbackChild.objective,
        };
      })
      .filter(
        (
          child,
        ): child is {
          nodeType: DialogPlanNodeType;
          title: string;
          objective: string;
        } => Boolean(child && child.title && child.objective),
      );

    return nodes.length > 0 ? nodes : fallback;
  } catch {
    return fallback;
  }
}

function buildInitialPlanNodes(
  dialogId: string,
  selectedTrajectoryKey: string,
  paperContext: PaperContext | null,
  repoContext: RepoContext | null,
  sourceMaps: Array<Pick<IDialogSourceMap, 'paperAnchor' | 'repoPath'>>,
): Array<{
  nodeType: DialogPlanNodeType;
  title: string;
  objective: string;
  sourceAnchors: IDialogPlanSourceAnchor[];
  priority: number;
  plannerNotes: string;
}> {
  const nodes: Array<{
    nodeType: DialogPlanNodeType;
    title: string;
    objective: string;
    sourceAnchors: IDialogPlanSourceAnchor[];
    priority: number;
    plannerNotes: string;
  }> = [];

  if (paperContext) {
    nodes.push({
      nodeType: 'concept',
      title: paperContext.sectionTitles[0] ?? 'Paper foundations',
      objective: `Understand the core paper objective, assumptions, and mathematical objects behind ${paperContext.document.title}.`,
      sourceAnchors: buildPaperAnchors(paperContext),
      priority: 10,
      plannerNotes: 'Start with the paper-side framing before drilling into details.',
    });
  }

  if (repoContext) {
    nodes.push({
      nodeType: 'implementation',
      title: repoContext.importantPaths[0] ?? 'Repository execution path',
      objective: `Inspect the executable structure of ${repoContext.repoSlug} and identify the first high-value entry points.`,
      sourceAnchors: buildRepoAnchors(repoContext),
      priority: 20,
      plannerNotes: 'Ground the learner in files, entry points, and runnable surfaces.',
    });
  }

  if (paperContext && repoContext) {
    nodes.push({
      nodeType: 'bridge',
      title: 'Paper-to-code bridge',
      objective: `Map the main theoretical ideas from ${paperContext.document.title} onto the files and functions in ${repoContext.repoSlug}.`,
      sourceAnchors: buildMapAnchors(repoContext, sourceMaps),
      priority: 30,
      plannerNotes: 'Use source-map anchors as bridge hints rather than ground truth.',
    });
  }

  if (repoContext) {
    nodes.push({
      nodeType: 'verification',
      title: 'Verification loop',
      objective: `Run a focused inspection or small code check that validates your understanding of ${repoContext.repoSlug}.`,
      sourceAnchors: buildRepoAnchors(repoContext).slice(0, 2),
      priority: 40,
      plannerNotes: 'Verification nodes should move from expectation to observable behavior.',
    });
  }

  nodes.push({
    nodeType: 'synthesis',
    title: 'Synthesize the learning path',
    objective:
      'Produce a concise teach-back that connects the concepts, the implementation shape, and the most convincing evidence of understanding.',
    sourceAnchors: [
      ...(paperContext
        ? [
            {
              sourceType: 'paper' as const,
              sourceRef: paperContext.document.documentId,
              label: paperContext.document.title,
              detail: 'paper synthesis anchor',
            },
          ]
        : []),
      ...(repoContext
        ? [
            {
              sourceType: 'repository' as const,
              sourceRef: repoContext.repoUrl,
              label: repoContext.repoSlug,
              detail: 'repository synthesis anchor',
            },
          ]
        : []),
    ],
    priority: 50,
    plannerNotes: `Plan initialized for dialog ${dialogId} with ${selectedTrajectoryKey} bias.`,
  });

  return nodes;
}

function buildInstructionCellMarkdown(
  node: IDialogPlanNode,
  mode: DialogTutorAction | 'activate',
): string {
  let modeLead =
    'Use this step to move the learner toward mastery evidence for the active objective.';

  if (mode === 'stuck') {
    modeLead =
      'The learner signaled they are stuck. Reduce the scope and make the next move concrete.';
  } else if (mode === 'advance') {
    modeLead =
      'Stay on the current objective, but tighten the checkpoint so the next response can be assessed cleanly.';
  } else if (mode === 'break_down') {
    modeLead = 'This node was decomposed into a smaller learning objective. Keep the scope narrow.';
  } else if (mode === 'activate') {
    modeLead = 'This is the active learning objective for the dialog.';
  }

  return [
    `## ${node.title}`,
    '',
    modeLead,
    '',
    `**Objective:** ${node.objective}`,
    '',
    node.sourceAnchors.length > 0
      ? `**Anchors**\n${node.sourceAnchors.map((anchor) => `- ${anchor.label}${anchor.detail ? ` (${anchor.detail})` : ''}`).join('\n')}`
      : '',
    '',
    `**Success signal:** ${getNodeQuestion(node)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function getTutorStepActionGuidance(action: DialogTutorAction | 'activate'): string {
  if (action === 'stuck') {
    return 'Reduce scope, explain the mechanism plainly, and make the next move concrete.';
  }

  if (action === 'advance') {
    return 'Keep the same objective, but tighten the checkpoint so the learner must demonstrate the missing evidence.';
  }

  if (action === 'break_down') {
    return 'This node was decomposed. Keep the step narrow and focused on the newly activated child objective.';
  }

  if (action === 'understood') {
    return 'The learner thinks they understand the step. Gather the extra evidence needed to decide whether to advance.';
  }

  return 'Orient the learner to the current objective and define a crisp success signal.';
}

function sanitizePlannerPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(
      (entry, index, entries) =>
        entry.length > 0 &&
        entry.length <= 180 &&
        !/[\n\r`]/.test(entry) &&
        entries.indexOf(entry) === index,
    )
    .slice(0, 3);
}

function buildTutorStepFallback(
  node: IDialogPlanNode,
  action: DialogTutorAction | 'activate',
  includeCode: boolean,
): DialogTutorStepPlan {
  const codePaths = includeCode
    ? node.sourceAnchors
        .filter((anchor) => anchor.sourceType === 'repository')
        .map((anchor) => anchor.label)
        .filter((label, index, labels) => Boolean(label) && labels.indexOf(label) === index)
        .slice(0, 3)
    : [];

  return {
    noteTitle: node.title,
    instructionMarkdown: buildInstructionCellMarkdown(node, action),
    codeTitle: includeCode ? getNodeExerciseTitle(node) : null,
    codePaths,
    checkpointTitle: 'Checkpoint response',
    checkpointPrompt: getNodeQuestion(node),
  };
}

function getNodeExerciseTitle(node: IDialogPlanNode): string {
  switch (node.nodeType) {
    case 'implementation':
      return 'Code exercise';
    case 'verification':
      return 'Verification check';
    case 'bridge':
      return 'Code bridge probe';
    default:
      return 'Checkpoint response';
  }
}

function buildNodeCodeCell(node: IDialogPlanNode, overridePaths?: string[] | null): string | null {
  const repoPaths =
    overridePaths && overridePaths.length > 0
      ? overridePaths.slice(0, 3)
      : node.sourceAnchors
          .filter((anchor) => anchor.sourceType === 'repository')
          .map((anchor) => anchor.label)
          .slice(0, 3);

  if (repoPaths.length === 0 && node.nodeType !== 'verification') {
    return null;
  }

  const targets = repoPaths.length > 0 ? repoPaths : ['README.md'];
  return [
    'from pathlib import Path',
    '',
    'repo = Path(repo_root)',
    `targets = ${JSON.stringify(targets)}`,
    'for relative in targets:',
    '    candidate = repo / relative',
    '    print(f"===== {relative} =====")',
    '    if not candidate.exists():',
    '        print("missing")',
    '        continue',
    '    if candidate.is_dir():',
    '        for child in sorted(candidate.iterdir())[:20]:',
    '            print(child.name)',
    '        continue',
    '    print(candidate.read_text()[:1200])',
    '    print()',
  ].join('\n');
}

function buildTutorStepMessages(params: {
  dialog: IStudyDialog;
  node: IDialogPlanNode;
  action: DialogTutorAction | 'activate';
  includeCode: boolean;
  learner: LearnerWorkspace | null;
  imports: IDialogImport[];
  cells: IDialogCell[];
  planNodes: IDialogPlanNode[];
  tutorState: IDialogTutorState | null;
}): ChatCompletionMessageParam[] {
  const trajectories = getTrajectories(params.dialog);
  const selectedTrajectory =
    trajectories.find((trajectory) => trajectory.key === params.dialog.selectedTrajectoryKey) ??
    null;
  const ancestorChain = getNodeParents(params.planNodes, params.node)
    .map((node) => node.title)
    .join(' -> ');
  const siblingSummary = params.planNodes
    .filter(
      (node) =>
        node.parentNodeId === params.node.parentNodeId && node.nodeId !== params.node.nodeId,
    )
    .map((node) => `- ${node.title}: ${node.status}`)
    .join('\n');
  const recentNodeCells = params.cells
    .filter((cell) => getCellMetadata(cell).nodeId === params.node.nodeId)
    .slice(-4)
    .map(
      (cell) =>
        `${cell.cellType}${cell.title ? ` ${cell.title}` : ''}:\n${truncateText(getCellText(cell), 900)}`,
    )
    .join('\n\n');
  const importSummary = params.imports
    .map((dialogImport) => `- ${dialogImport.sourceType}: ${dialogImport.title}`)
    .join('\n');
  const repositoryAnchors = params.node.sourceAnchors
    .filter((anchor) => anchor.sourceType === 'repository')
    .map((anchor) => anchor.label)
    .slice(0, 6);
  const learnerSummary = getLearnerSummary(params.learner);

  return [
    {
      role: 'system',
      content: [
        'You are planning the next notebook-style teaching step for an interactive learning dialog.',
        'Return strict JSON with keys: note_title, instruction_markdown, checkpoint_prompt, code_paths.',
        'instruction_markdown must be compact markdown for one note cell.',
        'checkpoint_prompt must be a learner-facing prompt that checks the active objective.',
        'code_paths must be an array of 0 to 3 repository-relative paths to inspect next.',
        'Do not invent files or anchors outside the supplied context.',
        'Keep the step aligned to exactly one learning objective and at most three cells: note, optional code, checkpoint prompt.',
        params.includeCode
          ? 'Include code_paths only when a small repository inspection step would help.'
          : 'Return an empty code_paths array because this step should not create a code cell.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Dialog title: ${params.dialog.title}`,
        selectedTrajectory ? `Selected trajectory: ${selectedTrajectory.title}` : '',
        params.tutorState ? `Tutor state: ${params.tutorState.completionState}` : '',
        `Action: ${params.action}`,
        `Action guidance: ${getTutorStepActionGuidance(params.action)}`,
        `Active node title: ${params.node.title}`,
        `Active node type: ${params.node.nodeType}`,
        `Objective: ${params.node.objective}`,
        params.node.plannerNotes ? `Planner notes: ${params.node.plannerNotes}` : '',
        ancestorChain ? `Ancestor chain: ${ancestorChain}` : '',
        siblingSummary ? `Sibling status:\n${siblingSummary}` : '',
        params.node.sourceAnchors.length > 0
          ? `Source anchors:\n${summarizeSourceAnchors(params.node.sourceAnchors)}`
          : '',
        repositoryAnchors.length > 0
          ? `Available repository paths: ${repositoryAnchors.join(', ')}`
          : '',
        `Node evidence: ${JSON.stringify(getNodeEvidence(params.node))}`,
        learnerSummary ? `Learner profile:\n${learnerSummary}` : '',
        importSummary ? `Imports:\n${importSummary}` : '',
        recentNodeCells ? `Recent node cells:\n${recentNodeCells}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

function parseTutorStepPlan(
  rawResponse: string,
  fallback: DialogTutorStepPlan,
  includeCode: boolean,
): DialogTutorStepPlan {
  const jsonCandidate = extractJsonBlock(rawResponse);
  if (!jsonCandidate) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(jsonCandidate) as {
      note_title?: string;
      instruction_markdown?: string;
      checkpoint_prompt?: string;
      code_paths?: unknown;
    };

    return {
      noteTitle: sanitizeTitle(parsed.note_title?.trim() || fallback.noteTitle),
      instructionMarkdown: parsed.instruction_markdown?.trim() || fallback.instructionMarkdown,
      codeTitle: includeCode ? fallback.codeTitle : null,
      codePaths: includeCode
        ? (() => {
            const plannedPaths = sanitizePlannerPaths(parsed.code_paths);
            return plannedPaths.length > 0 ? plannedPaths : fallback.codePaths;
          })()
        : [],
      checkpointTitle: fallback.checkpointTitle,
      checkpointPrompt: parsed.checkpoint_prompt?.trim() || fallback.checkpointPrompt,
    };
  } catch {
    return fallback;
  }
}

async function generateTutorStepPlan(
  dialog: IStudyDialog,
  node: IDialogPlanNode,
  action: DialogTutorAction | 'activate',
  includeCode: boolean,
  learner: LearnerWorkspace | null,
  imports: IDialogImport[],
  cells: IDialogCell[],
  planNodes: IDialogPlanNode[],
  tutorState: IDialogTutorState | null,
): Promise<DialogTutorStepPlan> {
  const fallback = buildTutorStepFallback(node, action, includeCode);

  try {
    const client = getOpenAIClient();
    const model = await resolveModel(client);
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: buildTutorStepMessages({
        dialog,
        node,
        action,
        includeCode,
        learner,
        imports,
        cells,
        planNodes,
        tutorState,
      }),
    });
    const rawResponse = completion.choices[0]?.message?.content?.trim();
    if (!rawResponse) {
      return fallback;
    }

    return parseTutorStepPlan(rawResponse, fallback, includeCode);
  } catch {
    return fallback;
  }
}

function buildStarterDescription(
  paperContext: PaperContext | null,
  repoContext: RepoContext | null,
): string {
  if (repoContext && paperContext) {
    return 'Starter learning dialog generated from an imported paper and GitHub repository.';
  }

  if (repoContext) {
    return 'Starter learning dialog generated from a GitHub repository.';
  }

  return 'Starter learning dialog generated from an imported paper.';
}

function getDefaultTrajectory(trajectories: IDialogTrajectory[]): IDialogTrajectory {
  return trajectories.find((trajectory) => trajectory.key === 'bridged_path') ?? trajectories[0];
}

function buildStarterTitle(
  paperContext: PaperContext | null,
  repoContext: RepoContext | null,
  requestedTitle?: string | null,
): string {
  if (requestedTitle?.trim()) {
    return sanitizeTitle(requestedTitle.trim());
  }

  if (paperContext && repoContext) {
    return sanitizeTitle(`${paperContext.document.title} · ${repoContext.repoSlug}`);
  }

  if (paperContext) {
    return sanitizeTitle(`${paperContext.document.title} Study Dialog`);
  }

  if (repoContext) {
    return sanitizeTitle(`${repoContext.repoSlug} Learning Dialog`);
  }

  return 'Untitled Learning Dialog';
}

function buildTeachingSystemPrompt(teachingMode: DialogTeachingMode): string {
  if (teachingMode === 'hint_mode') {
    return [
      'You are the ILDE teaching assistant.',
      'Prefer hints, staged questions, and partial next steps over full answers.',
      'Explain why each hint matters and what the learner should observe next.',
    ].join(' ');
  }

  if (teachingMode === 'explain_then_do') {
    return [
      'You are the ILDE teaching assistant.',
      'Explain the reasoning and plan first, then give the concrete next actions.',
      'Keep the response pedagogical rather than opaque.',
    ].join(' ');
  }

  if (teachingMode === 'just_do_it') {
    return [
      'You are the ILDE teaching assistant.',
      'Be concise, but still include brief rationale for the chosen action.',
      'Optimize for forward progress without becoming a black box.',
    ].join(' ');
  }

  return [
    'You are the ILDE teaching assistant.',
    'Default to explanation-first guidance, reveal why a step matters, and propose small next steps.',
    'Help the learner connect the paper, the code, and the outputs instead of dumping opaque solutions.',
  ].join(' ');
}

function buildPromptContext(
  dialog: IStudyDialog,
  cells: IDialogCell[],
  imports: IDialogImport[],
  sourceMaps: IDialogSourceMap[],
  activePrompt: string,
  planNodes: IDialogPlanNode[],
  tutorState: IDialogTutorState | null,
  learner: LearnerWorkspace | null,
): PromptContext {
  const trajectories = getTrajectories(dialog);
  const selectedTrajectory =
    trajectories.find((trajectory) => trajectory.key === dialog.selectedTrajectoryKey) ?? null;
  const activeNode = planNodes.find((node) => node.nodeId === tutorState?.activeNodeId) ?? null;

  return {
    dialog,
    cells,
    imports,
    sourceMaps,
    activePrompt,
    selectedTrajectory,
    activeNode,
    planNodes,
    tutorState,
    learner,
  };
}

function buildPromptMessages(context: PromptContext): ChatCompletionMessageParam[] {
  const recentCells = context.cells
    .filter((cell) => cell.cellType !== 'output')
    .slice(-8)
    .map((cell) => {
      const body = truncateText(getCellText(cell), cell.cellType === 'code' ? 800 : 1200);
      return `Cell (${cell.cellType})${cell.title ? ` ${cell.title}` : ''}:\n${body}`;
    })
    .join('\n\n');

  const importSummary = context.imports
    .map((dialogImport) => `- ${dialogImport.sourceType}: ${dialogImport.title}`)
    .join('\n');
  const sourceMapSummary = context.sourceMaps
    .slice(0, 6)
    .map((sourceMap) => `- ${sourceMap.paperAnchor} -> ${sourceMap.repoPath}`)
    .join('\n');
  const activeNodeParents = context.activeNode
    ? getNodeParents(context.planNodes, context.activeNode)
    : [];
  const siblingSummary =
    context.activeNode == null
      ? ''
      : context.planNodes
          .filter(
            (node) =>
              node.parentNodeId === context.activeNode?.parentNodeId &&
              node.nodeId !== context.activeNode?.nodeId,
          )
          .map((node) => `- ${node.title}: ${node.status}`)
          .join('\n');
  const activeNodeSummary = context.activeNode
    ? [
        `Active objective: ${context.activeNode.objective}`,
        activeNodeParents.length > 0
          ? `Ancestor chain: ${activeNodeParents.map((node) => node.title).join(' -> ')}`
          : '',
        context.activeNode.sourceAnchors.length > 0
          ? `Node anchors:\n${summarizeSourceAnchors(context.activeNode.sourceAnchors)}`
          : '',
        siblingSummary ? `Sibling status:\n${siblingSummary}` : '',
        `Node evidence: ${JSON.stringify(getNodeEvidence(context.activeNode))}`,
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';
  const learnerSummary = getLearnerSummary(context.learner);

  return [
    {
      role: 'system',
      content: buildTeachingSystemPrompt(context.dialog.teachingMode),
    },
    {
      role: 'user',
      content: [
        `Dialog title: ${context.dialog.title}`,
        context.selectedTrajectory
          ? `Selected trajectory: ${context.selectedTrajectory.title}`
          : '',
        context.tutorState ? `Tutor state: ${context.tutorState.completionState}` : '',
        learnerSummary ? `Learner profile:\n${learnerSummary}` : '',
        importSummary ? `Imports:\n${importSummary}` : '',
        sourceMapSummary ? `Paper/code map:\n${sourceMapSummary}` : '',
        activeNodeSummary,
        recentCells ? `Recent dialog context:\n${recentCells}` : '',
        `Prompt cell request:\n${context.activePrompt}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

function buildCheckpointEvaluationMessages(
  dialog: IStudyDialog,
  node: IDialogPlanNode,
  cells: IDialogCell[],
  learnerResponse: string,
): ChatCompletionMessageParam[] {
  const recentNodeCells = cells
    .filter((cell) => getCellMetadata(cell).nodeId === node.nodeId)
    .slice(-4)
    .map(
      (cell) =>
        `${cell.cellType}${cell.title ? ` ${cell.title}` : ''}:\n${truncateText(getCellText(cell), 900)}`,
    )
    .join('\n\n');

  return [
    {
      role: 'system',
      content: [
        buildTeachingSystemPrompt(dialog.teachingMode),
        'You are evaluating learner progress for a curriculum node inside an interactive learning dialog.',
        'Return strict JSON with keys: passed (boolean), score (0 to 1), feedback (string), next_step (string).',
        'Judge whether the learner demonstrated enough understanding to advance, using the node objective and the response quality.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Node title: ${node.title}`,
        `Node type: ${node.nodeType}`,
        `Objective: ${node.objective}`,
        node.sourceAnchors.length > 0
          ? `Anchors:\n${summarizeSourceAnchors(node.sourceAnchors)}`
          : '',
        recentNodeCells ? `Recent node cells:\n${recentNodeCells}` : '',
        `Learner response:\n${learnerResponse}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

function parseCheckpointEvaluation(rawResponse: string): DialogCheckpointEvaluation {
  const jsonCandidate = extractJsonBlock(rawResponse);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as {
        passed?: boolean;
        score?: number;
        feedback?: string;
        next_step?: string;
      };
      return {
        passed: parsed.passed === true,
        score: clamp(asNumber(parsed.score, parsed.passed ? 0.7 : 0.35)),
        feedback: parsed.feedback?.trim() || rawResponse.trim(),
        nextStep:
          parsed.next_step?.trim() ||
          'Tighten the explanation and support it with one concrete anchor.',
      };
    } catch {
      // Fall through.
    }
  }

  return {
    passed: /pass|advance|sufficient|clear understanding/i.test(rawResponse),
    score: /pass|advance|sufficient|clear understanding/i.test(rawResponse) ? 0.72 : 0.4,
    feedback: rawResponse.trim(),
    nextStep: 'Tighten the explanation and support it with one concrete anchor.',
  };
}

function buildClarificationMessages(
  dialog: IStudyDialog,
  cell: IDialogCell,
  anchor: IDialogCellAnchor,
  clarificationQuestion: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        buildTeachingSystemPrompt(dialog.teachingMode),
        'You are answering an inline clarification for a selected span inside a learning dialog cell.',
        'Explain the local passage directly, preserve important terminology, and use math formatting when helpful.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Cell type: ${cell.cellType}`,
        `Cell title: ${cell.title ?? '(untitled)'}`,
        `Selected passage: ${anchor.anchorText}`,
        `Context before: ${anchor.anchorContextBefore}`,
        `Context after: ${anchor.anchorContextAfter}`,
        `Clarification request: ${clarificationQuestion}`,
      ].join('\n'),
    },
  ];
}

function buildVisualizationMessages(
  dialog: IStudyDialog,
  cell: IDialogCell,
  anchor: IDialogCellAnchor,
  prompt: string,
  artifactType: VisualizationArtifactType,
): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: [
        buildTeachingSystemPrompt(dialog.teachingMode),
        'You are generating a visualization artifact for a selected span inside a learning dialog cell.',
        'Return only the artifact content or a compact JSON object with title, description, artifact_type, and content.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Cell type: ${cell.cellType}`,
        `Cell title: ${cell.title ?? '(untitled)'}`,
        `Artifact type: ${artifactType}`,
        `Selected passage: ${anchor.anchorText}`,
        `Context before: ${anchor.anchorContextBefore}`,
        `Context after: ${anchor.anchorContextAfter}`,
        `Visualization request: ${prompt}`,
      ].join('\n'),
    },
  ];
}

function getFallbackVisualizationTitle(value: string): string {
  const sanitized = value
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\-_:,.() ]/gu, '')
    .trim();
  return sanitized || 'Dialog visualization';
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

function parseVisualizationEnvelope(
  rawResponse: string,
  artifactType: VisualizationArtifactType,
  prompt: string,
  model: string,
): VisualizationEnvelope {
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
          title: parsed.title?.trim() || getFallbackVisualizationTitle(prompt),
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
    title: getFallbackVisualizationTitle(prompt),
    description: '',
    artifactType,
    content: stripped,
    rawResponse,
    model,
  };
}

function buildExecutionOutputMarkdown(
  cellType: IDialogCell['cellType'],
  stdout: string,
  stderr: string,
  result: { repr: string } | null,
  error: string | null,
  traceback: string | null,
): string {
  const sections = [`## ${cellType === 'prompt' ? 'Prompt Response' : 'Execution Output'}`, ''];

  if (stdout.trim()) {
    sections.push('### stdout', '', '```text', stdout.trim(), '```', '');
  }

  if (result?.repr) {
    sections.push('### result', '', '```text', result.repr, '```', '');
  }

  if (stderr.trim()) {
    sections.push('### stderr', '', '```text', stderr.trim(), '```', '');
  }

  if (error) {
    sections.push('### error', '', '```text', error, '```', '');
  }

  if (traceback) {
    sections.push('### traceback', '', '```text', traceback.trim(), '```', '');
  }

  if (sections.length === 2) {
    sections.push('No output was produced.');
  }

  return sections.join('\n');
}

function buildCheckpointFeedbackMarkdown(evaluation: DialogCheckpointEvaluation): string {
  return [
    '## Checkpoint Feedback',
    '',
    evaluation.feedback,
    '',
    `**Passed:** ${evaluation.passed ? 'yes' : 'not yet'}`,
    `**Score:** ${Math.round(evaluation.score * 100)}%`,
    '',
    `**Next step:** ${evaluation.nextStep}`,
  ].join('\n');
}

function assertSupportedArtifactType(artifactType: VisualizationArtifactType) {
  if (!supportedVisualizationArtifactTypes.has(artifactType)) {
    throw new Error(`Artifact type "${artifactType}" is not supported in dialog study mode`);
  }
}

async function buildStoredVisualization(
  appConfig: AppConfig | undefined,
  visualizationId: string,
  artifactType: VisualizationArtifactType,
  generated: VisualizationEnvelope,
) {
  assertSupportedArtifactType(artifactType);
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
    generationModel: generated.model,
    generationMetadata: {
      rawResponse: generated.rawResponse,
      warnings: sanitized.warnings,
      originalMimeType: sanitized.canonicalSourceMimeType,
      sanitizedMimeType: sanitized.compiledRenderMimeType,
      storageByteSize: persisted.storageByteSize,
    },
  };
}

async function requireDialog(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
): Promise<IStudyDialog> {
  const dialog = await deps.getDialog(userId, dialogId);
  if (!dialog) {
    throw new Error('Dialog not found');
  }

  return dialog;
}

async function requireDialogCell(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  cellId: string,
): Promise<IDialogCell> {
  const cell = await deps.getDialogCell(userId, cellId);
  if (!cell || cell.dialogId !== dialogId) {
    throw new Error('Dialog cell not found');
  }

  return cell;
}

function getNextPosition(cells: IDialogCell[]): number {
  return (cells.at(-1)?.position ?? 0) + 1;
}

function getLinkedOutputCell(cells: IDialogCell[], sourceCellId: string): IDialogCell | null {
  return (
    cells.find(
      (cell) =>
        cell.cellType === 'output' &&
        typeof cell.metadataJson === 'object' &&
        (cell.metadataJson as Record<string, unknown> | null)?.sourceCellId === sourceCellId,
    ) ?? null
  );
}

function getRepoImportPath(dialogImports: IDialogImport[]): string | null {
  const repoImport = dialogImports.find((dialogImport) => dialogImport.sourceType === 'repository');
  const metadata = (repoImport?.metadataJson as Record<string, unknown> | null) ?? null;
  return typeof metadata?.repoPath === 'string' ? metadata.repoPath : null;
}

async function buildTutorWorkspace(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
): Promise<DialogTutorWorkspace> {
  const [tutorState, nodes] = await Promise.all([
    deps.getDialogTutorState(userId, dialogId),
    deps.listDialogPlanNodes(userId, dialogId),
  ]);

  return {
    dialogId,
    tutorState,
    nodes,
  };
}

async function updateNodeEvidence(
  deps: DialogServiceDeps,
  userId: string,
  nodeId: string,
  patch: Record<string, unknown>,
): Promise<IDialogPlanNode> {
  const node = await deps.getDialogPlanNode(userId, nodeId);
  if (!node) {
    throw new Error('Dialog plan node not found');
  }

  const current = getNodeEvidence(node);
  const updated = await deps.updateDialogPlanNode(userId, nodeId, {
    masteryEvidenceJson: {
      ...current,
      ...patch,
    },
  });

  if (!updated) {
    throw new Error('Failed to update dialog plan node');
  }

  return updated;
}

async function syncTutorCompletion(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
): Promise<IDialogTutorState | null> {
  const tutorState = await deps.getDialogTutorState(userId, dialogId);
  if (!tutorState) {
    return null;
  }

  const nodes = await deps.listDialogPlanNodes(userId, dialogId);
  const leaves = getLeafNodes(nodes);
  const requiredLeavesResolved =
    leaves.length > 0 && leaves.every((node) => isNodeResolved(node.status));
  const synthesisMastered = leaves.some(
    (node) => node.nodeType === 'synthesis' && node.status === 'mastered',
  );

  const completionState =
    requiredLeavesResolved && synthesisMastered ? ('complete' as const) : ('active' as const);
  if (completionState === tutorState.completionState) {
    return tutorState;
  }

  return deps.updateDialogTutorState(userId, dialogId, { completionState });
}

function getNodeStepCount(cells: IDialogCell[], nodeId: string): number {
  return cells.filter((cell) => getCellMetadata(cell).nodeId === nodeId).length;
}

async function materializeTutorNodeStep(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  node: IDialogPlanNode,
  options: { action: DialogTutorAction | 'activate'; includeCode?: boolean; stepIntent?: string },
): Promise<void> {
  const includeCode = options.includeCode !== false;
  const [dialog, cells, imports, tutorWorkspace, learner] = await Promise.all([
    requireDialog(deps, userId, dialogId),
    deps.listDialogCells(userId, dialogId),
    deps.listDialogImports(userId, dialogId),
    buildTutorWorkspace(deps, userId, dialogId),
    getLearnerWorkspace(deps, userId),
  ]);
  const stepPlan = await generateTutorStepPlan(
    dialog,
    node,
    options.action,
    includeCode,
    learner,
    imports,
    cells,
    tutorWorkspace.nodes,
    tutorWorkspace.tutorState,
  );
  const positionBase = getNextPosition(cells);
  const stepNumber = getNodeStepCount(cells, node.nodeId) + 1;
  const metadataBase: IDialogCellMetadata = {
    nodeId: node.nodeId,
    authoredBy: 'tutor',
    stepIntent: options.stepIntent ?? `${options.action}:${stepNumber}`,
  };

  const creations: Array<Promise<IDialogCell>> = [
    deps.createDialogCell(userId, {
      dialogId,
      position: positionBase,
      cellType: 'note',
      title: stepPlan.noteTitle,
      sourceMarkdown: stepPlan.instructionMarkdown,
      metadataJson: {
        ...metadataBase,
        cellRole: 'instruction',
      },
    }),
  ];

  const codeSource = includeCode ? buildNodeCodeCell(node, stepPlan.codePaths) : null;
  if (codeSource) {
    creations.push(
      deps.createDialogCell(userId, {
        dialogId,
        position: positionBase + 0.1,
        cellType: 'code',
        title: stepPlan.codeTitle ?? getNodeExerciseTitle(node),
        sourceCode: codeSource,
        metadataJson: {
          ...metadataBase,
          cellRole: 'exercise',
        },
      }),
    );
  }

  creations.push(
    deps.createDialogCell(userId, {
      dialogId,
      position: positionBase + 0.2,
      cellType: 'prompt',
      title: stepPlan.checkpointTitle,
      sourceMarkdown: '',
      metadataJson: {
        ...metadataBase,
        cellRole: 'checkpoint',
        checkpointPrompt: stepPlan.checkpointPrompt,
      },
    }),
  );

  await Promise.all(creations);
  await deps.updateDialogPlanNode(userId, node.nodeId, {
    status: 'in_progress',
    masteryEvidenceJson: {
      ...getNodeEvidence(node),
      lastPlannedAction: options.action,
      lastPlannedAt: new Date().toISOString(),
      lastCheckpointPrompt: stepPlan.checkpointPrompt,
      lastCodePaths: stepPlan.codePaths,
      lastInstructionDigest: truncateText(
        stepPlan.instructionMarkdown
          .replace(/[#*_`>-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        220,
      ),
    },
  });
}

async function activateTutorNode(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  nodeId: string,
  action: DialogTutorAction | 'activate',
): Promise<void> {
  const node = await deps.getDialogPlanNode(userId, nodeId);
  if (!node) {
    throw new Error('Dialog plan node not found');
  }

  await deps.updateDialogTutorState(userId, dialogId, {
    activeNodeId: nodeId,
    lastTutorAction: action === 'activate' ? 'initialized' : action,
  });
  await materializeTutorNodeStep(deps, userId, dialogId, node, {
    action,
    includeCode: node.nodeType !== 'concept' && node.nodeType !== 'synthesis',
  });
}

async function chooseNextTutorNode(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
): Promise<IDialogPlanNode | null> {
  const tutorState = await deps.getDialogTutorState(userId, dialogId);
  if (!tutorState) {
    return null;
  }

  const nodes = await deps.listDialogPlanNodes(userId, dialogId);
  return getReadyLeafNodes(nodes, tutorState.selectedTrajectoryKey)[0] ?? null;
}

async function advanceToNextTutorNode(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  action: DialogTutorAction,
): Promise<void> {
  const nextNode = await chooseNextTutorNode(deps, userId, dialogId);
  if (!nextNode) {
    await deps.updateDialogTutorState(userId, dialogId, {
      activeNodeId: null,
      lastTutorAction: action,
    });
    await syncTutorCompletion(deps, userId, dialogId);
    return;
  }

  await activateTutorNode(deps, userId, dialogId, nextNode.nodeId, action);
  await syncTutorCompletion(deps, userId, dialogId);
}

function buildBreakdownTemplates(node: IDialogPlanNode): Array<{
  nodeType: DialogPlanNodeType;
  title: string;
  objective: string;
}> {
  switch (node.nodeType) {
    case 'implementation':
      return [
        {
          nodeType: 'implementation',
          title: `${node.title}: entry point`,
          objective: `Identify the first executable entry point or public API involved in ${node.title}.`,
        },
        {
          nodeType: 'implementation',
          title: `${node.title}: internal flow`,
          objective: `Trace the internal flow of data, state, or control through ${node.title}.`,
        },
        {
          nodeType: 'verification',
          title: `${node.title}: observable check`,
          objective: `Run or inspect one observable check that confirms your model of ${node.title}.`,
        },
      ];
    case 'bridge':
      return [
        {
          nodeType: 'concept',
          title: `${node.title}: paper-side idea`,
          objective: `Explain the paper-side mechanism that ${node.title} is trying to realize.`,
        },
        {
          nodeType: 'implementation',
          title: `${node.title}: code-side anchor`,
          objective: `Identify the code-side anchor that most directly implements ${node.title}.`,
        },
        {
          nodeType: 'bridge',
          title: `${node.title}: reconcile the mapping`,
          objective: `Reconcile how the paper description and the code structure line up for ${node.title}.`,
        },
      ];
    case 'verification':
      return [
        {
          nodeType: 'concept',
          title: `${node.title}: predict`,
          objective: `State the expected behavior or output before checking ${node.title}.`,
        },
        {
          nodeType: 'verification',
          title: `${node.title}: inspect`,
          objective: `Perform the smallest useful verification step for ${node.title}.`,
        },
      ];
    case 'synthesis':
      return [
        {
          nodeType: 'concept',
          title: `${node.title}: conceptual summary`,
          objective: `Summarize the key conceptual model needed for ${node.title}.`,
        },
        {
          nodeType: 'implementation',
          title: `${node.title}: implementation summary`,
          objective: `Summarize the implementation footprint and the most important files for ${node.title}.`,
        },
        {
          nodeType: 'synthesis',
          title: `${node.title}: final teach-back`,
          objective: `Produce the final teach-back once the concept and implementation summaries are both stable.`,
        },
      ];
    case 'concept':
    default:
      return [
        {
          nodeType: 'concept',
          title: `${node.title}: vocabulary`,
          objective: `Name and define the core objects, terms, or assumptions used in ${node.title}.`,
        },
        {
          nodeType: 'concept',
          title: `${node.title}: mechanism`,
          objective: `Explain the mechanism or causal story behind ${node.title}.`,
        },
        {
          nodeType: 'bridge',
          title: `${node.title}: why it matters`,
          objective: `Connect ${node.title} to how the system would need to behave in practice.`,
        },
      ];
  }
}

async function upsertOutputCell(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  sourceCell: IDialogCell,
  executionRun: IDialogExecutionRun,
  content: string,
): Promise<IDialogCell> {
  const existingCells = await deps.listDialogCells(userId, dialogId);
  const linkedOutput = getLinkedOutputCell(existingCells, sourceCell.cellId);
  const sourceMetadata = getCellMetadata(sourceCell);

  if (linkedOutput) {
    const updated = await deps.updateDialogCell(userId, linkedOutput.cellId, {
      sourceMarkdown: content,
      metadataJson: {
        ...(linkedOutput.metadataJson ?? {}),
        nodeId: sourceMetadata.nodeId ?? null,
        authoredBy: sourceMetadata.authoredBy ?? 'user',
        cellRole: 'output',
        runId: executionRun.runId,
      },
    });

    if (!updated) {
      throw new Error('Failed to update output cell');
    }

    return updated;
  }

  return deps.createDialogCell(userId, {
    dialogId,
    position: sourceCell.position + 0.1,
    cellType: 'output',
    title: sourceCell.cellType === 'prompt' ? 'Prompt output' : 'Execution output',
    sourceMarkdown: content,
    metadataJson: {
      sourceCellId: sourceCell.cellId,
      nodeId: sourceMetadata.nodeId ?? null,
      authoredBy: sourceMetadata.authoredBy ?? 'user',
      cellRole: 'output',
      runId: executionRun.runId,
    },
  });
}

async function failExecutionRun(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  cell: IDialogCell,
  executionRun: IDialogExecutionRun,
  error: unknown,
): Promise<DialogWorkspace> {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown dialog execution error occurred.';
  const updatedRun = await deps.updateDialogExecutionRun(userId, executionRun.runId, {
    status: 'failed',
    stderr: '',
    resultJson: null,
    finishedAt: new Date(),
  });

  if (!updatedRun) {
    throw new Error('Failed to update dialog execution run');
  }

  await upsertOutputCell(
    deps,
    userId,
    dialogId,
    cell,
    updatedRun,
    buildExecutionOutputMarkdown(cell.cellType, '', '', null, errorMessage, null),
  );

  return buildWorkspace(deps, userId, dialogId);
}

async function buildWorkspace(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
): Promise<DialogWorkspace> {
  const dialog = await requireDialog(deps, userId, dialogId);
  const [cells, imports, sourceMaps, clarifications, visualizations, executionRuns] =
    await Promise.all([
      deps.listDialogCells(userId, dialogId),
      deps.listDialogImports(userId, dialogId),
      deps.listDialogSourceMaps(userId, dialogId),
      deps.listDialogClarifications(userId, { dialogId }),
      deps.listDialogVisualizations(userId, { dialogId }),
      deps.listDialogExecutionRuns(userId, { dialogId }),
    ]);

  return {
    dialog,
    cells,
    imports,
    sourceMaps,
    clarifications,
    visualizations,
    executionRuns,
  };
}

export async function listDialogs(
  deps: DialogServiceDeps,
  userId: string,
  params?: { projectId?: string | null },
) {
  return deps.listDialogs(userId, params);
}

export async function createDialog(
  deps: DialogServiceDeps,
  userId: string,
  payload: CreateDialogPayload = {},
) {
  const dialog = await deps.createDialog(userId, {
    projectId: payload.projectId ?? null,
    title: sanitizeTitle(payload.title?.trim() || 'New Learning Dialog'),
    description: payload.description?.trim() || null,
    teachingMode: payload.teachingMode ?? 'teach_me',
    sourceManifestJson: [],
    metadataJson: {
      trajectories: buildTrajectories(),
    },
    selectedTrajectoryKey: 'bridged_path',
  });

  await deps.createDialogTutorState(userId, {
    dialogId: dialog.dialogId,
    selectedTrajectoryKey: dialog.selectedTrajectoryKey ?? 'bridged_path',
    activeNodeId: null,
    rootNodeIds: [],
    learnerModelJson: {
      confidenceByNode: {},
    },
    planVersion: 1,
    lastTutorAction: 'initialized',
    completionState: 'active',
  });

  await deps.createDialogCell(userId, {
    dialogId: dialog.dialogId,
    position: 1,
    cellType: 'note',
    title: 'Orientation',
    sourceMarkdown: '# Welcome\n\nUse this dialog to mix notes, code, and pedagogical prompts.',
    metadataJson: {
      authoredBy: 'tutor',
      cellRole: 'instruction',
      stepIntent: 'orientation',
    },
  });

  return buildWorkspace(deps, userId, dialog.dialogId);
}

export async function getDialogWorkspace(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
) {
  return buildWorkspace(deps, userId, dialogId);
}

export async function getDialogTutorWorkspace(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
) {
  await requireDialog(deps, userId, dialogId);
  return buildTutorWorkspace(deps, userId, dialogId);
}

export async function runDialogTutorAction(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  payload: DialogTutorActionPayload,
): Promise<DialogTutorActionResponse> {
  await requireDialog(deps, userId, dialogId);
  const tutorWorkspace = await buildTutorWorkspace(deps, userId, dialogId);
  const learner = await getLearnerWorkspace(deps, userId);
  const tutorState = tutorWorkspace.tutorState;
  if (!tutorState) {
    throw new Error('Dialog tutor state not found');
  }

  const nodeId = payload.nodeId ?? tutorState.activeNodeId;
  const node = nodeId
    ? (tutorWorkspace.nodes.find((candidate) => candidate.nodeId === nodeId) ?? null)
    : null;

  if (!node) {
    throw new Error('Dialog plan node not found');
  }

  if (payload.action === 'advance') {
    if (evaluateNodeMastery(node)) {
      await deps.updateDialogPlanNode(userId, node.nodeId, { status: 'mastered' });
      await deps.updateDialogTutorState(userId, dialogId, {
        lastTutorAction: 'advance',
      });
      await advanceToNextTutorNode(deps, userId, dialogId, 'advance');
      await safeRecordDialogLearnerObservation(deps, userId, {
        surface: 'dialog',
        eventType: 'tutor_advance_mastered',
        sourceId: dialogId,
        sourceTitle: node.title,
        summary: `The learner advanced past "${node.title}" after meeting the current mastery gate.`,
        payloadJson: {
          nodeId: node.nodeId,
          status: 'mastered',
        },
        conceptHints: [
          buildNodeObservationHint(
            { ...node, status: 'mastered' } as IDialogPlanNode,
            `Advanced past ${node.title}`,
          ),
        ],
      });
    } else {
      const evidence = getNodeEvidence(node);
      await updateNodeEvidence(deps, userId, node.nodeId, {
        continueCount: asNumber(evidence.continueCount, 0) + 1,
        confidence: clamp(computeNodeConfidence(node) + 0.03),
      });
      await deps.updateDialogTutorState(userId, dialogId, {
        activeNodeId: node.nodeId,
        lastTutorAction: 'advance',
      });
      await materializeTutorNodeStep(deps, userId, dialogId, node, {
        action: 'advance',
        includeCode: false,
        stepIntent: 'continue_with_tighter_checkpoint',
      });
      await safeRecordDialogLearnerObservation(deps, userId, {
        surface: 'dialog',
        eventType: 'tutor_continue',
        sourceId: dialogId,
        sourceTitle: node.title,
        summary: `The learner continued working on "${node.title}" and the tutor tightened the checkpoint.`,
        payloadJson: {
          nodeId: node.nodeId,
          status: node.status,
        },
        conceptHints: [buildNodeObservationHint(node, `Continues practicing ${node.title}`)],
      });
    }
  } else if (payload.action === 'understood') {
    const evidence = getNodeEvidence(node);
    const updatedNode = await updateNodeEvidence(deps, userId, node.nodeId, {
      understoodCount: asNumber(evidence.understoodCount, 0) + 1,
      confidence: clamp(computeNodeConfidence(node) + 0.12),
    });

    if (evaluateNodeMastery(updatedNode, { explicitUnderstood: true })) {
      await deps.updateDialogPlanNode(userId, node.nodeId, { status: 'mastered' });
      await deps.updateDialogTutorState(userId, dialogId, {
        lastTutorAction: 'understood',
      });
      await advanceToNextTutorNode(deps, userId, dialogId, 'understood');
      await safeRecordDialogLearnerObservation(deps, userId, {
        surface: 'dialog',
        eventType: 'tutor_understood_mastered',
        sourceId: dialogId,
        sourceTitle: updatedNode.title,
        summary: `The learner explicitly marked "${updatedNode.title}" as understood and it passed the mastery gate.`,
        payloadJson: {
          nodeId: updatedNode.nodeId,
          status: 'mastered',
        },
        conceptHints: [
          buildNodeObservationHint(
            { ...updatedNode, status: 'mastered' } as IDialogPlanNode,
            `Explicitly understood ${updatedNode.title}`,
          ),
        ],
      });
    } else {
      await deps.updateDialogTutorState(userId, dialogId, {
        activeNodeId: node.nodeId,
        lastTutorAction: 'understood',
      });
      await materializeTutorNodeStep(deps, userId, dialogId, updatedNode, {
        action: 'understood',
        includeCode: node.nodeType !== 'concept' && node.nodeType !== 'synthesis',
        stepIntent: 'mastery_not_yet_sufficient',
      });
      await safeRecordDialogLearnerObservation(deps, userId, {
        surface: 'dialog',
        eventType: 'tutor_understood_needs_more',
        sourceId: dialogId,
        sourceTitle: updatedNode.title,
        summary: `The learner marked "${updatedNode.title}" as understood, but the tutor kept the node active for more evidence.`,
        payloadJson: {
          nodeId: updatedNode.nodeId,
          status: updatedNode.status,
        },
        conceptHints: [
          buildNodeObservationHint(updatedNode, `Partial understanding of ${updatedNode.title}`),
        ],
      });
    }
  } else if (payload.action === 'break_down') {
    const existingChildren = getNodeChildren(tutorWorkspace.nodes, node.nodeId);
    let childNodes = existingChildren;

    if (childNodes.length === 0) {
      const templates = await generateBreakdownTemplates(node, learner);
      childNodes = await Promise.all(
        templates.map((template, index) =>
          deps.createDialogPlanNode(userId, {
            dialogId,
            parentNodeId: node.nodeId,
            dependencyNodeIds: [],
            nodeType: template.nodeType,
            title: template.title,
            objective: template.objective,
            sourceAnchors: node.sourceAnchors,
            status: 'not_started',
            depth: node.depth + 1,
            priority: node.priority * 10 + index + 1,
            masteryEvidenceJson: {
              confidence: clamp(computeNodeConfidence(node) - 0.08),
              inheritedFromNodeId: node.nodeId,
            },
            plannerNotes: `Breakdown of ${node.title}`,
          }),
        ),
      );
    }

    const evidence = getNodeEvidence(node);
    await deps.updateDialogPlanNode(userId, node.nodeId, {
      status: 'needs_breakdown',
      masteryEvidenceJson: {
        ...evidence,
        breakdownCount: asNumber(evidence.breakdownCount, 0) + 1,
        confidence: clamp(computeNodeConfidence(node) - 0.08),
      },
    });
    await deps.updateDialogTutorState(userId, dialogId, {
      activeNodeId: childNodes[0]?.nodeId ?? null,
      planVersion: tutorState.planVersion + 1,
      lastTutorAction: 'break_down',
      learnerModelJson: {
        ...((tutorState.learnerModelJson as Record<string, unknown> | null) ?? {}),
        breakdowns:
          asNumber(
            ((tutorState.learnerModelJson as Record<string, unknown> | null) ?? {}).breakdowns,
            0,
          ) + 1,
      },
    });

    if (childNodes[0]) {
      await materializeTutorNodeStep(deps, userId, dialogId, childNodes[0], {
        action: 'break_down',
        includeCode: childNodes[0].nodeType !== 'concept' && childNodes[0].nodeType !== 'synthesis',
        stepIntent: 'breakdown_child_activation',
      });
    }
    await safeRecordDialogLearnerObservation(deps, userId, {
      surface: 'dialog',
      eventType: 'tutor_break_down',
      sourceId: dialogId,
      sourceTitle: node.title,
      summary: `The learner needed "${node.title}" to be broken into smaller steps.`,
      payloadJson: {
        nodeId: node.nodeId,
        childNodeIds: childNodes.map((child) => child.nodeId),
      },
      conceptHints: [
        buildNodeObservationHint(
          { ...node, status: 'needs_breakdown' } as IDialogPlanNode,
          `Needed breakdown for ${node.title}`,
        ),
        ...childNodes
          .slice(0, 3)
          .map((child) => buildNodeObservationHint(child, `Breakdown child for ${node.title}`)),
      ],
      relationHints: childNodes.slice(0, 4).map((child) => ({
        fromLabel: node.title,
        toLabel: child.title,
        relation: 'depends_on',
        weight: 0.62,
      })),
    });
  } else if (payload.action === 'stuck') {
    const evidence = getNodeEvidence(node);
    const updatedNode = await updateNodeEvidence(deps, userId, node.nodeId, {
      stuckCount: asNumber(evidence.stuckCount, 0) + 1,
      confidence: clamp(computeNodeConfidence(node) - 0.14),
    });
    await deps.updateDialogTutorState(userId, dialogId, {
      activeNodeId: node.nodeId,
      lastTutorAction: 'stuck',
      learnerModelJson: {
        ...((tutorState.learnerModelJson as Record<string, unknown> | null) ?? {}),
        stuckMoments:
          asNumber(
            ((tutorState.learnerModelJson as Record<string, unknown> | null) ?? {}).stuckMoments,
            0,
          ) + 1,
      },
    });
    await materializeTutorNodeStep(deps, userId, dialogId, updatedNode, {
      action: 'stuck',
      includeCode: false,
      stepIntent: 'remediation',
    });
    await safeRecordDialogLearnerObservation(deps, userId, {
      surface: 'dialog',
      eventType: 'tutor_stuck',
      sourceId: dialogId,
      sourceTitle: updatedNode.title,
      summary: `The learner signaled they were stuck on "${updatedNode.title}" and the tutor shifted into remediation mode.`,
      payloadJson: {
        nodeId: updatedNode.nodeId,
        status: updatedNode.status,
      },
      conceptHints: [buildNodeObservationHint(updatedNode, `Stuck on ${updatedNode.title}`)],
    });
  } else if (payload.action === 'skip') {
    const evidence = getNodeEvidence(node);
    await deps.updateDialogPlanNode(userId, node.nodeId, {
      status: 'skipped',
      masteryEvidenceJson: {
        ...evidence,
        skipCount: asNumber(evidence.skipCount, 0) + 1,
      },
    });
    await deps.updateDialogTutorState(userId, dialogId, {
      lastTutorAction: 'skip',
    });
    await advanceToNextTutorNode(deps, userId, dialogId, 'skip');
    await safeRecordDialogLearnerObservation(deps, userId, {
      surface: 'dialog',
      eventType: 'tutor_skip',
      sourceId: dialogId,
      sourceTitle: node.title,
      summary: `The learner skipped "${node.title}" and moved on.`,
      payloadJson: {
        nodeId: node.nodeId,
        status: 'skipped',
      },
      conceptHints: [
        buildNodeObservationHint(
          { ...node, status: 'skipped' } as IDialogPlanNode,
          `Skipped ${node.title}`,
        ),
      ],
    });
  }

  await syncTutorCompletion(deps, userId, dialogId);
  return {
    workspace: await buildWorkspace(deps, userId, dialogId),
    tutor: await buildTutorWorkspace(deps, userId, dialogId),
  };
}

export async function updateDialog(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  payload: UpdateDialogPayload,
) {
  const dialog = await requireDialog(deps, userId, dialogId);
  const updated = await deps.updateDialog(userId, dialogId, {
    title: payload.title?.trim() ? sanitizeTitle(payload.title) : dialog.title,
    description: payload.description?.trim() || null,
    teachingMode: payload.teachingMode ?? dialog.teachingMode,
  });

  if (!updated) {
    throw new Error('Dialog not found');
  }

  return buildWorkspace(deps, userId, dialogId);
}

export async function createStarterDialog(
  deps: DialogServiceDeps,
  userId: string,
  payload: CreateStarterDialogPayload,
) {
  const hasDocument = Boolean(payload.documentId);
  const hasRepo = Boolean(payload.repoUrl?.trim());

  if (!hasDocument && !hasRepo) {
    throw new Error('A paper document or GitHub repository is required');
  }

  const [paperContext, repoContext] = await Promise.all([
    hasDocument
      ? (async () => {
          const document = await deps.getStudyDocument(userId, payload.documentId ?? '');
          if (!document) {
            throw new Error('Document not found');
          }
          const renderVersion = await deps.getActiveDocumentRenderVersion(
            userId,
            document.documentId,
          );
          if (!renderVersion) {
            throw new Error('Document render version not found');
          }
          return extractPaperContext(document, renderVersion);
        })()
      : Promise.resolve<PaperContext | null>(null),
    hasRepo
      ? ensureRepoContext(payload.repoUrl?.trim() ?? '')
      : Promise.resolve<RepoContext | null>(null),
  ]);

  const trajectories = buildTrajectories(paperContext?.document.title, repoContext?.repoSlug);
  const defaultTrajectory = getDefaultTrajectory(trajectories);
  const learner = await getLearnerWorkspace(deps, userId);
  const dialog = await deps.createDialog(userId, {
    projectId: payload.projectId ?? null,
    title: buildStarterTitle(paperContext, repoContext, payload.title),
    description: buildStarterDescription(paperContext, repoContext),
    teachingMode: payload.teachingMode ?? 'teach_me',
    sourceManifestJson: [],
    metadataJson: {
      trajectories,
      repoPath: repoContext?.repoPath ?? null,
    },
    selectedTrajectoryKey: defaultTrajectory.key,
  });

  const dialogImports: IDialogImport[] = [];

  if (paperContext) {
    dialogImports.push(
      await deps.createDialogImport(userId, {
        dialogId: dialog.dialogId,
        sourceType: 'paper',
        sourceRef: paperContext.document.documentId,
        title: paperContext.document.title,
        metadataJson: {
          documentId: paperContext.document.documentId,
          renderVersionId: paperContext.renderVersion.renderVersionId,
          sourceKind: paperContext.document.sourceKind,
        },
      }),
    );
  }

  if (repoContext) {
    dialogImports.push(
      await deps.createDialogImport(userId, {
        dialogId: dialog.dialogId,
        sourceType: 'repository',
        sourceRef: repoContext.repoUrl,
        title: repoContext.repoSlug,
        metadataJson: {
          repoSlug: repoContext.repoSlug,
          repoPath: repoContext.repoPath,
          importantPaths: repoContext.importantPaths,
          treeLines: repoContext.treeLines.slice(0, 80),
          summary: repoContext.summary,
        },
      }),
    );
  }

  await deps.updateDialog(userId, dialog.dialogId, {
    sourceManifestJson: dialogImports.map((dialogImport) => ({
      importId: dialogImport.importId,
      sourceType: dialogImport.sourceType,
      sourceRef: dialogImport.sourceRef,
      title: dialogImport.title,
      metadata: (dialogImport.metadataJson as Record<string, unknown> | null) ?? null,
    })),
  });

  const sourceMaps: IDialogSourceMap[] =
    paperContext && repoContext
      ? await Promise.all(
          buildMappingRows(paperContext, repoContext).map((row) =>
            deps.createDialogSourceMap(userId, {
              dialogId: dialog.dialogId,
              paperAnchor: row.paperAnchor,
              repoPath: row.repoPath,
              mappingType: 'starter_hypothesis',
              confidence: row.confidence,
              notesMarkdown: row.notesMarkdown,
            }),
          ),
        )
      : [];

  const planNodes = await Promise.all(
    (
      await generateInitialPlanNodes(
        paperContext,
        repoContext,
        sourceMaps.map((sourceMap) => ({
          paperAnchor: sourceMap.paperAnchor,
          repoPath: sourceMap.repoPath,
        })),
        defaultTrajectory,
        learner,
      )
    ).map((node) =>
      deps.createDialogPlanNode(userId, {
        dialogId: dialog.dialogId,
        parentNodeId: null,
        dependencyNodeIds: node.nodeType === 'synthesis' ? [] : [],
        nodeType: node.nodeType,
        title: node.title,
        objective: node.objective,
        sourceAnchors: node.sourceAnchors,
        status: 'not_started',
        depth: 0,
        priority: node.priority,
        masteryEvidenceJson: {
          confidence: node.nodeType === 'synthesis' ? 0.05 : 0.2,
          initializedFrom: {
            hasPaper: Boolean(paperContext),
            hasRepo: Boolean(repoContext),
          },
        },
        plannerNotes: node.plannerNotes,
      }),
    ),
  );

  const nonSynthesisRootIds = planNodes
    .filter((node) => node.nodeType !== 'synthesis')
    .map((node) => node.nodeId);
  const synthesisNode = planNodes.find((node) => node.nodeType === 'synthesis') ?? null;
  if (synthesisNode && nonSynthesisRootIds.length > 0) {
    await deps.updateDialogPlanNode(userId, synthesisNode.nodeId, {
      dependencyNodeIds: nonSynthesisRootIds,
    });
  }

  const rootNodeIds = planNodes.map((node) => node.nodeId);
  const initialActiveNode = getReadyLeafNodes(planNodes, defaultTrajectory.key)[0] ?? planNodes[0];

  await deps.createDialogTutorState(userId, {
    dialogId: dialog.dialogId,
    selectedTrajectoryKey: defaultTrajectory.key,
    activeNodeId: initialActiveNode?.nodeId ?? null,
    rootNodeIds,
    learnerModelJson: {
      confidenceByNode: {},
      breakdowns: 0,
      stuckMoments: 0,
    },
    planVersion: 1,
    lastTutorAction: 'initialized',
    completionState: 'active',
  });

  if (initialActiveNode) {
    await materializeTutorNodeStep(deps, userId, dialog.dialogId, initialActiveNode, {
      action: 'activate',
      includeCode:
        initialActiveNode.nodeType !== 'concept' && initialActiveNode.nodeType !== 'synthesis',
      stepIntent: 'initial_activation',
    });
  }

  await safeRecordDialogLearnerObservation(deps, userId, {
    surface: 'dialog',
    eventType: 'starter_dialog_initialized',
    sourceId: dialog.dialogId,
    sourceTitle: dialog.title,
    summary: `A new starter dialog was initialized with ${defaultTrajectory.title}.`,
    payloadJson: {
      trajectoryKey: defaultTrajectory.key,
      hasPaper: Boolean(paperContext),
      hasRepo: Boolean(repoContext),
      rootNodeIds,
    },
    conceptHints: planNodes
      .slice(0, 5)
      .map((node) => buildNodeObservationHint(node, `Root curriculum node for ${dialog.title}`)),
    relationHints:
      rootNodeIds.length > 1
        ? rootNodeIds.slice(1, 4).map((_nodeId, index) => ({
            fromLabel: planNodes[0].title,
            toLabel: planNodes[index + 1].title,
            relation: 'bridges',
            weight: 0.38,
          }))
        : [],
  });

  return buildWorkspace(deps, userId, dialog.dialogId);
}

export async function createDialogCell(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  payload: CreateDialogCellPayload,
) {
  await requireDialog(deps, userId, dialogId);
  const cells = await deps.listDialogCells(userId, dialogId);
  let cellRole: IDialogCellMetadata['cellRole'] = 'instruction';

  if (payload.cellType === 'output') {
    cellRole = 'output';
  } else if (payload.cellType === 'prompt') {
    cellRole = 'assistant_query';
  } else if (payload.cellType === 'code') {
    cellRole = 'exercise';
  }

  await deps.createDialogCell(userId, {
    dialogId,
    position: getNextPosition(cells),
    cellType: payload.cellType,
    title: payload.title?.trim() || null,
    sourceMarkdown: payload.sourceMarkdown ?? null,
    sourceCode: payload.sourceCode ?? null,
    metadataJson: {
      authoredBy: 'user',
      cellRole,
    },
  });

  return buildWorkspace(deps, userId, dialogId);
}

export async function updateDialogCell(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  cellId: string,
  payload: UpdateDialogCellPayload,
) {
  await requireDialogCell(deps, userId, dialogId, cellId);
  const updated = await deps.updateDialogCell(userId, cellId, {
    title: payload.title?.trim() || null,
    sourceMarkdown: payload.sourceMarkdown ?? null,
    sourceCode: payload.sourceCode ?? null,
  });

  if (!updated) {
    throw new Error('Dialog cell not found');
  }

  return buildWorkspace(deps, userId, dialogId);
}

export async function selectDialogTrajectory(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  payload: SelectTrajectoryPayload,
) {
  const workspace = await buildWorkspace(deps, userId, dialogId);
  const trajectory = getTrajectories(workspace.dialog).find(
    (candidate) => candidate.key === payload.trajectoryKey,
  );

  if (!trajectory) {
    throw new Error('Trajectory not found');
  }

  await deps.updateDialog(userId, dialogId, {
    selectedTrajectoryKey: trajectory.key,
  });
  const tutorState = await deps.getDialogTutorState(userId, dialogId);
  if (tutorState) {
    await deps.updateDialogTutorState(userId, dialogId, {
      selectedTrajectoryKey: trajectory.key,
    });

    const activeNode = tutorState.activeNodeId
      ? await deps.getDialogPlanNode(userId, tutorState.activeNodeId)
      : null;

    if (!activeNode || isNodeResolved(activeNode.status)) {
      const nextNode = await chooseNextTutorNode(deps, userId, dialogId);
      if (nextNode) {
        await deps.updateDialogTutorState(userId, dialogId, {
          activeNodeId: nextNode.nodeId,
        });
      }
    }
  }

  await safeRecordDialogLearnerObservation(deps, userId, {
    surface: 'dialog',
    eventType: 'trajectory_selected',
    sourceId: dialogId,
    sourceTitle: workspace.dialog.title,
    summary: `The learner selected the ${trajectory.title} trajectory for ${workspace.dialog.title}.`,
    payloadJson: {
      trajectoryKey: trajectory.key,
    },
    conceptHints: [],
  });

  return buildWorkspace(deps, userId, dialogId);
}

export async function executeDialogCell(
  deps: DialogServiceDeps,
  userId: string,
  dialogId: string,
  cellId: string,
) {
  const workspace = await buildWorkspace(deps, userId, dialogId);
  const cell = workspace.cells.find((candidate) => candidate.cellId === cellId);
  if (!cell || cell.dialogId !== dialogId) {
    throw new Error('Dialog cell not found');
  }

  if (cell.cellType !== 'code' && cell.cellType !== 'prompt') {
    throw new Error('Only code and prompt cells can be executed');
  }

  const source = getCellText(cell).trim();
  if (!source) {
    throw new Error('Dialog cell is empty');
  }

  const tutorWorkspace = await buildTutorWorkspace(deps, userId, dialogId);
  const learner = await getLearnerWorkspace(deps, userId);
  const cellMetadata = getCellMetadata(cell);
  const node = cellMetadata.nodeId
    ? (tutorWorkspace.nodes.find((candidate) => candidate.nodeId === cellMetadata.nodeId) ?? null)
    : null;

  const executionRun = await deps.createDialogExecutionRun(userId, {
    dialogId,
    cellId,
    kernelSessionId: cell.cellType === 'code' ? dialogId : `prompt:${dialogId}`,
    status: 'running',
    startedAt: new Date(),
  });

  if (cell.cellType === 'code') {
    try {
      const repoPath = getRepoImportPath(workspace.imports);
      const result = await executeInKernel(dialogId, source, repoPath);
      const status = result.error ? 'failed' : 'succeeded';
      const updatedRun = await deps.updateDialogExecutionRun(userId, executionRun.runId, {
        status,
        stdout: result.stdout,
        stderr: result.stderr,
        resultJson: result.result ? { repr: result.result.repr } : null,
        finishedAt: new Date(),
      });

      if (!updatedRun) {
        throw new Error('Failed to update dialog execution run');
      }

      await upsertOutputCell(
        deps,
        userId,
        dialogId,
        cell,
        updatedRun,
        buildExecutionOutputMarkdown(
          'code',
          result.stdout,
          result.stderr,
          result.result,
          result.error,
          result.traceback,
        ),
      );

      if (node) {
        const evidence = getNodeEvidence(node);
        const updatedNode = await updateNodeEvidence(deps, userId, node.nodeId, {
          codeRuns: asNumber(evidence.codeRuns, 0) + 1,
          codeSuccesses: asNumber(evidence.codeSuccesses, 0) + (status === 'succeeded' ? 1 : 0),
          codeFailures: asNumber(evidence.codeFailures, 0) + (status === 'failed' ? 1 : 0),
          lastCodeStatus: status,
          confidence: clamp(computeNodeConfidence(node) + (status === 'succeeded' ? 0.1 : -0.08)),
        });
        await safeRecordDialogLearnerObservation(deps, userId, {
          surface: 'dialog',
          eventType: status === 'succeeded' ? 'code_execution_succeeded' : 'code_execution_failed',
          sourceId: dialogId,
          sourceTitle: updatedNode.title,
          summary: `A code exercise for "${updatedNode.title}" ${status === 'succeeded' ? 'succeeded' : 'failed'}.`,
          payloadJson: {
            nodeId: updatedNode.nodeId,
            cellId,
            status,
          },
          conceptHints: [
            buildNodeObservationHint(
              updatedNode,
              `${status === 'succeeded' ? 'Successful' : 'Failed'} code exercise for ${updatedNode.title}`,
            ),
          ],
        });
      }

      return buildWorkspace(deps, userId, dialogId);
    } catch (error) {
      if (node) {
        const evidence = getNodeEvidence(node);
        const updatedNode = await updateNodeEvidence(deps, userId, node.nodeId, {
          codeRuns: asNumber(evidence.codeRuns, 0) + 1,
          codeFailures: asNumber(evidence.codeFailures, 0) + 1,
          lastCodeStatus: 'failed',
          confidence: clamp(computeNodeConfidence(node) - 0.12),
        });
        await safeRecordDialogLearnerObservation(deps, userId, {
          surface: 'dialog',
          eventType: 'code_execution_failed',
          sourceId: dialogId,
          sourceTitle: updatedNode.title,
          summary: `A code exercise for "${updatedNode.title}" failed before producing a successful result.`,
          payloadJson: {
            nodeId: updatedNode.nodeId,
            cellId,
            status: 'failed',
          },
          conceptHints: [
            buildNodeObservationHint(updatedNode, `Failed code exercise for ${updatedNode.title}`),
          ],
        });
      }
      return failExecutionRun(deps, userId, dialogId, cell, executionRun, error);
    }
  }

  try {
    const client = getOpenAIClient();
    const model = await resolveModel(client);
    const isCheckpoint = cellMetadata.cellRole === 'checkpoint' && node;
    const messages = isCheckpoint
      ? buildCheckpointEvaluationMessages(workspace.dialog, node, workspace.cells, source)
      : buildPromptMessages(
          buildPromptContext(
            workspace.dialog,
            workspace.cells,
            workspace.imports,
            workspace.sourceMaps,
            source,
            tutorWorkspace.nodes,
            tutorWorkspace.tutorState,
            learner,
          ),
        );
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages,
    });

    const responseText =
      completion.choices[0]?.message?.content?.trim() || 'No response generated.';
    if (isCheckpoint && node) {
      const evaluation = parseCheckpointEvaluation(responseText);
      const updatedRun = await deps.updateDialogExecutionRun(userId, executionRun.runId, {
        status: 'succeeded',
        resultJson: {
          content: evaluation.feedback,
          model,
          passed: evaluation.passed,
          score: evaluation.score,
          nextStep: evaluation.nextStep,
        },
        finishedAt: new Date(),
      });

      if (!updatedRun) {
        throw new Error('Failed to update prompt execution run');
      }

      await upsertOutputCell(
        deps,
        userId,
        dialogId,
        cell,
        updatedRun,
        buildCheckpointFeedbackMarkdown(evaluation),
      );

      const evidence = getNodeEvidence(node);
      const updatedNode = await updateNodeEvidence(deps, userId, node.nodeId, {
        checkpointAttempts: asNumber(evidence.checkpointAttempts, 0) + 1,
        checkpointPassed: evaluation.passed,
        checkpointScore: evaluation.score,
        learnerResponse: source,
        lastCheckpointFeedback: evaluation.feedback,
        lastCheckpointAt: new Date().toISOString(),
        confidence: clamp(
          computeNodeConfidence(node) +
            (evaluation.passed ? Math.max(0.12, evaluation.score * 0.18) : -0.04),
        ),
      });
      await safeRecordDialogLearnerObservation(deps, userId, {
        surface: 'dialog',
        eventType: evaluation.passed ? 'checkpoint_passed' : 'checkpoint_needs_more',
        sourceId: dialogId,
        sourceTitle: updatedNode.title,
        summary: `The checkpoint for "${updatedNode.title}" ${evaluation.passed ? 'passed' : 'did not yet pass'} with score ${evaluation.score.toFixed(2)}.`,
        payloadJson: {
          nodeId: updatedNode.nodeId,
          cellId,
          passed: evaluation.passed,
          score: evaluation.score,
        },
        conceptHints: [
          buildNodeObservationHint(updatedNode, `Checkpoint evidence for ${updatedNode.title}`),
        ],
      });

      return buildWorkspace(deps, userId, dialogId);
    }

    const updatedRun = await deps.updateDialogExecutionRun(userId, executionRun.runId, {
      status: 'succeeded',
      resultJson: {
        content: responseText,
        model,
      },
      finishedAt: new Date(),
    });

    if (!updatedRun) {
      throw new Error('Failed to update prompt execution run');
    }

    await upsertOutputCell(deps, userId, dialogId, cell, updatedRun, responseText);

    if (node) {
      await safeRecordDialogLearnerObservation(deps, userId, {
        surface: 'dialog',
        eventType: 'assistant_query_response',
        sourceId: dialogId,
        sourceTitle: node.title,
        summary: `The learner ran an assistant query against "${node.title}".`,
        payloadJson: {
          nodeId: node.nodeId,
          cellId,
        },
        conceptHints: [buildNodeObservationHint(node, `Assistant query on ${node.title}`)],
      });
    }

    return buildWorkspace(deps, userId, dialogId);
  } catch (error) {
    return failExecutionRun(deps, userId, dialogId, cell, executionRun, error);
  }
}

export async function createDialogClarification(
  deps: DialogServiceDeps,
  userId: string,
  payload: CreateDialogClarificationPayload,
) {
  const clarificationQuestion = payload.clarificationQuestion.trim();
  if (!clarificationQuestion) {
    throw new Error('Clarification question is required');
  }

  const dialog = await requireDialog(deps, userId, payload.dialogId);
  const cell = await requireDialogCell(deps, userId, payload.dialogId, payload.cellId);
  const client = getOpenAIClient();
  const model = await resolveModel(client);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: buildClarificationMessages(dialog, cell, payload.anchor, clarificationQuestion),
  });

  const answer =
    completion.choices[0]?.message?.content?.trim() || 'No clarification answer was generated.';
  const clarification = await deps.createDialogClarification(userId, {
    dialogId: payload.dialogId,
    cellId: payload.cellId,
    anchor: payload.anchor,
    clarificationQuestion,
    clarificationAnswer: answer,
    promptText: clarificationQuestion,
    modelProvider: 'openai',
    modelName: model,
  });

  const nodeId = getCellMetadata(cell).nodeId;
  if (nodeId) {
    const node = await deps.getDialogPlanNode(userId, nodeId);
    if (node) {
      const evidence = getNodeEvidence(node);
      const updatedNode = await updateNodeEvidence(deps, userId, nodeId, {
        clarifications: asNumber(evidence.clarifications, 0) + 1,
        confidence: clamp(computeNodeConfidence(node) + 0.04),
      });
      await safeRecordDialogLearnerObservation(deps, userId, {
        surface: 'dialog',
        eventType: 'dialog_clarification',
        sourceId: payload.dialogId,
        sourceTitle: updatedNode.title,
        summary: `The learner requested a clarification on "${payload.anchor.anchorText}" while working on "${updatedNode.title}".`,
        payloadJson: {
          nodeId,
          clarificationId: clarification.clarificationId,
          anchorText: payload.anchor.anchorText,
        },
        conceptHints: [
          buildNodeObservationHint(
            updatedNode,
            `Clarification requested for ${updatedNode.title}`,
            payload.anchor.anchorText,
          ),
        ],
      });
    }
  }

  return clarification;
}

export async function integrateDialogClarification(
  deps: DialogServiceDeps,
  userId: string,
  payload: IntegrateDialogClarificationPayload,
) {
  const clarification = await deps.getDialogClarification(userId, payload.clarificationId);
  if (!clarification) {
    throw new Error('Dialog clarification not found');
  }

  return deps.updateDialogClarification(userId, clarification.clarificationId, {
    status: payload.displayMode === 'nested' ? 'active' : 'integrated',
    integratedAt: payload.displayMode === 'nested' ? null : new Date(),
  });
}

export async function createDialogVisualization(
  deps: DialogServiceDeps,
  userId: string,
  payload: CreateDialogVisualizationPayload,
  context: DialogModelContext = {},
) {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new Error('Visualization prompt is required');
  }

  assertSupportedArtifactType(payload.artifactType);
  const dialog = await requireDialog(deps, userId, payload.dialogId);
  const cell = await requireDialogCell(deps, userId, payload.dialogId, payload.cellId);
  const client = getOpenAIClient();
  const model = await resolveModel(client);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: buildVisualizationMessages(
      dialog,
      cell,
      payload.anchor,
      prompt,
      payload.artifactType,
    ),
  });

  const rawResponse = completion.choices[0]?.message?.content?.trim();
  if (!rawResponse) {
    throw new Error('Visualization generation returned no content');
  }

  const envelope = parseVisualizationEnvelope(rawResponse, payload.artifactType, prompt, model);
  assertSupportedArtifactType(envelope.artifactType);
  const visualizationId = crypto.randomUUID();
  const stored = await buildStoredVisualization(
    context.appConfig,
    visualizationId,
    envelope.artifactType,
    envelope,
  );

  const visualization = await deps.createDialogVisualization(userId, {
    visualizationId,
    dialogId: payload.dialogId,
    cellId: payload.cellId,
    anchor: payload.anchor,
    title: envelope.title,
    description: stored.description,
    artifactType: envelope.artifactType,
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
  });

  const nodeId = getCellMetadata(cell).nodeId;
  if (nodeId) {
    const node = await deps.getDialogPlanNode(userId, nodeId);
    if (node) {
      const evidence = getNodeEvidence(node);
      const updatedNode = await updateNodeEvidence(deps, userId, nodeId, {
        visualizations: asNumber(evidence.visualizations, 0) + 1,
        confidence: clamp(computeNodeConfidence(node) + 0.05),
      });
      await safeRecordDialogLearnerObservation(deps, userId, {
        surface: 'dialog',
        eventType: 'dialog_visualization',
        sourceId: payload.dialogId,
        sourceTitle: updatedNode.title,
        summary: `The learner requested a ${payload.artifactType} visualization for "${payload.anchor.anchorText}" while working on "${updatedNode.title}".`,
        payloadJson: {
          nodeId,
          visualizationId: visualization.visualizationId,
          anchorText: payload.anchor.anchorText,
          artifactType: payload.artifactType,
        },
        conceptHints: [
          buildNodeObservationHint(
            updatedNode,
            `Visualization requested for ${updatedNode.title}`,
            payload.anchor.anchorText,
          ),
        ],
      });
    }
  }

  return visualization;
}

export async function integrateDialogVisualization(
  deps: DialogServiceDeps,
  userId: string,
  payload: IntegrateDialogVisualizationPayload,
) {
  const visualization = await deps.getDialogVisualization(userId, payload.visualizationId, true);
  if (!visualization) {
    throw new Error('Dialog visualization not found');
  }

  const integrationState = payload.displayMode === 'nested' ? 'nested_only' : 'integrated';
  return deps.updateDialogVisualization(userId, visualization.visualizationId, {
    integrationState,
    integratedAt: integrationState === 'integrated' ? new Date() : null,
  });
}

export async function deleteDialogVisualization(
  deps: DialogServiceDeps,
  userId: string,
  visualizationId: string,
) {
  const visualization = await deps.getDialogVisualization(userId, visualizationId, true);
  if (!visualization) {
    throw new Error('Dialog visualization not found');
  }

  return deps.updateDialogVisualization(userId, visualization.visualizationId, {
    deletedAt: new Date(),
    status: 'archived',
    isLatestVersion: false,
    integrationState: 'detached',
    integratedAt: null,
  });
}

export async function getDialogVisualizationRenderPayload(
  deps: DialogServiceDeps,
  userId: string,
  visualizationId: string,
  context: DialogModelContext = {},
) {
  const visualization = await deps.getDialogVisualization(userId, visualizationId, false);
  if (!visualization || visualization.deletedAt || visualization.status === 'archived') {
    throw new Error('Dialog visualization not found');
  }

  return loadVisualizationPayload(
    context.appConfig,
    visualization.compiledRenderMimeType,
    visualization.compiledRenderText,
    visualization.compiledRenderStoragePath,
  );
}
