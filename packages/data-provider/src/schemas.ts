import { z } from 'zod';
import { Tools } from './types/assistants';
import type { TMessageContentParts, FunctionTool, FunctionToolCall } from './types/assistants';
import { TFeedback, feedbackSchema } from './feedback';
import type { SearchResultData } from './types/web';
import type { TFile } from './types/files';

export const isUUID = z.string().uuid();

export enum AuthType {
  OVERRIDE_AUTH = 'override_auth',
  USER_PROVIDED = 'user_provided',
  SYSTEM_DEFINED = 'system_defined',
}

export const authTypeSchema = z.nativeEnum(AuthType);

export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  google = 'google',
  anthropic = 'anthropic',
  assistants = 'assistants',
  azureAssistants = 'azureAssistants',
  agents = 'agents',
  custom = 'custom',
  bedrock = 'bedrock',
}

/** Mirrors `@librechat/agents` providers */
export enum Providers {
  OPENAI = 'openAI',
  ANTHROPIC = 'anthropic',
  AZURE = 'azureOpenAI',
  GOOGLE = 'google',
  VERTEXAI = 'vertexai',
  BEDROCK = 'bedrock',
  MISTRALAI = 'mistralai',
  MISTRAL = 'mistral',
  DEEPSEEK = 'deepseek',
  MOONSHOT = 'moonshot',
  OPENROUTER = 'openrouter',
  XAI = 'xai',
}

/**
 * Endpoints that support direct PDF processing in the agent system
 */
export const documentSupportedProviders = new Set<string>([
  EModelEndpoint.anthropic,
  EModelEndpoint.openAI,
  EModelEndpoint.bedrock,
  EModelEndpoint.custom,
  // handled in AttachFileMenu and DragDropModal since azureOpenAI only supports documents with Use Responses API set to true
  // EModelEndpoint.azureOpenAI,
  EModelEndpoint.google,
  Providers.VERTEXAI,
  Providers.MISTRALAI,
  Providers.MISTRAL,
  Providers.DEEPSEEK,
  Providers.MOONSHOT,
  Providers.OPENROUTER,
  Providers.XAI,
]);

const openAILikeProviders = new Set<string>([
  Providers.OPENAI,
  Providers.AZURE,
  EModelEndpoint.custom,
  Providers.MISTRALAI,
  Providers.MISTRAL,
  Providers.DEEPSEEK,
  Providers.MOONSHOT,
  Providers.OPENROUTER,
  Providers.XAI,
]);

export const isOpenAILikeProvider = (provider?: string | null): boolean => {
  return openAILikeProviders.has(provider ?? '');
};

export const isDocumentSupportedProvider = (provider?: string | null): boolean => {
  return documentSupportedProviders.has(provider ?? '');
};

export const paramEndpoints = new Set<EModelEndpoint | string>([
  EModelEndpoint.agents,
  EModelEndpoint.openAI,
  EModelEndpoint.bedrock,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.anthropic,
  EModelEndpoint.custom,
  EModelEndpoint.google,
]);

export enum BedrockProviders {
  AI21 = 'ai21',
  Amazon = 'amazon',
  Anthropic = 'anthropic',
  Cohere = 'cohere',
  DeepSeek = 'deepseek',
  Meta = 'meta',
  MistralAI = 'mistral',
  Moonshot = 'moonshot',
  MoonshotAI = 'moonshotai',
  OpenAI = 'openai',
  StabilityAI = 'stability',
  ZAI = 'zai',
}

export const getModelKey = (endpoint: EModelEndpoint | string, model: string) => {
  if (endpoint === EModelEndpoint.bedrock) {
    const parts = model.split('.');
    const provider = [parts[0], parts[1]].find((part) =>
      Object.values(BedrockProviders).includes(part as BedrockProviders),
    );
    return (provider ?? parts[0]) as BedrockProviders;
  }
  return model;
};

export const getSettingsKeys = (endpoint: EModelEndpoint | string, model: string) => {
  const endpointKey = endpoint;
  const modelKey = getModelKey(endpointKey, model);
  const combinedKey = `${endpointKey}-${modelKey}`;
  return [combinedKey, endpointKey];
};

export type AssistantsEndpoint = EModelEndpoint.assistants | EModelEndpoint.azureAssistants;

export const isAssistantsEndpoint = (_endpoint?: AssistantsEndpoint | null | string): boolean => {
  const endpoint = _endpoint ?? '';
  if (!endpoint) {
    return false;
  }
  return endpoint.toLowerCase().endsWith(EModelEndpoint.assistants);
};

export type AgentProvider = Exclude<keyof typeof EModelEndpoint, EModelEndpoint.agents> | string;

export const isAgentsEndpoint = (_endpoint?: EModelEndpoint.agents | null | string): boolean => {
  const endpoint = _endpoint ?? '';
  if (!endpoint) {
    return false;
  }
  return endpoint === EModelEndpoint.agents;
};

export const isParamEndpoint = (
  endpoint: EModelEndpoint | string,
  endpointType?: EModelEndpoint | string,
): boolean => {
  if (paramEndpoints.has(endpoint)) {
    return true;
  }

  if (endpointType != null) {
    return paramEndpoints.has(endpointType);
  }

  return false;
};

export enum ImageDetail {
  low = 'low',
  auto = 'auto',
  high = 'high',
}

export enum ReasoningEffort {
  unset = '',
  none = 'none',
  minimal = 'minimal',
  low = 'low',
  medium = 'medium',
  high = 'high',
  xhigh = 'xhigh',
}

export enum AnthropicEffort {
  unset = '',
  low = 'low',
  medium = 'medium',
  high = 'high',
  max = 'max',
}

export enum BedrockReasoningConfig {
  low = 'low',
  medium = 'medium',
  high = 'high',
}

export enum ReasoningSummary {
  none = '',
  auto = 'auto',
  concise = 'concise',
  detailed = 'detailed',
}

export enum Verbosity {
  none = '',
  low = 'low',
  medium = 'medium',
  high = 'high',
}

export enum ThinkingLevel {
  unset = '',
  minimal = 'minimal',
  low = 'low',
  medium = 'medium',
  high = 'high',
}

export const imageDetailNumeric = {
  [ImageDetail.low]: 0,
  [ImageDetail.auto]: 1,
  [ImageDetail.high]: 2,
};

export const imageDetailValue = {
  0: ImageDetail.low,
  1: ImageDetail.auto,
  2: ImageDetail.high,
};

export const eImageDetailSchema = z.nativeEnum(ImageDetail);
export const eReasoningEffortSchema = z.nativeEnum(ReasoningEffort);
export const eAnthropicEffortSchema = z.nativeEnum(AnthropicEffort);
export const eReasoningSummarySchema = z.nativeEnum(ReasoningSummary);
export const eVerbositySchema = z.nativeEnum(Verbosity);
export const eThinkingLevelSchema = z.nativeEnum(ThinkingLevel);

export const defaultAssistantFormValues = {
  assistant: '',
  id: '',
  name: '',
  description: '',
  instructions: '',
  conversation_starters: [],
  model: '',
  functions: [],
  code_interpreter: false,
  image_vision: false,
  retrieval: false,
  append_current_datetime: false,
};

export const defaultAgentFormValues = {
  agent: {},
  id: '',
  name: '',
  description: '',
  instructions: '',
  model: '',
  model_parameters: {},
  tools: [],
  tool_options: {},
  provider: {},
  edges: [],
  artifacts: '',
  recursion_limit: undefined,
  [Tools.execute_code]: false,
  [Tools.file_search]: false,
  [Tools.web_search]: false,
  category: 'general',
  support_contact: {
    name: '',
    email: '',
  },
};

export const ImageVisionTool: FunctionTool = {
  type: Tools.function,
  [Tools.function]: {
    name: 'image_vision',
    description: 'Get detailed text descriptions for all current image attachments.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

export const isImageVisionTool = (tool: FunctionTool | FunctionToolCall) =>
  tool.type === 'function' && tool.function?.name === ImageVisionTool.function?.name;

export const openAISettings = {
  model: {
    default: 'gpt-4o-mini' as const,
  },
  temperature: {
    min: 0 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  top_p: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  presence_penalty: {
    min: -2 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 0 as const,
  },
  frequency_penalty: {
    min: -2 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 0 as const,
  },
  resendFiles: {
    default: true as const,
  },
  maxContextTokens: {
    default: undefined,
  },
  max_tokens: {
    default: undefined,
  },
  imageDetail: {
    default: ImageDetail.auto as const,
    min: 0 as const,
    max: 2 as const,
    step: 1 as const,
  },
};

export const googleSettings = {
  model: {
    default: 'gemini-1.5-flash-latest' as const,
  },
  maxOutputTokens: {
    min: 1 as const,
    max: 64000 as const,
    step: 1 as const,
    default: 8192 as const,
  },
  temperature: {
    min: 0 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  topP: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 0.95 as const,
  },
  topK: {
    min: 1 as const,
    max: 40 as const,
    step: 1 as const,
    default: 40 as const,
  },
  thinking: {
    default: true as const,
  },
  thinkingBudget: {
    min: -1 as const,
    max: 32000 as const,
    step: 1 as const,
    /** `-1` = Dynamic Thinking, meaning the model will adjust
     * the budget based on the complexity of the request.
     */
    default: -1 as const,
  },
  thinkingLevel: {
    default: ThinkingLevel.unset as const,
  },
};

const ANTHROPIC_MAX_OUTPUT = 128000 as const;
const CLAUDE_4_64K_MAX_OUTPUT = 64000 as const;
const CLAUDE_32K_MAX_OUTPUT = 32000 as const;
const DEFAULT_MAX_OUTPUT = 8192 as const;
const LEGACY_ANTHROPIC_MAX_OUTPUT = 4096 as const;
export const anthropicSettings = {
  model: {
    default: 'claude-3-5-sonnet-latest' as const,
  },
  temperature: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  promptCache: {
    default: true as const,
  },
  thinking: {
    default: true as const,
  },
  thinkingBudget: {
    min: 1024 as const,
    step: 100 as const,
    max: 200000 as const,
    default: 2000 as const,
  },
  maxOutputTokens: {
    min: 1 as const,
    max: ANTHROPIC_MAX_OUTPUT,
    step: 1 as const,
    default: DEFAULT_MAX_OUTPUT,
    reset: (modelName: string) => {
      if (/claude-opus[-.]?(?:4[-.]?(?:[6-9]|\d{2,})|[5-9]|\d{2,})/.test(modelName)) {
        return ANTHROPIC_MAX_OUTPUT;
      }

      if (/claude-(?:sonnet|haiku)[-.]?[4-9]/.test(modelName)) {
        return CLAUDE_4_64K_MAX_OUTPUT;
      }

      if (/claude-opus[-.]?(?:[5-9]|4[-.]?([5-9]|\d{2,}))/.test(modelName)) {
        return CLAUDE_4_64K_MAX_OUTPUT;
      }

      if (/claude-opus[-.]?[4-9]/.test(modelName)) {
        return CLAUDE_32K_MAX_OUTPUT;
      }

      return DEFAULT_MAX_OUTPUT;
    },
    set: (value: number, modelName: string) => {
      if (/claude-opus[-.]?(?:4[-.]?(?:[6-9]|\d{2,})|[5-9]|\d{2,})/.test(modelName)) {
        if (value > ANTHROPIC_MAX_OUTPUT) {
          return ANTHROPIC_MAX_OUTPUT;
        }
        return value;
      }

      if (/claude-(?:sonnet|haiku)[-.]?[4-9]/.test(modelName) && value > CLAUDE_4_64K_MAX_OUTPUT) {
        return CLAUDE_4_64K_MAX_OUTPUT;
      }

      if (/claude-opus[-.]?(?:[5-9]|4[-.]?([5-9]|\d{2,}))/.test(modelName)) {
        if (value > CLAUDE_4_64K_MAX_OUTPUT) {
          return CLAUDE_4_64K_MAX_OUTPUT;
        }
        return value;
      }

      if (/claude-opus[-.]?[4-9]/.test(modelName) && value > CLAUDE_32K_MAX_OUTPUT) {
        return CLAUDE_32K_MAX_OUTPUT;
      }

      if (value > ANTHROPIC_MAX_OUTPUT) {
        return ANTHROPIC_MAX_OUTPUT;
      }

      return value;
    },
  },
  topP: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 0.7 as const,
  },
  topK: {
    min: 1 as const,
    max: 40 as const,
    step: 1 as const,
    default: 5 as const,
  },
  resendFiles: {
    default: true as const,
  },
  maxContextTokens: {
    default: undefined,
  },
  legacy: {
    maxOutputTokens: {
      min: 1 as const,
      max: LEGACY_ANTHROPIC_MAX_OUTPUT,
      step: 1 as const,
      default: LEGACY_ANTHROPIC_MAX_OUTPUT,
    },
  },
  effort: {
    default: AnthropicEffort.unset,
    options: [
      AnthropicEffort.unset,
      AnthropicEffort.low,
      AnthropicEffort.medium,
      AnthropicEffort.high,
      AnthropicEffort.max,
    ],
  },
  web_search: {
    default: false as const,
  },
};

export const agentsSettings = {
  model: {
    default: 'gpt-3.5-turbo-test' as const,
  },
  temperature: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  top_p: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  presence_penalty: {
    min: -2 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 0 as const,
  },
  frequency_penalty: {
    min: -2 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 0 as const,
  },
  resendFiles: {
    default: true as const,
  },
  maxContextTokens: {
    default: undefined,
  },
  max_tokens: {
    default: undefined,
  },
  imageDetail: {
    default: ImageDetail.auto as const,
  },
};

export const endpointSettings = {
  [EModelEndpoint.openAI]: openAISettings,
  [EModelEndpoint.google]: googleSettings,
  [EModelEndpoint.anthropic]: anthropicSettings,
  [EModelEndpoint.agents]: agentsSettings,
  [EModelEndpoint.bedrock]: agentsSettings,
};

const google = endpointSettings[EModelEndpoint.google];

export const eModelEndpointSchema = z.nativeEnum(EModelEndpoint);

export const extendedModelEndpointSchema = z.union([eModelEndpointSchema, z.string()]);

export const tPluginAuthConfigSchema = z.object({
  authField: z.string(),
  label: z.string(),
  description: z.string(),
  optional: z.boolean().optional(),
});

export type TPluginAuthConfig = z.infer<typeof tPluginAuthConfigSchema>;

export const tPluginSchema = z.object({
  name: z.string(),
  pluginKey: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  authConfig: z.array(tPluginAuthConfigSchema).optional(),
  authenticated: z.boolean().optional(),
  chatMenu: z.boolean().optional(),
  isButton: z.boolean().optional(),
  toolkit: z.boolean().optional(),
});

export type TPlugin = z.infer<typeof tPluginSchema>;

export type TInput = {
  inputStr: string;
};

export const tExampleSchema = z.object({
  input: z.object({
    content: z.string(),
  }),
  output: z.object({
    content: z.string(),
  }),
});

export type TExample = z.infer<typeof tExampleSchema>;

export const tMessageSchema = z.object({
  messageId: z.string(),
  endpoint: z.string().optional(),
  clientId: z.string().nullable().optional(),
  conversationId: z.string().nullable(),
  projectId: z.string().nullable().optional(),
  parentMessageId: z.string().nullable(),
  responseMessageId: z.string().nullable().optional(),
  overrideParentMessageId: z.string().nullable().optional(),
  bg: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  title: z.string().nullable().or(z.literal('New Chat')).default('New Chat'),
  sender: z.string().optional(),
  text: z.string(),
  /** @deprecated */
  generation: z.string().nullable().optional(),
  isCreatedByUser: z.boolean(),
  error: z.boolean().optional(),
  clientTimestamp: z.string().optional(),
  createdAt: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
  updatedAt: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
  current: z.boolean().optional(),
  unfinished: z.boolean().optional(),
  searchResult: z.boolean().optional(),
  finish_reason: z.string().optional(),
  /* assistant */
  thread_id: z.string().optional(),
  /* frontend components */
  iconURL: z.string().nullable().optional(),
  feedback: feedbackSchema.optional(),
  /** metadata */
  metadata: z.record(z.unknown()).optional(),
  contextMeta: z
    .object({
      calibrationRatio: z
        .number()
        .optional()
        .describe(
          'EMA ratio of provider-reported vs local token estimates; seeds the pruner on subsequent runs',
        ),
      encoding: z
        .string()
        .optional()
        .describe(
          'Tokenizer encoding used when this ratio was computed (e.g. "claude", "o200k_base")',
        ),
    })
    .optional(),
});

export type MemoryArtifact = {
  key: string;
  value?: string;
  tokenCount?: number;
  type: 'update' | 'delete' | 'error';
};

export type UIResource = {
  resourceId: string;
  uri: string;
  mimeType?: string;
  text?: string;
  [key: string]: unknown;
};

export type TAttachmentMetadata = {
  type?: Tools;
  messageId: string;
  toolCallId: string;
  [Tools.memory]?: MemoryArtifact;
  [Tools.ui_resources]?: UIResource[];
  [Tools.web_search]?: SearchResultData;
  [Tools.file_search]?: SearchResultData;
};

export type TAttachment =
  | (TFile & TAttachmentMetadata)
  | (Pick<TFile, 'filename' | 'filepath' | 'conversationId'> & {
      expiresAt: number;
    } & TAttachmentMetadata)
  | (Partial<Pick<TFile, 'filename' | 'filepath'>> &
      Pick<TFile, 'conversationId'> &
      TAttachmentMetadata);

export type TMessage = z.input<typeof tMessageSchema> & {
  children?: TMessage[];
  content?: TMessageContentParts[];
  files?: Partial<TFile>[];
  depth?: number;
  siblingIndex?: number;
  attachments?: TAttachment[];
  clientTimestamp?: string;
  feedback?: TFeedback;
};

export const coerceNumber = z.union([z.number(), z.string()]).transform((val) => {
  if (typeof val === 'string') {
    return val.trim() === '' ? undefined : parseFloat(val);
  }
  return val;
});

type DocumentTypeValue =
  | null
  | boolean
  | number
  | string
  | DocumentTypeValue[]
  | { [key: string]: DocumentTypeValue };

const DocumentType: z.ZodType<DocumentTypeValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(z.lazy(() => DocumentType)),
    z.record(z.lazy(() => DocumentType)),
  ]),
);

export const tConversationSchema = z.object({
  conversationId: z.string().nullable(),
  projectId: z.string().nullable().optional(),
  endpoint: eModelEndpointSchema.nullable(),
  endpointType: eModelEndpointSchema.nullable().optional(),
  isArchived: z.boolean().optional(),
  title: z.string().nullable().or(z.literal('New Chat')).default('New Chat'),
  user: z.string().optional(),
  messages: z.array(z.string()).optional(),
  tools: z.union([z.array(tPluginSchema), z.array(z.string())]).optional(),
  modelLabel: z.string().nullable().optional(),
  userLabel: z.string().optional(),
  model: z.string().nullable().optional(),
  promptPrefix: z.string().nullable().optional(),
  temperature: z.number().nullable().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  top_p: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  parentMessageId: z.string().optional(),
  maxOutputTokens: coerceNumber.nullable().optional(),
  maxContextTokens: coerceNumber.optional(),
  max_tokens: coerceNumber.optional(),
  /* Anthropic */
  promptCache: z.boolean().optional(),
  system: z.string().optional(),
  thinking: z.boolean().optional(),
  thinkingBudget: coerceNumber.optional(),
  thinkingLevel: eThinkingLevelSchema.optional(),
  stream: z.boolean().optional(),
  /* artifacts */
  artifacts: z.string().optional(),
  /* google */
  context: z.string().nullable().optional(),
  examples: z.array(tExampleSchema).optional(),
  /* DB */
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /* Files */
  resendFiles: z.boolean().optional(),
  file_ids: z.array(z.string()).optional(),
  /* vision */
  imageDetail: eImageDetailSchema.optional(),
  /* OpenAI: Reasoning models only */
  reasoning_effort: eReasoningEffortSchema.optional().nullable(),
  reasoning_summary: eReasoningSummarySchema.optional().nullable(),
  /* OpenAI: Verbosity control */
  verbosity: eVerbositySchema.optional().nullable(),
  /* OpenAI: use Responses API */
  useResponsesApi: z.boolean().optional(),
  /* Anthropic: Effort control */
  effort: eAnthropicEffortSchema.optional().nullable(),
  /* OpenAI Responses API / Anthropic API / Google API */
  web_search: z.boolean().optional(),
  /* disable streaming */
  disableStreaming: z.boolean().optional(),
  /* assistant */
  assistant_id: z.string().optional(),
  /* agents */
  agent_id: z.string().optional(),
  /* AWS Bedrock */
  region: z.string().optional(),
  maxTokens: coerceNumber.optional(),
  additionalModelRequestFields: DocumentType.optional(),
  /* assistants */
  instructions: z.string().optional(),
  additional_instructions: z.string().optional(),
  append_current_datetime: z.boolean().optional(),
  /** Used to overwrite active conversation settings when saving a Preset */
  presetOverride: z.record(z.unknown()).optional(),
  stop: z.array(z.string()).optional(),
  /* frontend components */
  greeting: z.string().optional(),
  spec: z.string().nullable().optional(),
  iconURL: z.string().nullable().optional(),
  /* temporary chat */
  expiredAt: z.string().nullable().optional(),
  /* file token limits */
  fileTokenLimit: coerceNumber.optional(),
  /** @deprecated */
  resendImages: z.boolean().optional(),
  /** @deprecated Prefer `modelLabel` over `chatGptLabel` */
  chatGptLabel: z.string().nullable().optional(),
});

export const tPresetSchema = tConversationSchema
  .omit({
    conversationId: true,
    createdAt: true,
    updatedAt: true,
    title: true,
  })
  .merge(
    z.object({
      conversationId: z.string().nullable().optional(),
      presetId: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      defaultPreset: z.boolean().optional(),
      order: z.number().optional(),
      endpoint: extendedModelEndpointSchema.nullable(),
    }),
  );

export const tConvoUpdateSchema = tConversationSchema.merge(
  z.object({
    endpoint: extendedModelEndpointSchema.nullable(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
);

export const tQueryParamsSchema = tConversationSchema
  .pick({
    // librechat settings
    /** The model spec to be used */
    spec: true,
    /** The AI context window, overrides the system-defined window as determined by `model` value */
    maxContextTokens: true,
    /**
     * Whether or not to re-submit files from previous messages on subsequent messages
     * */
    resendFiles: true,
    /**
     * @endpoints openAI, custom, azureOpenAI
     *
     * System parameter that only affects the above endpoints.
     * Image detail for re-sizing according to OpenAI spec, defaults to `auto`
     * */
    imageDetail: true,
    /**
     * AKA Custom Instructions, dynamically added to chat history as a system message;
     * for `bedrock` endpoint, this is used as the `system` model param if the provider uses it;
     * for `assistants` endpoint, this is used as the `additional_instructions` model param:
     * https://platform.openai.com/docs/api-reference/runs/createRun#runs-createrun-additional_instructions
     * ; otherwise, a message with `system` role is added to the chat history
     */
    promptPrefix: true,
    // Model parameters
    /** @endpoints openAI, custom, azureOpenAI, google, anthropic, assistants, azureAssistants, bedrock */
    model: true,
    /** @endpoints openAI, custom, azureOpenAI, google, anthropic, bedrock */
    temperature: true,
    /** @endpoints openAI, custom, azureOpenAI */
    presence_penalty: true,
    /** @endpoints openAI, custom, azureOpenAI */
    frequency_penalty: true,
    /** @endpoints openAI, custom, azureOpenAI */
    stop: true,
    /** @endpoints openAI, custom, azureOpenAI */
    top_p: true,
    /** @endpoints openAI, custom, azureOpenAI */
    max_tokens: true,
    /** @endpoints openAI, custom, azureOpenAI */
    reasoning_effort: true,
    /** @endpoints openAI, custom, azureOpenAI */
    reasoning_summary: true,
    /** @endpoints openAI, custom, azureOpenAI */
    verbosity: true,
    /** @endpoints openAI, custom, azureOpenAI */
    useResponsesApi: true,
    /** @endpoints openAI, anthropic, google */
    web_search: true,
    /** @endpoints openAI, custom, azureOpenAI */
    disableStreaming: true,
    /** @endpoints google, anthropic, bedrock */
    topP: true,
    /** @endpoints google, anthropic */
    topK: true,
    /** @endpoints google, anthropic */
    maxOutputTokens: true,
    /** @endpoints anthropic */
    promptCache: true,
    thinking: true,
    thinkingBudget: true,
    thinkingLevel: true,
    effort: true,
    /** @endpoints bedrock */
    region: true,
    /** @endpoints bedrock */
    maxTokens: true,
    /** @endpoints agents */
    agent_id: true,
    /** @endpoints assistants, azureAssistants */
    assistant_id: true,
    /** @endpoints assistants, azureAssistants */
    append_current_datetime: true,
    /**
     * @endpoints assistants, azureAssistants
     *
     * Overrides existing assistant instructions, only used for the current run:
     * https://platform.openai.com/docs/api-reference/runs/createRun#runs-createrun-instructions
     * */
    instructions: true,
    /** @endpoints openAI, google, anthropic */
    fileTokenLimit: true,
  })
  .merge(
    z.object({
      /** @endpoints openAI, custom, azureOpenAI, google, anthropic, assistants, azureAssistants, bedrock, agents */
      endpoint: extendedModelEndpointSchema.nullable(),
    }),
  );

/** Narrowed preset schema for use in model specs — omits system/DB/deprecated fields */
export const tModelSpecPresetSchema = tPresetSchema.omit({
  conversationId: true,
  presetId: true,
  title: true,
  defaultPreset: true,
  order: true,
  isArchived: true,
  user: true,
  messages: true,
  tags: true,
  file_ids: true,
  expiredAt: true,
  parentMessageId: true,
  resendImages: true,
  chatGptLabel: true,
  presetOverride: true,
  greeting: true,
  iconURL: true,
  spec: true,
});

export type TModelSpecPreset = z.infer<typeof tModelSpecPresetSchema>;

export type TPreset = z.infer<typeof tPresetSchema>;

export type TSetOption = (
  param: number | string,
) => (newValue: number | string | boolean | string[] | Partial<TPreset>) => void;

export type TConversation = z.infer<typeof tConversationSchema> & {
  presetOverride?: Partial<TPreset>;
  disableParams?: boolean;
};

export const clarificationStatusSchema = z.enum(['active', 'collapsed', 'integrated', 'archived']);

export type TClarificationStatus = z.infer<typeof clarificationStatusSchema>;

export const inlineSuggestionProfileSchema = z.enum([
  'conceptual',
  'procedural',
  'equational',
  'precise',
  'mixed',
]);

export type TInlineSuggestionProfile = z.infer<typeof inlineSuggestionProfileSchema>;

export const visualizationArtifactTypeSchema = z.enum([
  'html_app',
  'svg',
  'image',
  'mermaid',
  'markdown_explainer_with_embeds',
  'json_spec',
]);

export type TVisualizationArtifactType = z.infer<typeof visualizationArtifactTypeSchema>;

export const visualizationStatusSchema = z.enum(['draft', 'ready', 'failed', 'archived']);

export type TVisualizationStatus = z.infer<typeof visualizationStatusSchema>;

export const visualizationStorageModeSchema = z.enum(['db_inline', 'file_store', 'hybrid']);

export type TVisualizationStorageMode = z.infer<typeof visualizationStorageModeSchema>;

export const visualizationIntegrationStateSchema = z.enum([
  'nested_only',
  'integrated',
  'detached',
]);

export type TVisualizationIntegrationState = z.infer<typeof visualizationIntegrationStateSchema>;

export const documentSourceKindSchema = z.enum([
  'pdf',
  'markdown',
  'text',
  'docx',
  'epub',
  'other',
]);

export const documentIngestionStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed']);

export const documentIngestionStrategySchema = z.enum([
  'ocr_markdown',
  'document_parser',
  'markdown_direct',
  'text_direct',
  'plain_text',
]);

export const documentBlockTypeSchema = z.enum([
  'heading',
  'paragraph',
  'list',
  'table',
  'blockquote',
  'code',
  'math_block',
  'figure',
  'caption',
  'page_break',
]);

export const dialogSourceTypeSchema = z.enum(['paper', 'repository', 'document', 'webpage']);

export const dialogCellTypeSchema = z.enum(['note', 'code', 'prompt', 'output', 'terminal']);

export const dialogExecutionRunStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed']);

export const dialogTeachingModeSchema = z.enum([
  'teach_me',
  'hint_mode',
  'explain_then_do',
  'just_do_it',
]);

export const documentClarificationStatusSchema = z.enum(['active', 'integrated', 'archived']);

export const documentSpeechSegmentKindSchema = z.enum([
  'text',
  'heading',
  'caption',
  'table_summary',
  'figure_summary',
  'math_inline_rewrite',
  'math_block_narration',
  'pause_for_visual',
  'resume_after_pause',
]);

export const documentSpeechPlaybackDirectiveSchema = z.enum(['continue', 'pause_for_visual']);

export const documentSpeechAudioStatusSchema = z.enum([
  'pending',
  'ready',
  'failed',
  'not_required',
]);

export const documentSpeechHighlightModeSchema = z.enum(['off', 'excerpt', 'block']);

export type TDocumentSpeechHighlightMode = z.infer<typeof documentSpeechHighlightModeSchema>;

export const tDocumentAnchorSchema = z.object({
  blockId: z.string(),
  blockType: documentBlockTypeSchema,
  anchorText: z.string(),
  anchorContextBefore: z.string(),
  anchorContextAfter: z.string(),
  startOffset: z.number(),
  endOffset: z.number(),
  headingPath: z.array(z.string()),
  pageStart: z.number().nullable().optional(),
  pageEnd: z.number().nullable().optional(),
});

export type TDocumentAnchor = z.infer<typeof tDocumentAnchorSchema>;

export const tDocumentBlockSchema = z.object({
  blockId: z.string(),
  type: documentBlockTypeSchema,
  assetId: z.string().nullable().optional(),
  level: z.number().nullable().optional(),
  title: z.string().nullable().optional(),
  sourcePageStart: z.number().nullable().optional(),
  sourcePageEnd: z.number().nullable().optional(),
  contentMarkdown: z.string(),
  contentHtml: z.string().nullable().optional(),
  plainText: z.string(),
  anchorPath: z.string(),
});

export type TDocumentBlock = z.infer<typeof tDocumentBlockSchema>;

export const tDocumentOutlineItemSchema = z.object({
  id: z.string(),
  blockId: z.string(),
  depth: z.number(),
  title: z.string(),
  anchorPath: z.string(),
});

export type TDocumentOutlineItem = z.infer<typeof tDocumentOutlineItemSchema>;

export const tDocumentIRSchema = z.object({
  documentId: z.string(),
  projectId: z.string().nullable().optional(),
  sourceFileId: z.string(),
  sourceType: z.string(),
  title: z.string(),
  blocks: z.array(tDocumentBlockSchema),
  outline: z.array(tDocumentOutlineItemSchema),
  citations: z.array(DocumentType).optional(),
  assets: z.array(DocumentType).optional(),
  mathSpans: z.array(DocumentType).optional(),
  anchorIndex: z.record(
    z.object({
      blockId: z.string(),
      type: documentBlockTypeSchema,
    }),
  ),
  renderVersion: z.number(),
});

export type TDocumentIR = z.infer<typeof tDocumentIRSchema>;

export const tProjectSchema = z.object({
  projectId: z.string(),
  ownerUserId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TProject = z.infer<typeof tProjectSchema>;

export const tProjectSourceSchema = z.object({
  sourceId: z.string(),
  projectId: z.string(),
  ownerUserId: z.string(),
  sourceType: z.enum(['file', 'url', 'note']),
  title: z.string(),
  description: z.string().nullable().optional(),
  fileId: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  noteBody: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TProjectSource = z.infer<typeof tProjectSourceSchema>;

export const tClarificationSchema = z.object({
  clarificationId: z.string(),
  projectId: z.string(),
  conversationId: z.string(),
  parentMessageId: z.string(),
  anchorStart: z.number(),
  anchorEnd: z.number(),
  anchorText: z.string(),
  anchorContextBefore: z.string(),
  anchorContextAfter: z.string(),
  clarificationQuestion: z.string(),
  clarificationAnswer: z.string(),
  status: clarificationStatusSchema,
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  integratedAt: z.string().nullable().optional(),
  integrationPatch: DocumentType.nullable().optional(),
});

export type TClarification = z.infer<typeof tClarificationSchema>;

export const tExistingClarificationContextSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export type TExistingClarificationContext = z.infer<typeof tExistingClarificationContextSchema>;

export const tClarificationSuggestionSchema = z.object({
  label: z.string(),
  proposedQuestion: z.string(),
  understandingGain: z.string(),
  reasoning: z.string(),
});

export type TClarificationSuggestion = z.infer<typeof tClarificationSuggestionSchema>;

export const tClarificationSuggestionSetSchema = z.object({
  contentProfile: inlineSuggestionProfileSchema,
  focusSummary: z.string(),
  suggestions: z.array(tClarificationSuggestionSchema).min(1),
});

export type TClarificationSuggestionSet = z.infer<typeof tClarificationSuggestionSetSchema>;

export const tVisualizationGenerationMetadataSchema = z.object({
  error: z.string().nullable().optional(),
  rawResponse: z.string().nullable().optional(),
  originalMimeType: z.string().nullable().optional(),
  sanitizedMimeType: z.string().nullable().optional(),
  storageByteSize: z.number().optional(),
  warnings: z.array(z.string()).optional(),
});

export type TVisualizationGenerationMetadata = z.infer<
  typeof tVisualizationGenerationMetadataSchema
>;

export const tVisualizationSchema = z.object({
  visualizationId: z.string(),
  projectId: z.string().nullable().optional(),
  conversationId: z.string(),
  parentMessageId: z.string(),
  anchorStart: z.number(),
  anchorEnd: z.number(),
  anchorText: z.string(),
  anchorContextBefore: z.string(),
  anchorContextAfter: z.string(),
  anchorPath: z.string().nullable().optional(),
  inlineThreadId: z.string().nullable().optional(),
  parentVisualizationId: z.string().nullable().optional(),
  rootVisualizationId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  artifactType: visualizationArtifactTypeSchema,
  status: visualizationStatusSchema,
  storageMode: visualizationStorageModeSchema,
  canonicalSourceText: z.string(),
  canonicalSourceMimeType: z.string().nullable().optional(),
  compiledRenderText: z.string().nullable().optional(),
  compiledRenderMimeType: z.string(),
  compiledRenderStoragePath: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  sourcePrompt: z.string(),
  generationModel: z.string().nullable().optional(),
  generationMetadata: tVisualizationGenerationMetadataSchema.nullable().optional(),
  integrationState: visualizationIntegrationStateSchema,
  isLatestVersion: z.boolean(),
  versionNumber: z.number(),
  createdByUserId: z.string(),
  integratedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TVisualization = z.infer<typeof tVisualizationSchema>;

export const tVisualizationSuggestionSchema = z.object({
  label: z.string(),
  artifactType: visualizationArtifactTypeSchema,
  proposedPrompt: z.string(),
  understandingGain: z.string(),
  reasoning: z.string(),
});

export type TVisualizationSuggestion = z.infer<typeof tVisualizationSuggestionSchema>;

export const tVisualizationSuggestionSetSchema = z.object({
  contentProfile: inlineSuggestionProfileSchema,
  focusSummary: z.string(),
  suggestions: z.array(tVisualizationSuggestionSchema).min(1),
});

export type TVisualizationSuggestionSet = z.infer<typeof tVisualizationSuggestionSetSchema>;

export const tStudyDocumentSchema = z.object({
  documentId: z.string(),
  projectId: z.string().nullable().optional(),
  sourceFileId: z.string(),
  title: z.string(),
  sourceMimeType: z.string(),
  sourceKind: documentSourceKindSchema,
  ingestionStatus: documentIngestionStatusSchema,
  ingestionStrategy: documentIngestionStrategySchema,
  activeRenderVersionId: z.string().nullable().optional(),
  activeOverlayId: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TStudyDocument = z.infer<typeof tStudyDocumentSchema>;

export const tDialogTrajectorySchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  prompt: z.string(),
  focus: z.array(z.string()),
});

export type TDialogTrajectory = z.infer<typeof tDialogTrajectorySchema>;

export const dialogPlanNodeTypeSchema = z.enum([
  'concept',
  'implementation',
  'bridge',
  'verification',
  'synthesis',
]);

export const dialogPlanNodeStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'needs_breakdown',
  'mastered',
  'blocked',
  'skipped',
]);

export const dialogCellAuthorSchema = z.enum(['tutor', 'user']);
export const dialogCellRoleSchema = z.enum([
  'instruction',
  'exercise',
  'checkpoint',
  'assistant_query',
  'output',
]);

export const tDialogPlanSourceAnchorSchema = z.object({
  sourceType: dialogSourceTypeSchema,
  sourceRef: z.string(),
  label: z.string(),
  detail: z.string().nullable().optional(),
});

export type TDialogPlanSourceAnchor = z.infer<typeof tDialogPlanSourceAnchorSchema>;

export const tDialogCellMetadataSchema = z.object({
  nodeId: z.string().nullable().optional(),
  authoredBy: dialogCellAuthorSchema.nullable().optional(),
  cellRole: dialogCellRoleSchema.nullable().optional(),
  stepIntent: z.string().nullable().optional(),
  starterPrompt: z.boolean().nullable().optional(),
  sourceCellId: z.string().nullable().optional(),
  runId: z.string().nullable().optional(),
  checkpointPrompt: z.string().nullable().optional(),
  learnerResponse: z.string().nullable().optional(),
});

export type TDialogCellMetadata = z.infer<typeof tDialogCellMetadataSchema>;

export const tStudyDialogSchema = z.object({
  dialogId: z.string(),
  projectId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  createdByUserId: z.string(),
  kernelStateRef: z.string().nullable().optional(),
  sourceManifestJson: z.array(
    z.object({
      importId: z.string(),
      sourceType: dialogSourceTypeSchema,
      sourceRef: z.string(),
      title: z.string(),
      description: z.string().nullable().optional(),
      metadata: DocumentType.nullable().optional(),
    }),
  ),
  metadataJson: DocumentType.nullable().optional(),
  teachingMode: dialogTeachingModeSchema,
  selectedTrajectoryKey: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TStudyDialog = z.infer<typeof tStudyDialogSchema>;

export const tDialogCellAnchorSchema = z.object({
  cellId: z.string(),
  anchorText: z.string(),
  anchorContextBefore: z.string(),
  anchorContextAfter: z.string(),
  startOffset: z.number(),
  endOffset: z.number(),
});

export type TDialogCellAnchor = z.infer<typeof tDialogCellAnchorSchema>;

export const tDialogCellSchema = z.object({
  cellId: z.string(),
  dialogId: z.string(),
  position: z.number(),
  cellType: dialogCellTypeSchema,
  title: z.string().nullable().optional(),
  sourceMarkdown: z.string().nullable().optional(),
  sourceCode: z.string().nullable().optional(),
  renderHtml: z.string().nullable().optional(),
  metadataJson: tDialogCellMetadataSchema.nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDialogCell = z.infer<typeof tDialogCellSchema>;

export const tDialogPlanNodeSchema = z.object({
  nodeId: z.string(),
  dialogId: z.string(),
  parentNodeId: z.string().nullable().optional(),
  dependencyNodeIds: z.array(z.string()),
  nodeType: dialogPlanNodeTypeSchema,
  title: z.string(),
  objective: z.string(),
  sourceAnchors: z.array(tDialogPlanSourceAnchorSchema),
  status: dialogPlanNodeStatusSchema,
  depth: z.number(),
  priority: z.number(),
  masteryEvidenceJson: DocumentType.nullable().optional(),
  plannerNotes: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDialogPlanNode = z.infer<typeof tDialogPlanNodeSchema>;

export const dialogTutorLastActionSchema = z.enum([
  'initialized',
  'advance',
  'understood',
  'break_down',
  'stuck',
  'skip',
  'evaluate',
]);

export const dialogTutorCompletionStateSchema = z.enum(['active', 'complete']);

export const tDialogTutorStateSchema = z.object({
  dialogId: z.string(),
  selectedTrajectoryKey: z.string().nullable().optional(),
  activeNodeId: z.string().nullable().optional(),
  rootNodeIds: z.array(z.string()),
  learnerModelJson: DocumentType.nullable().optional(),
  planVersion: z.number(),
  lastTutorAction: dialogTutorLastActionSchema,
  completionState: dialogTutorCompletionStateSchema,
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDialogTutorState = z.infer<typeof tDialogTutorStateSchema>;

export const tDialogExecutionRunSchema = z.object({
  runId: z.string(),
  dialogId: z.string(),
  cellId: z.string(),
  kernelSessionId: z.string(),
  status: dialogExecutionRunStatusSchema,
  stdout: z.string(),
  stderr: z.string(),
  resultJson: DocumentType.nullable().optional(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDialogExecutionRun = z.infer<typeof tDialogExecutionRunSchema>;

export const tDialogImportSchema = z.object({
  importId: z.string(),
  dialogId: z.string(),
  sourceType: dialogSourceTypeSchema,
  sourceRef: z.string(),
  title: z.string(),
  metadataJson: DocumentType.nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDialogImport = z.infer<typeof tDialogImportSchema>;

export const tDialogSourceMapSchema = z.object({
  mapId: z.string(),
  dialogId: z.string(),
  paperAnchor: z.string(),
  repoPath: z.string(),
  symbolName: z.string().nullable().optional(),
  mappingType: z.string(),
  confidence: z.number(),
  notesMarkdown: z.string(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDialogSourceMap = z.infer<typeof tDialogSourceMapSchema>;

export const dialogClarificationStatusSchema = z.enum(['active', 'integrated', 'archived']);

export const tDialogClarificationSchema = z.object({
  clarificationId: z.string(),
  dialogId: z.string(),
  cellId: z.string(),
  anchor: tDialogCellAnchorSchema,
  clarificationQuestion: z.string(),
  clarificationAnswer: z.string(),
  promptText: z.string().nullable().optional(),
  modelProvider: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  status: dialogClarificationStatusSchema,
  integratedAt: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDialogClarification = z.infer<typeof tDialogClarificationSchema>;

export const tDialogVisualizationSchema = z.object({
  visualizationId: z.string(),
  dialogId: z.string(),
  cellId: z.string(),
  anchor: tDialogCellAnchorSchema,
  parentVisualizationId: z.string().nullable().optional(),
  rootVisualizationId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  artifactType: visualizationArtifactTypeSchema,
  status: visualizationStatusSchema,
  storageMode: visualizationStorageModeSchema,
  canonicalSourceText: z.string(),
  canonicalSourceMimeType: z.string().nullable().optional(),
  compiledRenderText: z.string().nullable().optional(),
  compiledRenderMimeType: z.string(),
  compiledRenderStoragePath: z.string().nullable().optional(),
  sourcePrompt: z.string(),
  generationModel: z.string().nullable().optional(),
  generationMetadata: tVisualizationGenerationMetadataSchema.nullable().optional(),
  integrationState: visualizationIntegrationStateSchema,
  isLatestVersion: z.boolean(),
  versionNumber: z.number(),
  integratedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDialogVisualization = z.infer<typeof tDialogVisualizationSchema>;

export const tDialogWorkspaceSchema = z.object({
  dialog: tStudyDialogSchema,
  cells: z.array(tDialogCellSchema),
  imports: z.array(tDialogImportSchema),
  sourceMaps: z.array(tDialogSourceMapSchema),
  clarifications: z.array(tDialogClarificationSchema),
  visualizations: z.array(tDialogVisualizationSchema),
  executionRuns: z.array(tDialogExecutionRunSchema),
});

export type TDialogWorkspace = z.infer<typeof tDialogWorkspaceSchema>;

export const dialogTutorActionSchema = z.enum([
  'advance',
  'understood',
  'break_down',
  'stuck',
  'skip',
]);

export type TDialogTutorAction = z.infer<typeof dialogTutorActionSchema>;

export const tDialogTutorWorkspaceSchema = z.object({
  dialogId: z.string(),
  tutorState: tDialogTutorStateSchema.nullable(),
  nodes: z.array(tDialogPlanNodeSchema),
});

export type TDialogTutorWorkspace = z.infer<typeof tDialogTutorWorkspaceSchema>;

export const tDialogTutorActionResponseSchema = z.object({
  workspace: tDialogWorkspaceSchema,
  tutor: tDialogTutorWorkspaceSchema,
});

export type TDialogTutorActionResponse = z.infer<typeof tDialogTutorActionResponseSchema>;

export const learnerSurfaceSchema = z.enum(['dialog', 'document', 'chat']);
export const learnerKnowledgeCategorySchema = z.enum([
  'concept',
  'implementation',
  'bridge',
  'verification',
  'tooling',
  'math',
  'workflow',
]);
export const learnerKnowledgeStatusSchema = z.enum([
  'emerging',
  'practicing',
  'solid',
  'mastered',
]);

export const tLearnerSourceRefSchema = z.object({
  surface: learnerSurfaceSchema,
  sourceId: z.string(),
  label: z.string().nullable().optional(),
});

export type TLearnerSourceRef = z.infer<typeof tLearnerSourceRefSchema>;

export const tLearnerProfileSchema = z.object({
  profileId: z.string(),
  userId: z.string(),
  profileSummaryMarkdown: z.string().nullable().optional(),
  knowledgeLevelSummary: z.string(),
  learningPreferencesJson: DocumentType.nullable().optional(),
  currentFocusLabels: z.array(z.string()),
  lastUpdatedFromSurface: learnerSurfaceSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TLearnerProfile = z.infer<typeof tLearnerProfileSchema>;

export const tLearnerKnowledgeNodeSchema = z.object({
  learnerNodeId: z.string(),
  userId: z.string(),
  label: z.string(),
  normalizedLabel: z.string(),
  category: learnerKnowledgeCategorySchema,
  mastery: z.number(),
  confidence: z.number(),
  status: learnerKnowledgeStatusSchema,
  evidenceCount: z.number(),
  evidenceSummary: z.string().nullable().optional(),
  aliases: z.array(z.string()),
  sourceRefs: z.array(tLearnerSourceRefSchema),
  metadataJson: DocumentType.nullable().optional(),
  lastObservedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TLearnerKnowledgeNode = z.infer<typeof tLearnerKnowledgeNodeSchema>;

export const tLearnerKnowledgeEdgeSchema = z.object({
  learnerEdgeId: z.string(),
  userId: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  relation: z.string(),
  weight: z.number(),
  evidenceCount: z.number(),
  metadataJson: DocumentType.nullable().optional(),
  lastObservedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TLearnerKnowledgeEdge = z.infer<typeof tLearnerKnowledgeEdgeSchema>;

export const tLearnerEventSchema = z.object({
  eventId: z.string(),
  userId: z.string(),
  surface: learnerSurfaceSchema,
  eventType: z.string(),
  sourceId: z.string(),
  sourceTitle: z.string().nullable().optional(),
  summary: z.string(),
  payloadJson: DocumentType.nullable().optional(),
  appliedJson: DocumentType.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TLearnerEvent = z.infer<typeof tLearnerEventSchema>;

export const tLearnerWorkspaceSchema = z.object({
  profile: tLearnerProfileSchema,
  nodes: z.array(tLearnerKnowledgeNodeSchema),
  edges: z.array(tLearnerKnowledgeEdgeSchema),
  recentEvents: z.array(tLearnerEventSchema),
});

export type TLearnerWorkspace = z.infer<typeof tLearnerWorkspaceSchema>;

export const tDocumentRenderVersionSchema = z.object({
  renderVersionId: z.string(),
  documentId: z.string(),
  versionNumber: z.number(),
  documentIrJson: tDocumentIRSchema,
  renderHtml: z.string().nullable().optional(),
  outlineJson: z.array(tDocumentOutlineItemSchema),
  assetsJson: z.array(DocumentType).optional(),
  createdByUserId: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDocumentRenderVersion = z.infer<typeof tDocumentRenderVersionSchema>;

export const tDocumentOverlaySchema = z.object({
  overlayId: z.string(),
  documentId: z.string(),
  renderVersionId: z.string(),
  overlayVersionNumber: z.number(),
  overlayJson: z.object({
    integratedClarificationIds: z.array(z.string()),
    integratedVisualizationIds: z.array(z.string()),
  }),
  createdByUserId: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDocumentOverlay = z.infer<typeof tDocumentOverlaySchema>;

export const tDocumentClarificationSchema = z.object({
  clarificationId: z.string(),
  documentId: z.string(),
  renderVersionId: z.string(),
  overlayId: z.string().nullable().optional(),
  anchor: tDocumentAnchorSchema,
  clarificationQuestion: z.string(),
  clarificationAnswer: z.string(),
  promptText: z.string().nullable().optional(),
  modelProvider: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  status: documentClarificationStatusSchema,
  integratedAt: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDocumentClarification = z.infer<typeof tDocumentClarificationSchema>;

export const tDocumentVisualizationSchema = z.object({
  visualizationId: z.string(),
  documentId: z.string(),
  renderVersionId: z.string(),
  overlayId: z.string().nullable().optional(),
  anchor: tDocumentAnchorSchema,
  parentVisualizationId: z.string().nullable().optional(),
  rootVisualizationId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  artifactType: visualizationArtifactTypeSchema,
  status: visualizationStatusSchema,
  storageMode: visualizationStorageModeSchema,
  canonicalSourceText: z.string(),
  canonicalSourceMimeType: z.string().nullable().optional(),
  compiledRenderText: z.string().nullable().optional(),
  compiledRenderMimeType: z.string(),
  compiledRenderStoragePath: z.string().nullable().optional(),
  sourcePrompt: z.string(),
  generationModel: z.string().nullable().optional(),
  generationMetadata: tVisualizationGenerationMetadataSchema.nullable().optional(),
  integrationState: visualizationIntegrationStateSchema,
  isLatestVersion: z.boolean(),
  versionNumber: z.number(),
  integratedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TDocumentVisualization = z.infer<typeof tDocumentVisualizationSchema>;

export const tDocumentSpeechProfileSchema = z.object({
  provider: z.string(),
  model: z.string(),
  voice: z.string(),
  language: z.string().nullable().optional(),
  format: z.string(),
  rate: z.number().nullable().optional(),
});

export type TDocumentSpeechProfile = z.infer<typeof tDocumentSpeechProfileSchema>;

export const tDocumentSpeechProfileInputSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  voice: z.string().optional(),
  language: z.string().nullable().optional(),
  format: z.string().optional(),
  rate: z.number().nullable().optional(),
});

export type TDocumentSpeechProfileInput = z.infer<typeof tDocumentSpeechProfileInputSchema>;

export const tDocumentSpeechAlignmentSchema = z.object({
  char_start_times_ms: z.array(z.number()),
  chars_durations_ms: z.array(z.number()),
  chars: z.array(z.string()),
});

export type TDocumentSpeechAlignment = z.infer<typeof tDocumentSpeechAlignmentSchema>;

export const tDocumentSpeechAudioArtifactSchema = z.object({
  audioArtifactId: z.string(),
  segmentId: z.string(),
  documentId: z.string(),
  renderVersionId: z.string(),
  speechProfile: tDocumentSpeechProfileSchema,
  audioCacheKey: z.string(),
  fileId: z.string().nullable().optional(),
  mimeType: z.string(),
  durationMs: z.number().nullable().optional(),
  alignment: tDocumentSpeechAlignmentSchema.nullable().optional(),
  audioUrl: z.string().nullable().optional(),
  status: documentSpeechAudioStatusSchema,
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type TDocumentSpeechAudioArtifact = z.infer<typeof tDocumentSpeechAudioArtifactSchema>;

export const tDocumentSpeechSegmentSchema = z.object({
  segmentId: z.string(),
  planId: z.string(),
  documentId: z.string(),
  renderVersionId: z.string(),
  blockId: z.string(),
  charStart: z.number().nullable().optional(),
  charEnd: z.number().nullable().optional(),
  segmentIndex: z.number(),
  segmentKind: documentSpeechSegmentKindSchema,
  sourceText: z.string(),
  sourceContextBefore: z.string(),
  sourceContextAfter: z.string(),
  sourceFingerprint: z.string(),
  spokenText: z.string(),
  spokenFingerprint: z.string(),
  playbackDirective: documentSpeechPlaybackDirectiveSchema,
  focusBlockId: z.string().nullable().optional(),
  resumeToken: z.string().nullable().optional(),
  warnings: z.array(z.string()),
  narrationModel: z.string().nullable().optional(),
  audio: tDocumentSpeechAudioArtifactSchema.nullable().optional(),
});

export type TDocumentSpeechSegment = z.infer<typeof tDocumentSpeechSegmentSchema>;

export const tDocumentSpeechManifestSchema = z.object({
  planId: z.string(),
  documentId: z.string(),
  renderVersionId: z.string(),
  speechSurfaceFingerprint: z.string(),
  narrationPolicyVersion: z.string(),
  resolvedProfile: tDocumentSpeechProfileSchema,
  segments: z.array(tDocumentSpeechSegmentSchema),
  startSegmentId: z.string().nullable().optional(),
  nextPrefetchSegmentIds: z.array(z.string()),
});

export type TDocumentSpeechManifest = z.infer<typeof tDocumentSpeechManifestSchema>;

export const tDocumentWorkspaceSchema = z.object({
  document: tStudyDocumentSchema,
  renderVersion: tDocumentRenderVersionSchema,
  overlay: tDocumentOverlaySchema.nullable(),
  clarifications: z.array(tDocumentClarificationSchema),
  visualizations: z.array(tDocumentVisualizationSchema),
});

export type TDocumentWorkspace = z.infer<typeof tDocumentWorkspaceSchema>;

export const tMessageRevisionSchema = z.object({
  revisionId: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  projectId: z.string().nullable().optional(),
  createdByUserId: z.string(),
  reason: z.string(),
  previousText: z.string(),
  updatedText: z.string(),
  metadata: DocumentType.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TMessageRevision = z.infer<typeof tMessageRevisionSchema>;

export const tSharedLinkSchema = z.object({
  conversationId: z.string(),
  shareId: z.string(),
  messages: z.array(z.string()),
  isPublic: z.boolean(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TSharedLink = z.infer<typeof tSharedLinkSchema>;

export const tConversationTagSchema = z.object({
  _id: z.string(),
  user: z.string(),
  tag: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  count: z.number(),
  position: z.number(),
});
export type TConversationTag = z.infer<typeof tConversationTagSchema>;

export const googleBaseSchema = tConversationSchema.pick({
  projectId: true,
  model: true,
  modelLabel: true,
  promptPrefix: true,
  examples: true,
  temperature: true,
  maxOutputTokens: true,
  artifacts: true,
  topP: true,
  topK: true,
  thinking: true,
  thinkingBudget: true,
  thinkingLevel: true,
  web_search: true,
  fileTokenLimit: true,
  iconURL: true,
  greeting: true,
  spec: true,
  maxContextTokens: true,
});

export const googleSchema = googleBaseSchema
  .transform((obj: Partial<TConversation>) => removeNullishValues(obj, true))
  .catch(() => ({}));

/**
   * TODO: Map the following fields:
  - presence_penalty -> presencePenalty
  - frequency_penalty -> frequencyPenalty
  - stop -> stopSequences
   */
export const googleGenConfigSchema = z
  .object({
    maxOutputTokens: coerceNumber.optional(),
    temperature: coerceNumber.optional(),
    topP: coerceNumber.optional(),
    topK: coerceNumber.optional(),
    presencePenalty: coerceNumber.optional(),
    frequencyPenalty: coerceNumber.optional(),
    stopSequences: z.array(z.string()).optional(),
    thinkingConfig: z
      .object({
        includeThoughts: z.boolean().optional(),
        thinkingBudget: coerceNumber.optional(),
        thinkingLevel: z.string().optional(),
      })
      .optional(),
    web_search: z.boolean().optional(),
  })
  .strip()
  .optional();

export function removeNullishValues<T extends Record<string, unknown>>(
  obj: T,
  removeEmptyStrings?: boolean,
): Partial<T> {
  const newObj: Partial<T> = { ...obj };

  (Object.keys(newObj) as Array<keyof T>).forEach((key) => {
    const value = newObj[key];
    if (value === undefined || value === null) {
      delete newObj[key];
    }
    if (removeEmptyStrings && typeof value === 'string' && value === '') {
      delete newObj[key];
    }
  });

  return newObj;
}

const assistantBaseSchema = tConversationSchema.pick({
  projectId: true,
  model: true,
  assistant_id: true,
  instructions: true,
  artifacts: true,
  promptPrefix: true,
  iconURL: true,
  greeting: true,
  spec: true,
  append_current_datetime: true,
});

export const assistantSchema = assistantBaseSchema
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? openAISettings.model.default,
    assistant_id: obj.assistant_id ?? undefined,
    instructions: obj.instructions ?? undefined,
    promptPrefix: obj.promptPrefix ?? null,
    iconURL: obj.iconURL ?? undefined,
    greeting: obj.greeting ?? undefined,
    spec: obj.spec ?? undefined,
    append_current_datetime: obj.append_current_datetime ?? false,
  }))
  .catch(() => ({
    model: openAISettings.model.default,
    assistant_id: undefined,
    instructions: undefined,
    promptPrefix: null,
    iconURL: undefined,
    greeting: undefined,
    spec: undefined,
    append_current_datetime: false,
  }));

const compactAssistantBaseSchema = tConversationSchema.pick({
  projectId: true,
  model: true,
  assistant_id: true,
  instructions: true,
  promptPrefix: true,
  artifacts: true,
  iconURL: true,
  greeting: true,
  spec: true,
});

export const compactAssistantSchema = compactAssistantBaseSchema
  .transform((obj) => removeNullishValues(obj))
  .catch(() => ({}));

export const agentsBaseSchema = tConversationSchema.pick({
  projectId: true,
  model: true,
  modelLabel: true,
  temperature: true,
  top_p: true,
  presence_penalty: true,
  frequency_penalty: true,
  resendFiles: true,
  imageDetail: true,
  agent_id: true,
  instructions: true,
  promptPrefix: true,
  iconURL: true,
  greeting: true,
  maxContextTokens: true,
});

export const agentsSchema = agentsBaseSchema
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? agentsSettings.model.default,
    modelLabel: obj.modelLabel ?? null,
    temperature: obj.temperature ?? 1,
    top_p: obj.top_p ?? 1,
    presence_penalty: obj.presence_penalty ?? 0,
    frequency_penalty: obj.frequency_penalty ?? 0,
    resendFiles:
      typeof obj.resendFiles === 'boolean' ? obj.resendFiles : agentsSettings.resendFiles.default,
    imageDetail: obj.imageDetail ?? ImageDetail.auto,
    agent_id: obj.agent_id ?? undefined,
    instructions: obj.instructions ?? undefined,
    promptPrefix: obj.promptPrefix ?? null,
    iconURL: obj.iconURL ?? undefined,
    greeting: obj.greeting ?? undefined,
    maxContextTokens: obj.maxContextTokens ?? undefined,
  }))
  .catch(() => ({
    model: agentsSettings.model.default,
    modelLabel: null,
    temperature: 1,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    resendFiles: agentsSettings.resendFiles.default,
    imageDetail: ImageDetail.auto,
    agent_id: undefined,
    instructions: undefined,
    promptPrefix: null,
    iconURL: undefined,
    greeting: undefined,
    maxContextTokens: undefined,
  }));

export const openAIBaseSchema = tConversationSchema.pick({
  projectId: true,
  model: true,
  modelLabel: true,
  chatGptLabel: true,
  promptPrefix: true,
  temperature: true,
  top_p: true,
  presence_penalty: true,
  frequency_penalty: true,
  resendFiles: true,
  artifacts: true,
  imageDetail: true,
  stop: true,
  iconURL: true,
  greeting: true,
  spec: true,
  maxContextTokens: true,
  max_tokens: true,
  reasoning_effort: true,
  reasoning_summary: true,
  verbosity: true,
  useResponsesApi: true,
  web_search: true,
  disableStreaming: true,
  fileTokenLimit: true,
});

export const openAISchema = openAIBaseSchema
  .transform((obj: Partial<TConversation>) => removeNullishValues(obj, true))
  .catch(() => ({}));

export const compactGoogleSchema = googleBaseSchema
  .transform((obj) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.temperature === google.temperature.default) {
      delete newObj.temperature;
    }
    if (newObj.maxOutputTokens === google.maxOutputTokens.default) {
      delete newObj.maxOutputTokens;
    }
    if (newObj.topP === google.topP.default) {
      delete newObj.topP;
    }
    if (newObj.topK === google.topK.default) {
      delete newObj.topK;
    }

    return removeNullishValues(newObj, true);
  })
  .catch(() => ({}));

export const anthropicBaseSchema = tConversationSchema.pick({
  projectId: true,
  model: true,
  modelLabel: true,
  promptPrefix: true,
  temperature: true,
  maxOutputTokens: true,
  topP: true,
  topK: true,
  resendFiles: true,
  promptCache: true,
  thinking: true,
  thinkingBudget: true,
  effort: true,
  artifacts: true,
  iconURL: true,
  greeting: true,
  spec: true,
  maxContextTokens: true,
  web_search: true,
  fileTokenLimit: true,
  stop: true,
  stream: true,
});

export const anthropicSchema = anthropicBaseSchema
  .transform((obj) => removeNullishValues(obj))
  .catch(() => ({}));

export const tBannerSchema = z.object({
  bannerId: z.string(),
  message: z.string(),
  displayFrom: z.string(),
  displayTo: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPublic: z.boolean(),
  persistable: z.boolean().default(false),
});
export type TBanner = z.infer<typeof tBannerSchema>;

export const compactAgentsBaseSchema = tConversationSchema.pick({
  projectId: true,
  spec: true,
  // model: true,
  iconURL: true,
  greeting: true,
  agent_id: true,
  instructions: true,
  additional_instructions: true,
});

export const compactAgentsSchema = compactAgentsBaseSchema
  .transform((obj) => removeNullishValues(obj))
  .catch(() => ({}));
