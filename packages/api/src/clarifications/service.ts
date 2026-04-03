import OpenAI from 'openai';
import type {
  AllMethods,
  AppConfig,
  IMessage,
  IMessageClarification,
  IMessageRevision,
} from '@librechat/data-schemas';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getConfiguredOpenAIBaseURL } from '~/files/native';
import { extractMessageText, buildClarificationMessages } from './prompt';
import { resolveAnchor, type AnchorCandidate, type AnchorResolution } from './anchors';

type SaveMessageContext = {
  userId: string;
  isTemporary?: boolean;
  interfaceConfig?: AppConfig['interfaceConfig'];
};

type CreateClarificationPayload = AnchorCandidate & {
  projectId?: string | null;
  conversationId: string;
  parentMessageId: string;
  clarificationQuestion: string;
};

type IntegrateClarificationPayload = {
  clarificationId: string;
  mergedText: string;
  excerpt?: string;
  excerptStart?: number;
  excerptEnd?: number;
};

type ReanchorPayload = {
  clarificationId: string;
  parentText?: string;
};

type UpdateClarificationPayload = {
  anchorStart?: number;
  anchorEnd?: number;
  anchorText?: string;
  anchorContextBefore?: string;
  anchorContextAfter?: string;
  clarificationQuestion?: string;
  clarificationAnswer?: string;
  status?: IMessageClarification['status'];
};

const DEFAULT_DIRECT_CLARIFICATION_MODEL = 'gpt-4o-mini';
const DEFAULT_PROXY_CLARIFICATION_MODELS = [
  'gpt-5.4-mini',
  'gpt-5-mini',
  'gpt-5.4',
  'gpt-5',
  'gpt-4o-mini',
  'gpt-4o',
];
const clarificationModelCache = new Map<string, string>();

export interface ClarificationServiceDeps {
  getConvo: AllMethods['getConvo'];
  getMessages: AllMethods['getMessages'];
  getMessage: AllMethods['getMessage'];
  createClarification: AllMethods['createClarification'];
  listClarifications: AllMethods['listClarifications'];
  getClarification: AllMethods['getClarification'];
  updateClarification: AllMethods['updateClarification'];
  createMessageRevision: AllMethods['createMessageRevision'];
  listMessageRevisions: AllMethods['listMessageRevisions'];
  saveMessage: AllMethods['saveMessage'];
  listProjectSources: AllMethods['listProjectSources'];
  getFiles: AllMethods['getFiles'];
}

function getConfiguredClarificationModel(): string | null {
  return process.env.INLINE_CLARIFICATION_MODEL || process.env.OPENAI_MODEL || null;
}

function getClarificationModelCandidates(): string[] {
  const configuredModel = getConfiguredClarificationModel();
  const defaults = getConfiguredOpenAIBaseURL()
    ? DEFAULT_PROXY_CLARIFICATION_MODELS
    : [DEFAULT_DIRECT_CLARIFICATION_MODEL];

  return [configuredModel, ...defaults].filter((value, index, array): value is string => {
    return Boolean(value) && array.indexOf(value) === index;
  });
}

export function selectClarificationModel(availableModels?: string[] | null): string {
  const candidates = getClarificationModelCandidates();
  if (!availableModels || availableModels.length === 0) {
    return candidates[0];
  }

  const availableSet = new Set(availableModels);
  return candidates.find((candidate) => availableSet.has(candidate)) ?? candidates[0];
}

async function resolveClarificationModel(client: OpenAI): Promise<string> {
  const cacheKey = getConfiguredOpenAIBaseURL() || 'direct';
  const cachedModel = clarificationModelCache.get(cacheKey);
  if (cachedModel) {
    return cachedModel;
  }

  let selectedModel: string;

  if (!getConfiguredOpenAIBaseURL()) {
    selectedModel = selectClarificationModel();
  } else {
    try {
      const modelList = await client.models.list();
      selectedModel = selectClarificationModel(modelList.data.map((model) => model.id));
    } catch {
      selectedModel = selectClarificationModel();
    }
  }

  clarificationModelCache.set(cacheKey, selectedModel);
  return selectedModel;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for inline clarifications');
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
  deps: ClarificationServiceDeps,
  userId: string,
  parentMessageId: string,
  conversationId: string,
): Promise<IMessage> {
  const message = await deps.getMessage({ user: userId, messageId: parentMessageId });
  if (!message || message.conversationId !== conversationId) {
    throw new Error('Parent message not found');
  }
  if (message.isCreatedByUser) {
    throw new Error('Clarifications can only be attached to assistant messages');
  }
  return message;
}

async function generateClarificationAnswer(
  deps: ClarificationServiceDeps,
  userId: string,
  payload: {
    projectId?: string | null;
    conversationId: string;
    selectedText: string;
    contextBefore: string;
    contextAfter: string;
    clarificationQuestion: string;
  },
): Promise<string> {
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
      ? (await deps.getFiles(
          {
            user: userId,
            file_id: { $in: fileIds },
          },
          { updatedAt: -1 },
          '-_id -__v -tenantId',
        )) ?? []
      : [];

  const projectFiles = files
    .filter((file) => file.text && file.text.trim().length > 0)
    .map((file) => ({
      title: file.filename,
      text: file.text ?? '',
    }));

  const messages = buildClarificationMessages({
    selectedText: payload.selectedText,
    contextBefore: payload.contextBefore,
    contextAfter: payload.contextAfter,
    clarificationQuestion: payload.clarificationQuestion,
    recentMessages: conversationMessages,
    projectSources,
    projectFiles,
  }) as ChatCompletionMessageParam[];

  const client = getOpenAIClient();
  const model = await resolveClarificationModel(client);

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error while generating clarification';
    throw new Error(`Clarification generation failed for model "${model}": ${message}`);
  }

  return completion.choices[0]?.message?.content?.trim() || 'No clarification answer was generated.';
}

function buildReanchorMetadata(
  resolution: AnchorResolution,
  previousClarification: IMessageClarification,
): Record<string, unknown> {
  return {
    ...(previousClarification.integrationPatch ?? {}),
    reanchor: {
      method: resolution.method,
      score: resolution.score ?? null,
      needsManualReanchor: resolution.needsManualReanchor,
      attemptedAt: new Date().toISOString(),
    },
  };
}

export async function createClarification(
  deps: ClarificationServiceDeps,
  userId: string,
  payload: CreateClarificationPayload,
): Promise<IMessageClarification> {
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
  const resolution = resolveAnchor(parentText, payload);
  const anchorContext = buildAnchorContexts(parentText, resolution.anchorStart, resolution.anchorEnd);
  const clarificationAnswer = await generateClarificationAnswer(deps, userId, {
    projectId: payload.projectId ?? convo.projectId,
    conversationId: payload.conversationId,
    selectedText: resolution.anchorText,
    contextBefore: anchorContext.before,
    contextAfter: anchorContext.after,
    clarificationQuestion: payload.clarificationQuestion,
  });

  return deps.createClarification(userId, {
    projectId: payload.projectId ?? convo.projectId ?? '',
    conversationId: payload.conversationId,
    parentMessageId: payload.parentMessageId,
    anchorStart: resolution.anchorStart,
    anchorEnd: resolution.anchorEnd,
    anchorText: resolution.anchorText,
    anchorContextBefore: anchorContext.before,
    anchorContextAfter: anchorContext.after,
    clarificationQuestion: payload.clarificationQuestion,
    clarificationAnswer,
    status: 'active',
  });
}

export async function listClarifications(
  deps: ClarificationServiceDeps,
  userId: string,
  params: { conversationId: string; parentMessageId?: string; includeArchived?: boolean },
): Promise<IMessageClarification[]> {
  return deps.listClarifications(userId, params);
}

export async function updateClarification(
  deps: ClarificationServiceDeps,
  userId: string,
  clarificationId: string,
  data: UpdateClarificationPayload & { regenerate?: boolean },
): Promise<IMessageClarification | null> {
  const clarification = await deps.getClarification(userId, clarificationId);
  if (!clarification) {
    throw new Error('Clarification not found');
  }

  let update = { ...data };
  delete update.regenerate;

  if (data.regenerate === true || data.clarificationQuestion) {
    const parentMessage = await requireParentMessage(
      deps,
      userId,
      clarification.parentMessageId,
      clarification.conversationId,
    );
    const parentText = extractMessageText(parentMessage);
    const resolution = resolveAnchor(parentText, {
      anchorStart: data.anchorStart ?? clarification.anchorStart,
      anchorEnd: data.anchorEnd ?? clarification.anchorEnd,
      anchorText: data.anchorText ?? clarification.anchorText,
      anchorContextBefore: data.anchorContextBefore ?? clarification.anchorContextBefore,
      anchorContextAfter: data.anchorContextAfter ?? clarification.anchorContextAfter,
    });
    const anchorContext = buildAnchorContexts(parentText, resolution.anchorStart, resolution.anchorEnd);
    const question = data.clarificationQuestion ?? clarification.clarificationQuestion;
    const answer = await generateClarificationAnswer(deps, userId, {
      projectId: clarification.projectId,
      conversationId: clarification.conversationId,
      selectedText: resolution.anchorText,
      contextBefore: anchorContext.before,
      contextAfter: anchorContext.after,
      clarificationQuestion: question,
    });

    update = {
      ...update,
      anchorStart: resolution.anchorStart,
      anchorEnd: resolution.anchorEnd,
      anchorText: resolution.anchorText,
      anchorContextBefore: anchorContext.before,
      anchorContextAfter: anchorContext.after,
      clarificationQuestion: question,
      clarificationAnswer: answer,
    };
  }

  return deps.updateClarification(userId, clarificationId, update);
}

export async function integrateClarification(
  deps: ClarificationServiceDeps,
  ctx: SaveMessageContext,
  payload: IntegrateClarificationPayload,
): Promise<IMessageClarification | null> {
  const clarification = await deps.getClarification(ctx.userId, payload.clarificationId);
  if (!clarification) {
    throw new Error('Clarification not found');
  }

  const parentMessage = await requireParentMessage(
    deps,
    ctx.userId,
    clarification.parentMessageId,
    clarification.conversationId,
  );
  const previousText = extractMessageText(parentMessage);

  await deps.createMessageRevision(ctx.userId, {
    messageId: parentMessage.messageId,
    conversationId: clarification.conversationId,
    projectId: clarification.projectId,
    reason: 'clarification_integration',
    previousText,
    updatedText: payload.mergedText,
    metadata: {
      clarificationId: clarification.clarificationId,
      excerpt: payload.excerpt ?? null,
      excerptStart: payload.excerptStart ?? null,
      excerptEnd: payload.excerptEnd ?? null,
    },
  });

  await deps.saveMessage(
      {
        userId: ctx.userId,
        isTemporary: ctx.isTemporary,
        interfaceConfig: ctx.interfaceConfig,
      },
    {
      conversationId: clarification.conversationId,
      messageId: parentMessage.messageId,
      projectId: clarification.projectId,
      text: payload.mergedText,
    },
    { context: 'clarification integration' },
  );

  return deps.updateClarification(ctx.userId, clarification.clarificationId, {
    status: 'integrated',
    integratedAt: new Date(),
    integrationPatch: {
      mergedText: payload.mergedText,
      excerpt: payload.excerpt ?? null,
      excerptStart: payload.excerptStart ?? null,
      excerptEnd: payload.excerptEnd ?? null,
      integratedAt: new Date().toISOString(),
    },
  });
}

export async function reanchorClarification(
  deps: ClarificationServiceDeps,
  userId: string,
  payload: ReanchorPayload,
): Promise<IMessageClarification | null> {
  const clarification = await deps.getClarification(userId, payload.clarificationId);
  if (!clarification) {
    throw new Error('Clarification not found');
  }

  const parentMessage = await requireParentMessage(
    deps,
    userId,
    clarification.parentMessageId,
    clarification.conversationId,
  );
  const parentText = payload.parentText ?? extractMessageText(parentMessage);
  const resolution = resolveAnchor(parentText, clarification);

  if (resolution.needsManualReanchor) {
    return deps.updateClarification(userId, clarification.clarificationId, {
      integrationPatch: buildReanchorMetadata(resolution, clarification),
    });
  }

  const anchorContext = buildAnchorContexts(parentText, resolution.anchorStart, resolution.anchorEnd);

  return deps.updateClarification(userId, clarification.clarificationId, {
    anchorStart: resolution.anchorStart,
    anchorEnd: resolution.anchorEnd,
    anchorText: resolution.anchorText,
    anchorContextBefore: anchorContext.before,
    anchorContextAfter: anchorContext.after,
    integrationPatch: buildReanchorMetadata(resolution, clarification),
  });
}

export async function listMessageRevisions(
  deps: ClarificationServiceDeps,
  userId: string,
  messageId: string,
): Promise<IMessageRevision[]> {
  return deps.listMessageRevisions(userId, messageId);
}
