import OpenAI from 'openai';
import type {
  AllMethods,
  AppConfig,
  ILearnerEvent,
  ILearnerKnowledgeEdge,
  ILearnerKnowledgeNode,
  ILearnerProfile,
  ILearnerSourceRef,
  LearnerKnowledgeCategory,
  LearnerKnowledgeStatus,
  LearnerSurface,
} from '@librechat/data-schemas';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getConfiguredOpenAIBaseURL } from '~/files/native';

type LearnerModelContext = {
  appConfig?: AppConfig;
};

type LearnerNodeHint = {
  label: string;
  category?: LearnerKnowledgeCategory;
  mastery?: number;
  confidence?: number;
  evidenceSummary?: string | null;
  aliases?: string[];
  sourceLabel?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

type LearnerRelationHint = {
  fromLabel: string;
  toLabel: string;
  relation: string;
  weight?: number;
};

export type LearnerObservationPayload = {
  surface: LearnerSurface;
  eventType: string;
  sourceId: string;
  sourceTitle?: string | null;
  summary: string;
  payloadJson?: Record<string, unknown> | null;
  conceptHints?: LearnerNodeHint[];
  relationHints?: LearnerRelationHint[];
};

type LearnerDeltaNode = {
  label: string;
  category: LearnerKnowledgeCategory;
  mastery: number;
  confidence: number;
  evidenceSummary: string;
  aliases: string[];
  sourceLabels: string[];
};

type LearnerDeltaEdge = {
  fromLabel: string;
  toLabel: string;
  relation: string;
  weight: number;
};

type LearnerDelta = {
  profileSummaryMarkdown: string;
  knowledgeLevelSummary: string;
  currentFocusLabels: string[];
  learningPreferencesJson: Record<string, unknown> | null;
  nodes: LearnerDeltaNode[];
  edges: LearnerDeltaEdge[];
};

export type LearnerWorkspace = {
  profile: ILearnerProfile;
  nodes: ILearnerKnowledgeNode[];
  edges: ILearnerKnowledgeEdge[];
  recentEvents: ILearnerEvent[];
};

export type ChatTurnLearnerObservationPayload = {
  conversationId: string;
  conversationTitle?: string | null;
  userText: string;
  assistantText: string;
  endpoint?: string | null;
  model?: string | null;
  isRegenerate?: boolean;
  isTemporary?: boolean;
};

export interface LearnerServiceDeps {
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

const DEFAULT_DIRECT_MODEL = 'gpt-4o-mini';
const DEFAULT_PROXY_MODELS = ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-5.4', 'gpt-5', 'gpt-4o-mini'];

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for learner-state synthesis');
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

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function dedupeStrings(values: string[]): string[] {
  return values.filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clipText(value: string, maxLength = 320): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getKnowledgeStatus(mastery: number): LearnerKnowledgeStatus {
  if (mastery >= 0.82) {
    return 'mastered';
  }
  if (mastery >= 0.62) {
    return 'solid';
  }
  if (mastery >= 0.35) {
    return 'practicing';
  }
  return 'emerging';
}

function getHintCategory(hint?: LearnerKnowledgeCategory): LearnerKnowledgeCategory {
  return hint ?? 'concept';
}

function getSourceRefs(
  payload: LearnerObservationPayload,
  node: LearnerDeltaNode,
): ILearnerSourceRef[] {
  return [
    {
      surface: payload.surface,
      sourceId: payload.sourceId,
      label: node.sourceLabels[0] ?? payload.sourceTitle ?? node.label,
    },
  ];
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

async function ensureLearnerProfile(
  deps: LearnerServiceDeps,
  userId: string,
): Promise<ILearnerProfile> {
  const existing = await deps.getLearnerProfile(userId);
  if (existing) {
    return existing;
  }

  return deps.createLearnerProfile(userId, {
    profileSummaryMarkdown: 'The learner profile is just starting to accumulate evidence.',
    knowledgeLevelSummary: 'Knowledge state is still being established.',
    learningPreferencesJson: {
      pacing: 'adaptive',
      delivery: 'notebook-native',
    },
    currentFocusLabels: [],
    lastUpdatedFromSurface: null,
  });
}

function buildFallbackDelta(payload: LearnerObservationPayload): LearnerDelta {
  const hintedNodes =
    payload.conceptHints?.slice(0, 4).map((hint) => ({
      label: hint.label,
      category: getHintCategory(hint.category),
      mastery: clamp(hint.mastery ?? 0.28),
      confidence: clamp(hint.confidence ?? 0.4),
      evidenceSummary: hint.evidenceSummary?.trim() || payload.summary,
      aliases: dedupeStrings(hint.aliases ?? []),
      sourceLabels: dedupeStrings([hint.sourceLabel ?? payload.sourceTitle ?? hint.label]),
    })) ?? [];

  const currentFocusLabels =
    hintedNodes.length > 0
      ? hintedNodes.map((node) => node.label)
      : dedupeStrings(
          payload.summary
            .split(/[,.;:]/)
            .map((segment) => segment.trim())
            .filter((segment) => segment.length > 8)
            .slice(0, 3),
        );

  return {
    profileSummaryMarkdown: `Recent ${payload.surface} evidence: ${payload.summary}`,
    knowledgeLevelSummary: `Most recent evidence came from ${payload.surface} activity around ${payload.sourceTitle ?? payload.sourceId}.`,
    currentFocusLabels,
    learningPreferencesJson: {
      pacing: 'adaptive',
      lastSurface: payload.surface,
    },
    nodes: hintedNodes,
    edges:
      payload.relationHints?.slice(0, 4).map((edge) => ({
        fromLabel: edge.fromLabel,
        toLabel: edge.toLabel,
        relation: edge.relation,
        weight: clamp(edge.weight ?? 0.45),
      })) ?? [],
  };
}

function buildLearnerUpdateMessages(
  profile: ILearnerProfile,
  nodes: ILearnerKnowledgeNode[],
  payload: LearnerObservationPayload,
): ChatCompletionMessageParam[] {
  const nodeSummary = nodes
    .slice(0, 10)
    .map(
      (node) =>
        `- ${node.label} [${node.category}] mastery=${node.mastery.toFixed(2)} confidence=${node.confidence.toFixed(2)} status=${node.status}`,
    )
    .join('\n');

  const hintSummary = payload.conceptHints
    ?.map((hint) => `- ${hint.label}${hint.category ? ` [${hint.category}]` : ''}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: [
        'You maintain a persistent learner knowledge graph for an interactive learning environment.',
        'Given one new observation, update the learner profile conservatively.',
        'Return strict JSON with keys: profile_summary_markdown, knowledge_level_summary, current_focus_labels, learning_preferences, nodes, edges.',
        'Each node must include: label, category, mastery, confidence, evidence_summary, aliases, source_labels.',
        'Each edge must include: from_label, to_label, relation, weight.',
        'Keep 1 to 4 nodes and 0 to 4 edges.',
        'Mastery and confidence must be numbers between 0 and 1.',
        'Use the observation to reflect learner knowledge, not the curriculum plan itself.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Current profile summary:\n${profile.profileSummaryMarkdown ?? profile.knowledgeLevelSummary}`,
        `Current knowledge level summary:\n${profile.knowledgeLevelSummary}`,
        profile.currentFocusLabels.length > 0
          ? `Current focus labels:\n${profile.currentFocusLabels.join(', ')}`
          : '',
        nodeSummary ? `Existing top knowledge nodes:\n${nodeSummary}` : '',
        hintSummary ? `Observation hints:\n${hintSummary}` : '',
        `Observation surface: ${payload.surface}`,
        `Observation type: ${payload.eventType}`,
        `Observation source: ${payload.sourceTitle ?? payload.sourceId}`,
        `Observation summary:\n${payload.summary}`,
        payload.payloadJson ? `Additional payload:\n${JSON.stringify(payload.payloadJson)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

function parseLearnerDelta(rawResponse: string, payload: LearnerObservationPayload): LearnerDelta {
  const jsonCandidate = extractJsonBlock(rawResponse);
  if (!jsonCandidate) {
    return buildFallbackDelta(payload);
  }

  try {
    const parsed = JSON.parse(jsonCandidate) as {
      profile_summary_markdown?: string;
      knowledge_level_summary?: string;
      current_focus_labels?: string[];
      learning_preferences?: Record<string, unknown> | null;
      nodes?: Array<{
        label?: string;
        category?: LearnerKnowledgeCategory;
        mastery?: number;
        confidence?: number;
        evidence_summary?: string;
        aliases?: string[];
        source_labels?: string[];
      }>;
      edges?: Array<{
        from_label?: string;
        to_label?: string;
        relation?: string;
        weight?: number;
      }>;
    };

    const nodes = (parsed.nodes ?? [])
      .map((node) => ({
        label: node.label?.trim() ?? '',
        category: getHintCategory(node.category),
        mastery: clamp(typeof node.mastery === 'number' ? node.mastery : 0.28),
        confidence: clamp(typeof node.confidence === 'number' ? node.confidence : 0.42),
        evidenceSummary: node.evidence_summary?.trim() || payload.summary,
        aliases: dedupeStrings((node.aliases ?? []).map((alias) => alias.trim())),
        sourceLabels: dedupeStrings((node.source_labels ?? []).map((label) => label.trim())),
      }))
      .filter((node) => Boolean(node.label))
      .slice(0, 4);

    const edges = (parsed.edges ?? [])
      .map((edge) => ({
        fromLabel: edge.from_label?.trim() ?? '',
        toLabel: edge.to_label?.trim() ?? '',
        relation: edge.relation?.trim() ?? '',
        weight: clamp(typeof edge.weight === 'number' ? edge.weight : 0.4),
      }))
      .filter((edge) => Boolean(edge.fromLabel && edge.toLabel && edge.relation))
      .slice(0, 4);

    return {
      profileSummaryMarkdown:
        parsed.profile_summary_markdown?.trim() ||
        `Recent ${payload.surface} evidence: ${payload.summary}`,
      knowledgeLevelSummary:
        parsed.knowledge_level_summary?.trim() ||
        `Most recent evidence came from ${payload.surface} activity around ${payload.sourceTitle ?? payload.sourceId}.`,
      currentFocusLabels: dedupeStrings(
        parsed.current_focus_labels ?? nodes.map((node) => node.label),
      ),
      learningPreferencesJson: asObject(parsed.learning_preferences),
      nodes: nodes.length > 0 ? nodes : buildFallbackDelta(payload).nodes,
      edges,
    };
  } catch {
    return buildFallbackDelta(payload);
  }
}

async function generateLearnerDelta(
  profile: ILearnerProfile,
  nodes: ILearnerKnowledgeNode[],
  payload: LearnerObservationPayload,
): Promise<LearnerDelta> {
  try {
    const client = getOpenAIClient();
    const model = await resolveModel(client);
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: buildLearnerUpdateMessages(profile, nodes, payload),
    });
    const rawResponse = completion.choices[0]?.message?.content?.trim();
    if (!rawResponse) {
      return buildFallbackDelta(payload);
    }
    return parseLearnerDelta(rawResponse, payload);
  } catch {
    return buildFallbackDelta(payload);
  }
}

export async function getLearnerWorkspace(
  deps: LearnerServiceDeps,
  userId: string,
): Promise<LearnerWorkspace> {
  const profile = await ensureLearnerProfile(deps, userId);
  const [nodes, edges, recentEvents] = await Promise.all([
    deps.listLearnerKnowledgeNodes(userId, { limit: 50 }),
    deps.listLearnerKnowledgeEdges(userId),
    deps.listLearnerEvents(userId, { limit: 20 }),
  ]);

  return {
    profile,
    nodes,
    edges,
    recentEvents,
  };
}

export async function recordLearnerObservation(
  deps: LearnerServiceDeps,
  userId: string,
  payload: LearnerObservationPayload,
  _context: LearnerModelContext = {},
): Promise<LearnerWorkspace> {
  const profile = await ensureLearnerProfile(deps, userId);
  const existingNodes = await deps.listLearnerKnowledgeNodes(userId, { limit: 25 });
  const delta = await generateLearnerDelta(profile, existingNodes, payload);

  const appliedNodeIds = new Map<string, string>();
  const upsertedNodes = await Promise.all(
    delta.nodes.map(async (node) => {
      const normalizedLabel = normalizeLabel(node.label);
      const existing = await deps.getLearnerKnowledgeNodeByLabel(userId, normalizedLabel);
      const mastery = clamp(
        existing ? existing.mastery * 0.65 + node.mastery * 0.35 : node.mastery,
      );
      const confidence = clamp(
        existing ? existing.confidence * 0.6 + node.confidence * 0.4 : node.confidence,
      );
      const upserted = await deps.upsertLearnerKnowledgeNode(userId, {
        learnerNodeId: existing?.learnerNodeId,
        label: node.label,
        normalizedLabel,
        category: node.category,
        mastery,
        confidence,
        status: getKnowledgeStatus(mastery),
        evidenceSummary: node.evidenceSummary,
        aliases: dedupeStrings([...(existing?.aliases ?? []), ...node.aliases]),
        sourceRefs: dedupeStrings([
          ...(existing?.sourceRefs ?? []).map((sourceRef: ILearnerSourceRef) =>
            JSON.stringify(sourceRef),
          ),
          ...getSourceRefs(payload, node).map((sourceRef) => JSON.stringify(sourceRef)),
        ]).map((value) => JSON.parse(value) as ILearnerSourceRef),
        metadataJson: {
          ...(existing?.metadataJson ?? {}),
          lastEventType: payload.eventType,
          lastSurface: payload.surface,
        },
        lastObservedAt: new Date(),
      });

      appliedNodeIds.set(normalizedLabel, upserted.learnerNodeId);
      return upserted;
    }),
  );

  const edgePayloads = delta.edges
    .map((edge) => {
      const fromNodeId = appliedNodeIds.get(normalizeLabel(edge.fromLabel));
      const toNodeId = appliedNodeIds.get(normalizeLabel(edge.toLabel));
      if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
        return null;
      }

      return {
        fromNodeId,
        toNodeId,
        relation: edge.relation,
        weight: edge.weight,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

  const upsertedEdges = await Promise.all(
    edgePayloads.map((edge) =>
      deps.upsertLearnerKnowledgeEdge(userId, {
        ...edge,
        metadataJson: {
          lastEventType: payload.eventType,
          lastSurface: payload.surface,
        },
        lastObservedAt: new Date(),
      }),
    ),
  );

  const mergedFocus = dedupeStrings([
    ...delta.currentFocusLabels,
    ...profile.currentFocusLabels,
  ]).slice(0, 8);

  const updatedProfile = await deps.updateLearnerProfile(userId, {
    profileSummaryMarkdown: delta.profileSummaryMarkdown,
    knowledgeLevelSummary: delta.knowledgeLevelSummary,
    learningPreferencesJson: {
      ...(profile.learningPreferencesJson ?? {}),
      ...(delta.learningPreferencesJson ?? {}),
    },
    currentFocusLabels: mergedFocus,
    lastUpdatedFromSurface: payload.surface,
  });

  await deps.createLearnerEvent(userId, {
    surface: payload.surface,
    eventType: payload.eventType,
    sourceId: payload.sourceId,
    sourceTitle: payload.sourceTitle ?? null,
    summary: payload.summary,
    payloadJson: payload.payloadJson ?? null,
    appliedJson: {
      profileSummaryMarkdown: delta.profileSummaryMarkdown,
      knowledgeLevelSummary: delta.knowledgeLevelSummary,
      currentFocusLabels: mergedFocus,
      nodeIds: upsertedNodes.map((node) => node.learnerNodeId),
      edgeIds: upsertedEdges.filter(Boolean).map((edge) => edge?.learnerEdgeId),
    },
  });

  if (!updatedProfile) {
    throw new Error('Failed to update learner profile');
  }

  return getLearnerWorkspace(deps, userId);
}

export async function recordChatTurnLearnerObservation(
  deps: LearnerServiceDeps,
  userId: string,
  payload: ChatTurnLearnerObservationPayload,
): Promise<LearnerWorkspace | null> {
  if (payload.isTemporary) {
    return null;
  }

  if (!payload.conversationId?.trim()) {
    return null;
  }

  const userText = clipText(payload.userText);
  const assistantText = clipText(payload.assistantText, 520);

  if (!userText || !assistantText) {
    return null;
  }

  const sourceTitle = payload.conversationTitle?.trim() || 'Chat conversation';
  const summary = payload.isRegenerate
    ? `The learner regenerated a chat explanation after asking "${userText}".`
    : `The learner asked "${userText}" in chat and received an explanatory response.`;

  return recordLearnerObservation(deps, userId, {
    surface: 'chat',
    eventType: payload.isRegenerate ? 'chat_turn_regenerated' : 'chat_turn_completed',
    sourceId: payload.conversationId,
    sourceTitle,
    summary,
    payloadJson: {
      userText,
      assistantText,
      endpoint: payload.endpoint ?? null,
      model: payload.model ?? null,
    },
  });
}
