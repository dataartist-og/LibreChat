import OpenAI from 'openai';
import type {
  AllMethods,
  AppConfig,
  IMessage,
  IVisualizationArtifact,
  VisualizationArtifactType,
} from '@librechat/data-schemas';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getConfiguredOpenAIBaseURL } from '~/files/native';
import { extractMessageText } from '~/clarifications/prompt';
import { recordLearnerObservation } from '~/learners';
import { sanitizeTitle } from '~/utils/sanitizeTitle';
import {
  buildVisualizationMessages,
  buildVisualizationRefinementMessages,
  buildVisualizationSuggestionMessages,
} from './prompt';
import { sanitizeVisualizationByType } from './sanitize';
import { loadVisualizationPayload, persistVisualizationPayload } from './storage';

type VisualizationContext = {
  appConfig?: AppConfig;
};

type SaveImageResult = {
  content: string;
  mimeType: string;
};

type ExistingClarificationContext = {
  question: string;
  answer: string;
};

type VisualizationEnvelope = {
  title: string;
  description: string;
  artifactType: VisualizationArtifactType;
  content: string;
  rawResponse: string;
  model: string;
};

type CreateVisualizationPayload = {
  projectId?: string | null;
  conversationId: string;
  parentMessageId: string;
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
  anchorPath?: string | null;
  inlineThreadId?: string | null;
  prompt: string;
  artifactType: VisualizationArtifactType;
  contextText?: string;
};

type UpdateVisualizationPayload = {
  title?: string;
  description?: string;
  sourcePrompt?: string;
  canonicalSourceText?: string;
  integrationState?: IVisualizationArtifact['integrationState'];
};

type RegenerateVisualizationPayload = {
  visualizationId: string;
  prompt?: string;
  artifactType?: VisualizationArtifactType;
};

type RefineVisualizationPayload = {
  visualizationId: string;
  instruction: string;
};

type IntegrateVisualizationPayload = {
  visualizationId: string;
  messageId: string;
  anchorPath?: string | null;
  displayMode?: 'integrated' | 'nested';
};

type DuplicateVisualizationPayload = {
  visualizationId: string;
};

type SuggestVisualizationOptionsPayload = {
  projectId?: string | null;
  conversationId: string;
  parentMessageId: string;
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
  existingClarifications?: ExistingClarificationContext[];
};

const DEFAULT_VISUALIZATION_MODEL = 'gpt-4o-mini';
const DEFAULT_PROXY_VISUALIZATION_MODELS = [
  'gpt-5.4-mini',
  'gpt-5-mini',
  'gpt-5.4',
  'gpt-5',
  'gpt-4o-mini',
  'gpt-4o',
];
const DEFAULT_VISUALIZATION_IMAGE_MODEL = 'gpt-image-1';

export interface VisualizationServiceDeps {
  getConvo: AllMethods['getConvo'];
  getMessages: AllMethods['getMessages'];
  getMessage: AllMethods['getMessage'];
  createVisualization: AllMethods['createVisualization'];
  listVisualizations: AllMethods['listVisualizations'];
  listVisualizationVersions: AllMethods['listVisualizationVersions'];
  getVisualization: AllMethods['getVisualization'];
  updateVisualization: AllMethods['updateVisualization'];
  setVisualizationLatestVersion: AllMethods['setVisualizationLatestVersion'];
  getLatestVisualizationVersion: AllMethods['getLatestVisualizationVersion'];
  listProjectSources: AllMethods['listProjectSources'];
  getFiles: AllMethods['getFiles'];
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

async function safeRecordChatVisualizationObservation(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: Parameters<typeof recordLearnerObservation>[2],
): Promise<void> {
  try {
    await recordLearnerObservation(deps, userId, payload);
  } catch {
    // Learner-state updates should not block visualization flows.
  }
}

type VisualizationSuggestionOption = {
  label: string;
  artifactType: 'html_app' | 'svg' | 'mermaid' | 'image';
  proposedPrompt: string;
  understandingGain: string;
  reasoning: string;
};

type VisualizationSuggestionSet = {
  contentProfile: 'conceptual' | 'procedural' | 'equational' | 'precise' | 'mixed';
  focusSummary: string;
  suggestions: VisualizationSuggestionOption[];
};

function getConfiguredVisualizationModel(): string | null {
  return (
    process.env.INLINE_VISUALIZATION_MODEL ||
    process.env.INLINE_CLARIFICATION_MODEL ||
    process.env.OPENAI_MODEL ||
    null
  );
}

function getVisualizationModelCandidates(): string[] {
  const configuredModel = getConfiguredVisualizationModel();
  const defaults = getConfiguredOpenAIBaseURL()
    ? DEFAULT_PROXY_VISUALIZATION_MODELS
    : [DEFAULT_VISUALIZATION_MODEL];

  return [configuredModel, ...defaults].filter((value, index, array): value is string => {
    return Boolean(value) && array.indexOf(value) === index;
  });
}

function getVisualizationImageModel(): string {
  return process.env.INLINE_VISUALIZATION_IMAGE_MODEL || DEFAULT_VISUALIZATION_IMAGE_MODEL;
}

export function selectVisualizationModel(availableModels?: string[] | null): string {
  const candidates = getVisualizationModelCandidates();
  if (!availableModels || availableModels.length === 0) {
    return candidates[0];
  }

  const availableSet = new Set(availableModels);
  return candidates.find((candidate) => availableSet.has(candidate)) ?? candidates[0];
}

async function resolveVisualizationModel(client: OpenAI): Promise<string> {
  if (!getConfiguredOpenAIBaseURL()) {
    return selectVisualizationModel();
  }

  try {
    const modelList = await client.models.list();
    return selectVisualizationModel(modelList.data.map((model) => model.id));
  } catch {
    return selectVisualizationModel();
  }
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for inline visualizations');
  }

  const baseURL = getConfiguredOpenAIBaseURL();
  return new OpenAI({ apiKey, baseURL });
}

function buildAnchorContexts(
  text: string,
  anchorStart: number,
  anchorEnd: number,
): { before: string; after: string } {
  const windowSize = 320;
  return {
    before: text.slice(Math.max(0, anchorStart - windowSize), anchorStart),
    after: text.slice(anchorEnd, Math.min(text.length, anchorEnd + windowSize)),
  };
}

async function requireParentMessage(
  deps: VisualizationServiceDeps,
  userId: string,
  parentMessageId: string,
  conversationId: string,
): Promise<IMessage> {
  const message = await deps.getMessage({ user: userId, messageId: parentMessageId });
  if (!message || message.conversationId !== conversationId) {
    throw new Error('Parent message not found');
  }
  if (message.isCreatedByUser) {
    throw new Error('Visualizations can only be attached to assistant messages');
  }
  return message;
}

async function loadVisualizationPromptContext(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: {
    projectId?: string | null;
    conversationId: string;
  },
) {
  const conversationMessages = await deps.getMessages(
    {
      conversationId: payload.conversationId,
      user: userId,
    },
    '-_id -__v -tenantId',
  );

  const projectSources = payload.projectId
    ? await deps.listProjectSources(userId, payload.projectId)
    : [];

  const fileIds = projectSources
    .map((source) => source.fileId)
    .filter((fileId): fileId is string => Boolean(fileId));

  const files =
    fileIds.length > 0
      ? ((await deps.getFiles(
          {
            user: userId,
            file_id: { $in: fileIds },
          },
          { updatedAt: -1 },
          '-_id -__v -tenantId',
        )) ?? [])
      : [];

  const projectFiles = files
    .filter((file) => file.text && file.text.trim().length > 0)
    .map((file) => ({
      title: file.filename,
      text: file.text ?? '',
    }));

  return {
    conversationMessages,
    projectSources,
    projectFiles,
  };
}

function getFallbackTitle(prompt: string): string {
  return sanitizeTitle(prompt).slice(0, 80);
}

function composeRefinedPrompt(existingPrompt: string, instruction: string): string {
  const trimmedPrompt = existingPrompt.trim();
  const trimmedInstruction = instruction.trim();
  if (!trimmedPrompt) {
    return trimmedInstruction;
  }

  return `${trimmedPrompt}\n\nRefinement instruction: ${trimmedInstruction}`;
}

function getArtifactMimeType(artifactType: VisualizationArtifactType): string {
  if (artifactType === 'html_app') {
    return 'text/html';
  }
  if (artifactType === 'svg') {
    return 'image/svg+xml';
  }
  if (artifactType === 'mermaid') {
    return 'text/vnd.mermaid';
  }
  if (artifactType === 'markdown_explainer_with_embeds') {
    return 'text/markdown';
  }
  return 'image/png';
}

function getIntegratedAtValue(
  integrationState: IVisualizationArtifact['integrationState'],
  currentIntegratedAt: Date | null | undefined,
): Date | null {
  if (integrationState === 'integrated') {
    return new Date();
  }

  if (integrationState === 'nested_only') {
    return null;
  }

  return currentIntegratedAt ?? null;
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
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return raw.trim();
}

function parseVisualizationSuggestions(rawResponse: string): VisualizationSuggestionSet {
  const jsonCandidate = extractJsonBlock(rawResponse);
  if (!jsonCandidate) {
    throw new Error('Visualization suggestions returned no JSON payload');
  }

  const parsed = JSON.parse(jsonCandidate) as {
    content_profile?: VisualizationSuggestionSet['contentProfile'];
    focus_summary?: string;
    suggestions?: Array<{
      label?: string;
      artifact_type?: VisualizationSuggestionOption['artifactType'];
      proposed_prompt?: string;
      understanding_gain?: string;
      reasoning?: string;
    }>;
  };

  if (!parsed.suggestions?.length) {
    throw new Error('Visualization suggestions returned no options');
  }

  const suggestions = parsed.suggestions
    .map((suggestion) => ({
      label: suggestion.label?.trim() ?? '',
      artifactType: suggestion.artifact_type,
      proposedPrompt: suggestion.proposed_prompt?.trim() ?? '',
      understandingGain: suggestion.understanding_gain?.trim() ?? '',
      reasoning: suggestion.reasoning?.trim() ?? '',
    }))
    .filter((suggestion): suggestion is VisualizationSuggestionOption =>
      Boolean(
        suggestion.label &&
          suggestion.proposedPrompt &&
          suggestion.understandingGain &&
          suggestion.reasoning &&
          suggestion.artifactType &&
          ['html_app', 'svg', 'mermaid', 'image'].includes(suggestion.artifactType),
      ),
    )
    .slice(0, 3);

  if (!suggestions.length) {
    throw new Error('Visualization suggestions returned malformed options');
  }

  return {
    contentProfile: parsed.content_profile ?? 'mixed',
    focusSummary:
      parsed.focus_summary?.trim() || 'Visualize the local structure or intuition behind the span.',
    suggestions,
  };
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
          title: parsed.title?.trim() || getFallbackTitle(prompt),
          description: parsed.description?.trim() || '',
          artifactType: parsed.artifact_type ?? artifactType,
          content: parsed.content.trim(),
          rawResponse,
          model,
        };
      }
    } catch {
      // Fall back to raw parsing below.
    }
  }

  const stripped = stripCodeFences(rawResponse);
  if (!stripped) {
    throw new Error('Visualization generation returned empty content');
  }

  return {
    title: getFallbackTitle(prompt),
    description: '',
    artifactType,
    content: stripped,
    rawResponse,
    model,
  };
}

async function generateVisualizationContent(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: {
    projectId?: string | null;
    conversationId: string;
    selectedText: string;
    contextBefore: string;
    contextAfter: string;
    prompt: string;
    artifactType: VisualizationArtifactType;
  },
): Promise<VisualizationEnvelope> {
  const client = getOpenAIClient();

  if (payload.artifactType === 'image') {
    const model = getVisualizationImageModel();
    const response = await client.images.generate({
      model,
      prompt: [
        'Create a single self-contained educational visualization that fits inside a chat card.',
        'Avoid text that would be unreadable at small sizes.',
        payload.prompt,
      ].join(' '),
      size: '1024x1024',
    });

    const image = response.data?.[0];
    if (!image) {
      throw new Error('Visualization image generation returned no image');
    }

    const imageResult: SaveImageResult | null = image.b64_json
      ? {
          content: `data:image/png;base64,${image.b64_json}`,
          mimeType: 'image/png',
        }
      : null;

    if (!imageResult) {
      throw new Error('Visualization image generation did not return a base64 payload');
    }

    return {
      title: getFallbackTitle(payload.prompt),
      description: '',
      artifactType: 'image',
      content: imageResult.content,
      rawResponse: imageResult.content,
      model,
    };
  }

  const { conversationMessages, projectSources, projectFiles } =
    await loadVisualizationPromptContext(deps, userId, payload);

  const messages = buildVisualizationMessages({
    artifactType: payload.artifactType,
    selectedText: payload.selectedText,
    contextBefore: payload.contextBefore,
    contextAfter: payload.contextAfter,
    userPrompt: payload.prompt,
    recentMessages: conversationMessages,
    projectSources,
    projectFiles,
  }) as ChatCompletionMessageParam[];

  const model = await resolveVisualizationModel(client);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages,
  });

  const rawResponse = completion.choices[0]?.message?.content?.trim();
  if (!rawResponse) {
    throw new Error('Visualization generation returned no content');
  }

  return parseVisualizationEnvelope(rawResponse, payload.artifactType, payload.prompt, model);
}

async function generateRefinedVisualizationContent(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: {
    projectId?: string | null;
    conversationId: string;
    selectedText: string;
    contextBefore: string;
    contextAfter: string;
    existingPrompt: string;
    currentSource: string;
    followUpInstruction: string;
    artifactType: VisualizationArtifactType;
  },
): Promise<VisualizationEnvelope> {
  const effectivePrompt = composeRefinedPrompt(payload.existingPrompt, payload.followUpInstruction);
  if (payload.artifactType === 'image') {
    return generateVisualizationContent(deps, userId, {
      projectId: payload.projectId,
      conversationId: payload.conversationId,
      selectedText: payload.selectedText,
      contextBefore: payload.contextBefore,
      contextAfter: payload.contextAfter,
      prompt: effectivePrompt,
      artifactType: payload.artifactType,
    });
  }

  const { conversationMessages, projectSources, projectFiles } =
    await loadVisualizationPromptContext(deps, userId, payload);
  const messages = buildVisualizationRefinementMessages({
    artifactType: payload.artifactType,
    selectedText: payload.selectedText,
    contextBefore: payload.contextBefore,
    contextAfter: payload.contextAfter,
    existingPrompt: payload.existingPrompt,
    currentSource: payload.currentSource,
    followUpInstruction: payload.followUpInstruction,
    recentMessages: conversationMessages,
    projectSources,
    projectFiles,
  }) as ChatCompletionMessageParam[];

  const client = getOpenAIClient();
  const model = await resolveVisualizationModel(client);
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages,
  });

  const rawResponse = completion.choices[0]?.message?.content?.trim();
  if (!rawResponse) {
    throw new Error('Visualization refinement returned no content');
  }

  return parseVisualizationEnvelope(rawResponse, payload.artifactType, effectivePrompt, model);
}

export async function suggestVisualizationOptions(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: SuggestVisualizationOptionsPayload,
): Promise<VisualizationSuggestionSet> {
  const convo = await deps.getConvo(userId, payload.conversationId);
  if (!convo) {
    throw new Error('Conversation not found');
  }

  const parentMessage = await requireParentMessage(
    deps,
    userId,
    payload.parentMessageId,
    payload.conversationId,
  );
  const parentText = extractMessageText(parentMessage);
  const contexts = buildAnchorContexts(parentText, payload.anchorStart, payload.anchorEnd);
  const { conversationMessages, projectSources, projectFiles } =
    await loadVisualizationPromptContext(deps, userId, {
      projectId: payload.projectId ?? convo.projectId ?? null,
      conversationId: payload.conversationId,
    });

  const messages = buildVisualizationSuggestionMessages({
    selectedText: payload.anchorText,
    contextBefore: payload.anchorContextBefore || contexts.before,
    contextAfter: payload.anchorContextAfter || contexts.after,
    recentMessages: conversationMessages,
    projectSources,
    projectFiles,
    existingClarifications: payload.existingClarifications ?? [],
  }) as ChatCompletionMessageParam[];

  const client = getOpenAIClient();
  const model = await resolveVisualizationModel(client);

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error while generating suggestions';
    throw new Error(`Visualization suggestion generation failed for model "${model}": ${message}`);
  }

  const rawResponse = completion.choices[0]?.message?.content?.trim();
  if (!rawResponse) {
    throw new Error('Visualization suggestions returned no content');
  }

  return parseVisualizationSuggestions(rawResponse);
}

async function buildStoredVisualization(
  appConfig: AppConfig | undefined,
  visualizationId: string,
  artifactType: VisualizationArtifactType,
  generated: VisualizationEnvelope,
) {
  if (artifactType === 'image') {
    const persisted = await persistVisualizationPayload(
      appConfig,
      visualizationId,
      'image/png',
      generated.content,
    );

    return {
      canonicalSourceText: generated.content,
      canonicalSourceMimeType: 'image/png',
      compiledRenderText: persisted.compiledRenderText,
      compiledRenderMimeType: 'image/png',
      compiledRenderStoragePath: persisted.compiledRenderStoragePath,
      storageMode: persisted.storageMode,
      warnings: [],
      storageByteSize: persisted.storageByteSize,
    };
  }

  const sanitized = sanitizeVisualizationByType(artifactType, generated.content);
  const persisted = await persistVisualizationPayload(
    appConfig,
    visualizationId,
    sanitized.compiledRenderMimeType,
    sanitized.compiledRenderText,
  );

  return {
    canonicalSourceText: sanitized.canonicalSourceText,
    canonicalSourceMimeType: sanitized.canonicalSourceMimeType,
    compiledRenderText: persisted.compiledRenderText,
    compiledRenderMimeType: sanitized.compiledRenderMimeType,
    compiledRenderStoragePath: persisted.compiledRenderStoragePath,
    storageMode: persisted.storageMode,
    warnings: sanitized.warnings,
    storageByteSize: persisted.storageByteSize,
  };
}

function assertLatestVisualization(visualization: IVisualizationArtifact) {
  if (!visualization.isLatestVersion) {
    throw new Error('Only the latest visualization version can be modified');
  }
}

export async function listVisualizations(
  deps: VisualizationServiceDeps,
  userId: string,
  params: {
    conversationId: string;
    parentMessageId?: string;
    includeArchived?: boolean;
    includeDeleted?: boolean;
    includeAllVersions?: boolean;
  },
): Promise<IVisualizationArtifact[]> {
  return deps.listVisualizations(userId, params);
}

export async function getVisualization(
  deps: VisualizationServiceDeps,
  userId: string,
  visualizationId: string,
): Promise<IVisualizationArtifact | null> {
  return deps.getVisualization(userId, visualizationId, true);
}

export async function createVisualization(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: CreateVisualizationPayload,
  context: VisualizationContext = {},
): Promise<IVisualizationArtifact> {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new Error('Visualization prompt is required');
  }

  const convo = await deps.getConvo(userId, payload.conversationId);
  if (!convo) {
    throw new Error('Conversation not found');
  }

  const parentMessage = await requireParentMessage(
    deps,
    userId,
    payload.parentMessageId,
    payload.conversationId,
  );
  const parentText = parentMessage.text ?? '';
  const contexts = buildAnchorContexts(parentText, payload.anchorStart, payload.anchorEnd);

  const draft = await deps.createVisualization(userId, {
    projectId: payload.projectId ?? convo.projectId ?? null,
    conversationId: payload.conversationId,
    parentMessageId: payload.parentMessageId,
    anchorStart: payload.anchorStart,
    anchorEnd: payload.anchorEnd,
    anchorText: payload.anchorText,
    anchorContextBefore: payload.anchorContextBefore || contexts.before,
    anchorContextAfter: payload.anchorContextAfter || contexts.after,
    anchorPath: payload.anchorPath ?? null,
    inlineThreadId: payload.inlineThreadId ?? null,
    title: 'Generating visualization',
    description: '',
    artifactType: payload.artifactType,
    status: 'draft',
    storageMode: 'db_inline',
    canonicalSourceText: '',
    canonicalSourceMimeType: getArtifactMimeType(payload.artifactType),
    compiledRenderText: null,
    compiledRenderMimeType: getArtifactMimeType(payload.artifactType),
    sourcePrompt: prompt,
    generationModel: null,
    generationMetadata: null,
    integrationState: 'nested_only',
    isLatestVersion: true,
    versionNumber: 1,
  });

  try {
    const generated = await generateVisualizationContent(deps, userId, {
      projectId: payload.projectId ?? convo.projectId ?? null,
      conversationId: payload.conversationId,
      selectedText: payload.anchorText,
      contextBefore: payload.anchorContextBefore || contexts.before,
      contextAfter: payload.anchorContextAfter || contexts.after,
      prompt,
      artifactType: payload.artifactType,
    });

    const stored = await buildStoredVisualization(
      context.appConfig,
      draft.visualizationId,
      payload.artifactType,
      generated,
    );

    const updated = await deps.updateVisualization(userId, draft.visualizationId, {
      title: generated.title,
      description: generated.description,
      status: 'ready',
      storageMode: stored.storageMode,
      canonicalSourceText: stored.canonicalSourceText,
      canonicalSourceMimeType: stored.canonicalSourceMimeType,
      compiledRenderText: stored.compiledRenderText,
      compiledRenderMimeType: stored.compiledRenderMimeType,
      compiledRenderStoragePath: stored.compiledRenderStoragePath,
      generationModel: generated.model,
      generationMetadata: {
        rawResponse: generated.rawResponse,
        warnings: stored.warnings,
        originalMimeType: stored.canonicalSourceMimeType,
        sanitizedMimeType: stored.compiledRenderMimeType,
        storageByteSize: stored.storageByteSize,
      },
    });
    const finalized = updated ?? draft;

    await safeRecordChatVisualizationObservation(deps, userId, {
      surface: 'chat',
      eventType: 'chat_visualization',
      sourceId: payload.conversationId,
      sourceTitle: payload.anchorText,
      summary: `The learner requested a ${payload.artifactType} chat visualization for "${payload.anchorText}".`,
      payloadJson: {
        visualizationId: finalized.visualizationId,
        parentMessageId: payload.parentMessageId,
        artifactType: payload.artifactType,
        prompt,
      },
      conceptHints: [
        {
          label: payload.anchorText,
          category: 'bridge',
          mastery: 0.3,
          confidence: 0.46,
          evidenceSummary: prompt,
          sourceLabel: payload.anchorText,
        },
      ],
    });

    return finalized;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error while generating visualization';

    const failed = await deps.updateVisualization(userId, draft.visualizationId, {
      title: getFallbackTitle(prompt),
      description: message,
      status: 'failed',
      generationMetadata: {
        error: message,
      },
    });

    return failed ?? draft;
  }
}

export async function updateVisualization(
  deps: VisualizationServiceDeps,
  userId: string,
  visualizationId: string,
  payload: UpdateVisualizationPayload,
  context: VisualizationContext = {},
): Promise<IVisualizationArtifact | null> {
  const visualization = await deps.getVisualization(userId, visualizationId, true);
  if (!visualization) {
    throw new Error('Visualization not found');
  }

  assertLatestVisualization(visualization);

  const update: Parameters<VisualizationServiceDeps['updateVisualization']>[2] = {
    ...(payload.title != null ? { title: payload.title } : {}),
    ...(payload.description != null ? { description: payload.description } : {}),
    ...(payload.sourcePrompt != null ? { sourcePrompt: payload.sourcePrompt } : {}),
    ...(payload.integrationState != null
      ? {
          integrationState: payload.integrationState,
          integratedAt: getIntegratedAtValue(payload.integrationState, visualization.integratedAt),
        }
      : {}),
  };

  if (payload.canonicalSourceText != null) {
    const stored = await buildStoredVisualization(
      context.appConfig,
      visualization.visualizationId,
      visualization.artifactType,
      {
        title: payload.title ?? visualization.title,
        description: payload.description ?? visualization.description,
        artifactType: visualization.artifactType,
        content: payload.canonicalSourceText,
        rawResponse:
          visualization.generationMetadata?.rawResponse ?? visualization.canonicalSourceText,
        model: visualization.generationModel ?? DEFAULT_VISUALIZATION_MODEL,
      },
    );

    Object.assign(update, {
      status: 'ready',
      storageMode: stored.storageMode,
      canonicalSourceText: stored.canonicalSourceText,
      canonicalSourceMimeType: stored.canonicalSourceMimeType,
      compiledRenderText: stored.compiledRenderText,
      compiledRenderMimeType: stored.compiledRenderMimeType,
      compiledRenderStoragePath: stored.compiledRenderStoragePath,
      generationMetadata: {
        ...visualization.generationMetadata,
        warnings: stored.warnings,
        sanitizedMimeType: stored.compiledRenderMimeType,
        storageByteSize: stored.storageByteSize,
      },
    });
  }

  return deps.updateVisualization(userId, visualizationId, update);
}

export async function regenerateVisualization(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: RegenerateVisualizationPayload,
  context: VisualizationContext = {},
): Promise<IVisualizationArtifact> {
  const visualization = await deps.getVisualization(userId, payload.visualizationId, true);
  if (!visualization) {
    throw new Error('Visualization not found');
  }

  assertLatestVisualization(visualization);
  const parentMessage = await requireParentMessage(
    deps,
    userId,
    visualization.parentMessageId,
    visualization.conversationId,
  );
  const parentText = parentMessage.text ?? '';
  const contexts = buildAnchorContexts(
    parentText,
    visualization.anchorStart,
    visualization.anchorEnd,
  );

  const nextVersionNumber = visualization.versionNumber + 1;
  const prompt = payload.prompt?.trim() || visualization.sourcePrompt;
  const artifactType = payload.artifactType ?? visualization.artifactType;

  const draft = await deps.createVisualization(userId, {
    projectId: visualization.projectId ?? null,
    conversationId: visualization.conversationId,
    parentMessageId: visualization.parentMessageId,
    anchorStart: visualization.anchorStart,
    anchorEnd: visualization.anchorEnd,
    anchorText: visualization.anchorText,
    anchorContextBefore: visualization.anchorContextBefore || contexts.before,
    anchorContextAfter: visualization.anchorContextAfter || contexts.after,
    anchorPath: visualization.anchorPath ?? null,
    inlineThreadId: visualization.inlineThreadId ?? null,
    parentVisualizationId: visualization.visualizationId,
    rootVisualizationId: visualization.rootVisualizationId ?? visualization.visualizationId,
    title: 'Regenerating visualization',
    description: '',
    artifactType,
    status: 'draft',
    storageMode: 'db_inline',
    canonicalSourceText: '',
    canonicalSourceMimeType: visualization.canonicalSourceMimeType,
    compiledRenderText: null,
    compiledRenderMimeType: visualization.compiledRenderMimeType,
    sourcePrompt: prompt,
    generationModel: null,
    generationMetadata: null,
    integrationState: visualization.integrationState,
    isLatestVersion: true,
    versionNumber: nextVersionNumber,
    integratedAt: visualization.integratedAt ?? null,
  });

  await deps.setVisualizationLatestVersion(
    userId,
    draft.rootVisualizationId ?? draft.visualizationId,
    draft.visualizationId,
  );

  try {
    const generated = await generateVisualizationContent(deps, userId, {
      projectId: visualization.projectId ?? null,
      conversationId: visualization.conversationId,
      selectedText: visualization.anchorText,
      contextBefore: visualization.anchorContextBefore || contexts.before,
      contextAfter: visualization.anchorContextAfter || contexts.after,
      prompt,
      artifactType,
    });

    const stored = await buildStoredVisualization(
      context.appConfig,
      draft.visualizationId,
      artifactType,
      generated,
    );

    await deps.updateVisualization(userId, visualization.visualizationId, {
      isLatestVersion: false,
    });

    const updated = await deps.updateVisualization(userId, draft.visualizationId, {
      title: generated.title,
      description: generated.description,
      status: 'ready',
      storageMode: stored.storageMode,
      canonicalSourceText: stored.canonicalSourceText,
      canonicalSourceMimeType: stored.canonicalSourceMimeType,
      compiledRenderText: stored.compiledRenderText,
      compiledRenderMimeType: stored.compiledRenderMimeType,
      compiledRenderStoragePath: stored.compiledRenderStoragePath,
      generationModel: generated.model,
      generationMetadata: {
        rawResponse: generated.rawResponse,
        warnings: stored.warnings,
        originalMimeType: stored.canonicalSourceMimeType,
        sanitizedMimeType: stored.compiledRenderMimeType,
        storageByteSize: stored.storageByteSize,
      },
    });

    return updated ?? draft;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error while regenerating visualization';

    const failed = await deps.updateVisualization(userId, draft.visualizationId, {
      title: getFallbackTitle(prompt),
      description: message,
      status: 'failed',
      generationMetadata: {
        error: message,
      },
    });

    return failed ?? draft;
  }
}

export async function refineVisualization(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: RefineVisualizationPayload,
  context: VisualizationContext = {},
): Promise<IVisualizationArtifact> {
  const instruction = payload.instruction.trim();
  if (!instruction) {
    throw new Error('Visualization refinement instruction is required');
  }

  const visualization = await deps.getVisualization(userId, payload.visualizationId, true);
  if (!visualization) {
    throw new Error('Visualization not found');
  }

  assertLatestVisualization(visualization);
  const parentMessage = await requireParentMessage(
    deps,
    userId,
    visualization.parentMessageId,
    visualization.conversationId,
  );
  const parentText = extractMessageText(parentMessage);
  const contexts = buildAnchorContexts(
    parentText,
    visualization.anchorStart,
    visualization.anchorEnd,
  );
  const nextVersionNumber = visualization.versionNumber + 1;
  const artifactType = visualization.artifactType;
  const effectivePrompt = composeRefinedPrompt(visualization.sourcePrompt, instruction);

  const draft = await deps.createVisualization(userId, {
    projectId: visualization.projectId ?? null,
    conversationId: visualization.conversationId,
    parentMessageId: visualization.parentMessageId,
    anchorStart: visualization.anchorStart,
    anchorEnd: visualization.anchorEnd,
    anchorText: visualization.anchorText,
    anchorContextBefore: visualization.anchorContextBefore || contexts.before,
    anchorContextAfter: visualization.anchorContextAfter || contexts.after,
    anchorPath: visualization.anchorPath ?? null,
    inlineThreadId: visualization.inlineThreadId ?? null,
    parentVisualizationId: visualization.visualizationId,
    rootVisualizationId: visualization.rootVisualizationId ?? visualization.visualizationId,
    title: 'Refining visualization',
    description: '',
    artifactType,
    status: 'draft',
    storageMode: 'db_inline',
    canonicalSourceText: '',
    canonicalSourceMimeType: visualization.canonicalSourceMimeType,
    compiledRenderText: null,
    compiledRenderMimeType: visualization.compiledRenderMimeType,
    sourcePrompt: effectivePrompt,
    generationModel: null,
    generationMetadata: null,
    integrationState: visualization.integrationState,
    isLatestVersion: true,
    versionNumber: nextVersionNumber,
    integratedAt: visualization.integratedAt ?? null,
  });

  await deps.setVisualizationLatestVersion(
    userId,
    draft.rootVisualizationId ?? draft.visualizationId,
    draft.visualizationId,
  );

  try {
    const generated = await generateRefinedVisualizationContent(deps, userId, {
      projectId: visualization.projectId ?? null,
      conversationId: visualization.conversationId,
      selectedText: visualization.anchorText,
      contextBefore: visualization.anchorContextBefore || contexts.before,
      contextAfter: visualization.anchorContextAfter || contexts.after,
      existingPrompt: visualization.sourcePrompt,
      currentSource: visualization.canonicalSourceText,
      followUpInstruction: instruction,
      artifactType,
    });

    const stored = await buildStoredVisualization(
      context.appConfig,
      draft.visualizationId,
      artifactType,
      generated,
    );

    await deps.updateVisualization(userId, visualization.visualizationId, {
      isLatestVersion: false,
    });

    const updated = await deps.updateVisualization(userId, draft.visualizationId, {
      title: generated.title,
      description: generated.description,
      status: 'ready',
      storageMode: stored.storageMode,
      canonicalSourceText: stored.canonicalSourceText,
      canonicalSourceMimeType: stored.canonicalSourceMimeType,
      compiledRenderText: stored.compiledRenderText,
      compiledRenderMimeType: stored.compiledRenderMimeType,
      compiledRenderStoragePath: stored.compiledRenderStoragePath,
      generationModel: generated.model,
      generationMetadata: {
        rawResponse: generated.rawResponse,
        warnings: stored.warnings,
        originalMimeType: stored.canonicalSourceMimeType,
        sanitizedMimeType: stored.compiledRenderMimeType,
        storageByteSize: stored.storageByteSize,
      },
    });

    return updated ?? draft;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error while refining visualization';

    const failed = await deps.updateVisualization(userId, draft.visualizationId, {
      title: getFallbackTitle(effectivePrompt),
      description: message,
      status: 'failed',
      generationMetadata: {
        error: message,
      },
    });

    return failed ?? draft;
  }
}

export async function integrateVisualization(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: IntegrateVisualizationPayload,
): Promise<IVisualizationArtifact | null> {
  const visualization = await deps.getVisualization(userId, payload.visualizationId, true);
  if (!visualization) {
    throw new Error('Visualization not found');
  }

  assertLatestVisualization(visualization);

  if (visualization.parentMessageId !== payload.messageId) {
    throw new Error('Visualization does not belong to the provided message');
  }

  return deps.updateVisualization(userId, visualization.visualizationId, {
    integrationState: payload.displayMode === 'nested' ? 'nested_only' : 'integrated',
    integratedAt: payload.displayMode === 'nested' ? null : new Date(),
  });
}

export async function duplicateVisualization(
  deps: VisualizationServiceDeps,
  userId: string,
  payload: DuplicateVisualizationPayload,
  context: VisualizationContext = {},
): Promise<IVisualizationArtifact> {
  const visualization = await deps.getVisualization(userId, payload.visualizationId, true);
  if (!visualization) {
    throw new Error('Visualization not found');
  }

  const payloadBody = await loadVisualizationPayload(
    context.appConfig,
    visualization.compiledRenderMimeType,
    visualization.compiledRenderText,
    visualization.compiledRenderStoragePath,
  );

  const renderText =
    typeof payloadBody.body === 'string'
      ? payloadBody.body
      : `data:${payloadBody.mimeType};base64,${payloadBody.body.toString('base64')}`;
  const stored = await persistVisualizationPayload(
    context.appConfig,
    crypto.randomUUID(),
    visualization.compiledRenderMimeType,
    renderText,
  );

  return deps.createVisualization(userId, {
    projectId: visualization.projectId ?? null,
    conversationId: visualization.conversationId,
    parentMessageId: visualization.parentMessageId,
    anchorStart: visualization.anchorStart,
    anchorEnd: visualization.anchorEnd,
    anchorText: visualization.anchorText,
    anchorContextBefore: visualization.anchorContextBefore,
    anchorContextAfter: visualization.anchorContextAfter,
    anchorPath: visualization.anchorPath ?? null,
    inlineThreadId: visualization.inlineThreadId ?? null,
    title: `${visualization.title} (Copy)`,
    description: visualization.description,
    artifactType: visualization.artifactType,
    status: visualization.status,
    storageMode: stored.storageMode,
    canonicalSourceText: visualization.canonicalSourceText,
    canonicalSourceMimeType: visualization.canonicalSourceMimeType,
    compiledRenderText: stored.compiledRenderText,
    compiledRenderMimeType: visualization.compiledRenderMimeType,
    compiledRenderStoragePath: stored.compiledRenderStoragePath,
    sourcePrompt: visualization.sourcePrompt,
    generationModel: visualization.generationModel,
    generationMetadata: visualization.generationMetadata ?? null,
    integrationState: 'nested_only',
    isLatestVersion: true,
    versionNumber: 1,
  });
}

export async function deleteVisualization(
  deps: VisualizationServiceDeps,
  userId: string,
  visualizationId: string,
): Promise<IVisualizationArtifact | null> {
  const visualization = await deps.getVisualization(userId, visualizationId, true);
  if (!visualization) {
    throw new Error('Visualization not found');
  }

  const deleted = await deps.updateVisualization(userId, visualizationId, {
    deletedAt: new Date(),
    status: 'archived',
    isLatestVersion: false,
  });

  if (!visualization.isLatestVersion) {
    return deleted;
  }

  const rootVisualizationId = visualization.rootVisualizationId ?? visualization.visualizationId;
  const nextLatest = await deps.getLatestVisualizationVersion(
    userId,
    rootVisualizationId,
    visualization.visualizationId,
  );
  await deps.setVisualizationLatestVersion(
    userId,
    rootVisualizationId,
    nextLatest?.visualizationId ?? null,
  );

  return deleted;
}

export async function getVisualizationRenderPayload(
  deps: VisualizationServiceDeps,
  userId: string,
  visualizationId: string,
  context: VisualizationContext = {},
): Promise<{ body: Buffer | string; isBinary: boolean; mimeType: string }> {
  const visualization = await deps.getVisualization(userId, visualizationId, false);
  if (!visualization || visualization.deletedAt || visualization.status === 'archived') {
    throw new Error('Visualization not found');
  }

  return loadVisualizationPayload(
    context.appConfig,
    visualization.compiledRenderMimeType,
    visualization.compiledRenderText,
    visualization.compiledRenderStoragePath,
  );
}
