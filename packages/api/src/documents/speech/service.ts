import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import axios from 'axios';
import OpenAI from 'openai';
import { Types } from 'mongoose';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type {
  AllMethods,
  AppConfig,
  IDocumentRenderVersion,
  IDocumentSpeechAudioArtifact,
  IDocumentSpeechProfile,
  IDocumentSpeechSegment,
  IMongoFile,
  IStudyDocument,
} from '@librechat/data-schemas';
import { extractEnvVariable, TTSProviders } from 'librechat-data-provider';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getConfiguredOpenAIBaseURL } from '~/files/native';
import { genAzureEndpoint } from '~/utils/azure';
import {
  buildDocumentSpeechPlan,
  DEFAULT_PREFETCH_SEGMENT_COUNT,
  NARRATION_POLICY_VERSION,
} from './planner';
import { getDocumentSpeechFileExtension, persistDocumentSpeechAudio } from './storage';

type DocumentSpeechManifestPayload = {
  renderVersionId: string;
  startBlockId?: string | null;
  profile?: Partial<IDocumentSpeechProfile>;
};

type DocumentSpeechAudioPayload = {
  segmentId: string;
  profile?: Partial<IDocumentSpeechProfile>;
};

type DocumentSpeechManifestSegment = IDocumentSpeechSegment & {
  audio: {
    audioArtifactId: string;
    segmentId: string;
    documentId: string;
    renderVersionId: string;
    speechProfile: IDocumentSpeechProfile;
    audioCacheKey: string;
    fileId?: string | null;
    mimeType: string;
    durationMs?: number | null;
    alignment?: IDocumentSpeechAudioArtifact['alignmentJson'] | null;
    audioUrl: string | null;
    status: IDocumentSpeechAudioArtifact['status'];
    errorMessage?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  };
};

type DocumentSpeechManifest = {
  planId: string;
  documentId: string;
  renderVersionId: string;
  speechSurfaceFingerprint: string;
  narrationPolicyVersion: string;
  resolvedProfile: IDocumentSpeechProfile;
  segments: DocumentSpeechManifestSegment[];
  startSegmentId: string | null;
  nextPrefetchSegmentIds: string[];
};

type AudioPayload = {
  filePath: string;
  mimeType: string;
  filename: string;
};

type TTSOpenAIConfig = {
  url?: string;
  apiKey: string;
  model: string;
  voices: string[];
};

type TTSAzureConfig = {
  instanceName: string;
  apiKey: string;
  deploymentName: string;
  apiVersion: string;
  model: string;
  voices: string[];
};

type TTSElevenLabsConfig = {
  url?: string;
  apiKey: string;
  model: string;
  voices: string[];
  voice_settings?: {
    similarity_boost?: number;
    stability?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  pronunciation_dictionary_locators?: string[];
};

type TTSLocalAIConfig = {
  url: string;
  apiKey?: string;
  voices: string[];
  backend: string;
};

type TTSConfigMap = NonNullable<NonNullable<AppConfig['speech']>['tts']>;

const DEFAULT_DOCUMENT_TTS_FORMAT = 'audio/mpeg';
const DEFAULT_DOCUMENT_TTS_MODEL = 'gpt-4o-mini';

export interface DocumentSpeechServiceDeps {
  getStudyDocument: AllMethods['getStudyDocument'];
  getDocumentRenderVersion: AllMethods['getDocumentRenderVersion'];
  getDocumentSpeechPlan: AllMethods['getDocumentSpeechPlan'];
  upsertDocumentSpeechPlan: AllMethods['upsertDocumentSpeechPlan'];
  listDocumentSpeechSegments: AllMethods['listDocumentSpeechSegments'];
  upsertDocumentSpeechSegments: AllMethods['upsertDocumentSpeechSegments'];
  getDocumentSpeechSegment: AllMethods['getDocumentSpeechSegment'];
  listDocumentSpeechAudioArtifacts: AllMethods['listDocumentSpeechAudioArtifacts'];
  getDocumentSpeechAudioArtifact: AllMethods['getDocumentSpeechAudioArtifact'];
  upsertDocumentSpeechAudioArtifact: AllMethods['upsertDocumentSpeechAudioArtifact'];
  createFile: AllMethods['createFile'];
  findFileById: AllMethods['findFileById'];
}

function hashValue(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function getNarrationPreferredModel(): string {
  return (
    process.env.DOCUMENT_TTS_NARRATION_MODEL ||
    process.env.INLINE_CLARIFICATION_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_DOCUMENT_TTS_MODEL
  );
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({
    apiKey,
    baseURL: getConfiguredOpenAIBaseURL(),
  });
}

function getModelCandidates(preferredModel?: string | null): string[] {
  return [preferredModel, DEFAULT_DOCUMENT_TTS_MODEL].filter(
    (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
  );
}

async function resolveNarrationModel(
  client: OpenAI | null,
  preferredModel?: string | null,
): Promise<string> {
  const candidates = getModelCandidates(preferredModel);
  if (!client || !getConfiguredOpenAIBaseURL()) {
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

function resolveConfiguredProvider(
  appConfig?: AppConfig,
  requestedProvider?: string | null,
): {
  provider: keyof TTSConfigMap;
  config: TTSOpenAIConfig | TTSAzureConfig | TTSElevenLabsConfig | TTSLocalAIConfig;
} {
  const ttsConfig = appConfig?.speech?.tts;
  if (!ttsConfig) {
    throw new Error('Document TTS requires a configured speech.tts provider');
  }

  const providers = (Object.entries(ttsConfig) as Array<
    [keyof TTSConfigMap, TTSConfigMap[keyof TTSConfigMap]]
  >).filter(([, value]) => value && Object.keys(value).length > 0);

  if (requestedProvider) {
    const matchingProvider = providers.find(([provider]) => provider === requestedProvider);
    if (!matchingProvider) {
      throw new Error(`Document TTS provider "${requestedProvider}" is not configured`);
    }

    return {
      provider: matchingProvider[0],
      config: matchingProvider[1] as
        | TTSOpenAIConfig
        | TTSAzureConfig
        | TTSElevenLabsConfig
        | TTSLocalAIConfig,
    };
  }

  if (providers.length !== 1) {
    throw new Error(
      providers.length > 1
        ? 'Document TTS requires exactly one configured TTS provider'
        : 'Document TTS requires a configured TTS provider',
    );
  }

  return {
    provider: providers[0][0],
    config: providers[0][1] as TTSOpenAIConfig | TTSAzureConfig | TTSElevenLabsConfig | TTSLocalAIConfig,
  };
}

function resolveVoice(voices: string[] | undefined, requestedVoice?: string | null): string {
  const validVoices = (voices ?? []).filter((voice) => voice && voice.toUpperCase() !== 'ALL');
  if (requestedVoice && validVoices.includes(requestedVoice)) {
    return requestedVoice;
  }

  if (validVoices.length > 0) {
    return validVoices[0];
  }

  if (requestedVoice) {
    return requestedVoice;
  }

  throw new Error('Document TTS requires at least one configured voice');
}

function resolveSpeechProfile(
  appConfig: AppConfig | undefined,
  input?: Partial<IDocumentSpeechProfile>,
): IDocumentSpeechProfile {
  const { provider, config } = resolveConfiguredProvider(appConfig, input?.provider);
  const model =
    input?.model ??
    (provider === TTSProviders.LOCALAI
      ? (config as TTSLocalAIConfig).backend
      : extractEnvVariable(
          (config as TTSOpenAIConfig | TTSAzureConfig | TTSElevenLabsConfig).model,
        ));

  return {
    provider,
    model,
    voice: resolveVoice(config.voices, input?.voice),
    language: input?.language ?? null,
    format: input?.format ?? DEFAULT_DOCUMENT_TTS_FORMAT,
    rate: input?.rate ?? null,
  };
}

function buildAudioCacheKey(spokenFingerprint: string, profile: IDocumentSpeechProfile): string {
  return hashValue(
    JSON.stringify({
      spokenFingerprint,
      provider: profile.provider,
      model: profile.model,
      voice: profile.voice,
      language: profile.language ?? null,
      format: profile.format,
      rate: profile.rate ?? null,
    }),
  );
}

function buildAudioArtifactId(audioCacheKey: string): string {
  return hashValue(`document_speech_audio:${audioCacheKey}`);
}

function buildAudioUrl(documentId: string, audioArtifactId: string): string {
  return `/api/documents/${encodeURIComponent(documentId)}/speech/audio/${encodeURIComponent(audioArtifactId)}`;
}

async function fileExists(filePath: string | undefined | null): Promise<boolean> {
  if (!filePath) {
    return false;
  }

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toManifestAudioState(
  documentId: string,
  segment: IDocumentSpeechSegment,
  profile: IDocumentSpeechProfile,
  artifact?: IDocumentSpeechAudioArtifact | null,
) {
  if (segment.playbackDirective === 'pause_for_visual') {
    return {
      audioArtifactId: buildAudioArtifactId(`not_required:${segment.segmentId}`),
      segmentId: segment.segmentId,
      documentId,
      renderVersionId: segment.renderVersionId,
      speechProfile: profile,
      audioCacheKey: '',
      fileId: null,
      mimeType: profile.format,
      durationMs: null,
      alignment: null,
      audioUrl: null,
      status: 'not_required' as const,
      errorMessage: null,
    };
  }

  if (!artifact) {
    return {
      audioArtifactId: buildAudioArtifactId(`${segment.segmentId}:${segment.spokenFingerprint}`),
      segmentId: segment.segmentId,
      documentId,
      renderVersionId: segment.renderVersionId,
      speechProfile: profile,
      audioCacheKey: buildAudioCacheKey(segment.spokenFingerprint, profile),
      fileId: null,
      mimeType: profile.format,
      durationMs: null,
      alignment: null,
      audioUrl: null,
      status: 'pending' as const,
      errorMessage: null,
    };
  }

  return {
    audioArtifactId: artifact.audioArtifactId,
    segmentId: artifact.segmentId,
    documentId: artifact.documentId,
    renderVersionId: artifact.renderVersionId,
    speechProfile: artifact.speechProfile,
    audioCacheKey: artifact.audioCacheKey,
    fileId: artifact.fileId ?? null,
    mimeType: artifact.mimeType,
    durationMs: artifact.durationMs ?? null,
    alignment: artifact.alignmentJson ?? null,
    audioUrl:
      artifact.status === 'ready' && artifact.fileId
        ? buildAudioUrl(documentId, artifact.audioArtifactId)
        : null,
    status: artifact.status,
    errorMessage: artifact.errorMessage ?? null,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

async function ensureDocumentAndRenderVersion(
  deps: DocumentSpeechServiceDeps,
  userId: string,
  documentId: string,
  renderVersionId: string,
): Promise<{ document: IStudyDocument; renderVersion: IDocumentRenderVersion }> {
  const [document, renderVersion] = await Promise.all([
    deps.getStudyDocument(userId, documentId),
    deps.getDocumentRenderVersion(userId, renderVersionId),
  ]);

  if (!document) {
    throw new Error('Document not found');
  }

  if (!renderVersion || renderVersion.documentId !== documentId) {
    throw new Error('Document render version not found');
  }

  return {
    document,
    renderVersion,
  };
}

async function loadOrCreatePlan(
  deps: DocumentSpeechServiceDeps,
  userId: string,
  document: IStudyDocument,
  renderVersion: IDocumentRenderVersion,
): Promise<Awaited<ReturnType<typeof buildDocumentSpeechPlan>>> {
  const narrationClient = getOpenAIClient();
  const narrationModel = await resolveNarrationModel(
    narrationClient,
    getNarrationPreferredModel(),
  );
  const runNarrationModel = async (messages: ChatCompletionMessageParam[]) => {
    if (!narrationClient) {
      throw new Error('OPENAI_API_KEY is not configured for document speech narration');
    }

    const completion = await narrationClient.chat.completions.create({
      model: narrationModel,
      messages,
      temperature: 0.2,
    });

    return completion.choices[0]?.message?.content ?? '';
  };

  const builtPlan = await buildDocumentSpeechPlan({
    document,
    renderVersion,
    narrationModel,
    runNarrationModel,
  });

  const existingPlan = await deps.getDocumentSpeechPlan(userId, {
    documentId: document.documentId,
    renderVersionId: renderVersion.renderVersionId,
    speechSurfaceFingerprint: builtPlan.speechSurfaceFingerprint,
    narrationPolicyVersion: NARRATION_POLICY_VERSION,
  });
  const existingSegments = existingPlan
    ? await deps.listDocumentSpeechSegments(userId, { planId: existingPlan.planId })
    : [];

  if (existingPlan && existingSegments.length === builtPlan.segments.length) {
    return {
      ...builtPlan,
      planId: existingPlan.planId,
      segments: existingSegments.map((segment: IDocumentSpeechSegment) => ({
        ...segment,
        planId: existingPlan.planId,
      })),
    };
  }

  const storedPlan = await deps.upsertDocumentSpeechPlan(userId, {
    planId: builtPlan.planId,
    documentId: document.documentId,
    renderVersionId: renderVersion.renderVersionId,
    speechSurfaceFingerprint: builtPlan.speechSurfaceFingerprint,
    narrationPolicyVersion: builtPlan.narrationPolicyVersion,
    segmentIds: builtPlan.segments.map((segment) => segment.segmentId),
    sourceBlocksJson: builtPlan.sourceBlocksJson,
  });

  const storedSegments = await deps.upsertDocumentSpeechSegments(
    userId,
    builtPlan.segments.map((segment) => ({
      segmentId: segment.segmentId,
      planId: storedPlan.planId,
      documentId: segment.documentId,
      renderVersionId: segment.renderVersionId,
      blockId: segment.blockId,
      charStart: segment.charStart,
      charEnd: segment.charEnd,
      segmentIndex: segment.segmentIndex,
      segmentKind: segment.segmentKind,
      sourceText: segment.sourceText,
      sourceContextBefore: segment.sourceContextBefore,
      sourceContextAfter: segment.sourceContextAfter,
      sourceFingerprint: segment.sourceFingerprint,
      spokenText: segment.spokenText,
      spokenFingerprint: segment.spokenFingerprint,
      playbackDirective: segment.playbackDirective,
      focusBlockId: segment.focusBlockId,
      resumeToken: segment.resumeToken,
      warnings: segment.warnings,
      narrationModel: segment.narrationModel,
    })),
  );

  return {
    ...builtPlan,
    planId: storedPlan.planId,
    segments: storedSegments,
  };
}

function resolveStartSegmentId(
  segments: IDocumentSpeechSegment[],
  startBlockId?: string | null,
): string | null {
  if (segments.length === 0) {
    return null;
  }

  if (startBlockId) {
    const exact = segments.find(
      (segment) => segment.blockId === startBlockId && segment.playbackDirective !== 'pause_for_visual',
    );
    if (exact) {
      return exact.segmentId;
    }
  }

  return segments.find((segment) => segment.playbackDirective !== 'pause_for_visual')?.segmentId ?? null;
}

function resolveNextPrefetchSegmentIds(
  segments: IDocumentSpeechSegment[],
  startSegmentId: string | null,
): string[] {
  if (!startSegmentId) {
    return [];
  }

  const startIndex = segments.findIndex((segment) => segment.segmentId === startSegmentId);
  if (startIndex < 0) {
    return [];
  }

  return segments
    .slice(startIndex + 1)
    .filter((segment) => segment.playbackDirective !== 'pause_for_visual')
    .slice(0, DEFAULT_PREFETCH_SEGMENT_COUNT)
    .map((segment) => segment.segmentId);
}

async function synthesizeSpeech(
  appConfig: AppConfig | undefined,
  profile: IDocumentSpeechProfile,
  input: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { provider, config } = resolveConfiguredProvider(appConfig, profile.provider);
  const commonOptions: {
    headers: Record<string, string>;
    responseType: 'arraybuffer';
    httpsAgent?: HttpsProxyAgent<string>;
  } = {
    headers: {} as Record<string, string>,
    responseType: 'arraybuffer' as const,
  };

  if (process.env.PROXY) {
    commonOptions.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  if (provider === TTSProviders.OPENAI) {
    const providerConfig = config as TTSOpenAIConfig;
    const response = await axios.post(
      providerConfig.url || 'https://api.openai.com/v1/audio/speech',
      {
        input,
        model: extractEnvVariable(providerConfig.model),
        voice: profile.voice,
        ...(profile.rate != null && profile.rate !== 1 ? { speed: profile.rate } : {}),
      },
      {
        ...commonOptions,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${extractEnvVariable(providerConfig.apiKey)}`,
        },
      },
    );

    return {
      buffer: Buffer.from(response.data),
      mimeType: String(response.headers['content-type'] || DEFAULT_DOCUMENT_TTS_FORMAT),
    };
  }

  if (provider === TTSProviders.AZURE_OPENAI) {
    const providerConfig = config as TTSAzureConfig;
    const response = await axios.post(
      `${genAzureEndpoint({
        azureOpenAIApiInstanceName: extractEnvVariable(providerConfig.instanceName),
        azureOpenAIApiDeploymentName: extractEnvVariable(providerConfig.deploymentName),
      })}/audio/speech?api-version=${extractEnvVariable(providerConfig.apiVersion)}`,
      {
        model: extractEnvVariable(providerConfig.model),
        input,
        voice: profile.voice,
        ...(profile.rate != null && profile.rate !== 1 ? { speed: profile.rate } : {}),
      },
      {
        ...commonOptions,
        headers: {
          'Content-Type': 'application/json',
          'api-key': extractEnvVariable(providerConfig.apiKey),
        },
      },
    );

    return {
      buffer: Buffer.from(response.data),
      mimeType: String(response.headers['content-type'] || DEFAULT_DOCUMENT_TTS_FORMAT),
    };
  }

  if (provider === TTSProviders.ELEVENLABS) {
    const providerConfig = config as TTSElevenLabsConfig;
    const response = await axios.post(
      providerConfig.url || `https://api.elevenlabs.io/v1/text-to-speech/${profile.voice}`,
      {
        model_id: extractEnvVariable(providerConfig.model),
        text: input,
        voice_settings: providerConfig.voice_settings,
        pronunciation_dictionary_locators: providerConfig.pronunciation_dictionary_locators,
      },
      {
        ...commonOptions,
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': extractEnvVariable(providerConfig.apiKey),
          Accept: profile.format,
        },
      },
    );

    return {
      buffer: Buffer.from(response.data),
      mimeType: String(response.headers['content-type'] || DEFAULT_DOCUMENT_TTS_FORMAT),
    };
  }

  if (provider === TTSProviders.LOCALAI) {
    const providerConfig = config as TTSLocalAIConfig;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (providerConfig.apiKey) {
      headers.Authorization = `Bearer ${extractEnvVariable(providerConfig.apiKey)}`;
    }

    const response = await axios.post(
      providerConfig.url,
      {
        input,
        model: profile.voice,
        backend: providerConfig.backend,
      },
      {
        ...commonOptions,
        headers,
      },
    );

    return {
      buffer: Buffer.from(response.data),
      mimeType: String(response.headers['content-type'] || DEFAULT_DOCUMENT_TTS_FORMAT),
    };
  }

  throw new Error(`Unsupported document TTS provider: ${provider}`);
}

function serializeArtifactResponse(
  documentId: string,
  artifact: IDocumentSpeechAudioArtifact,
): DocumentSpeechManifestSegment['audio'] {
  return {
    audioArtifactId: artifact.audioArtifactId,
    segmentId: artifact.segmentId,
    documentId: artifact.documentId,
    renderVersionId: artifact.renderVersionId,
    speechProfile: artifact.speechProfile,
    audioCacheKey: artifact.audioCacheKey,
    fileId: artifact.fileId ?? null,
    mimeType: artifact.mimeType,
    durationMs: artifact.durationMs ?? null,
    alignment: artifact.alignmentJson ?? null,
    audioUrl:
      artifact.status === 'ready' && artifact.fileId
        ? buildAudioUrl(documentId, artifact.audioArtifactId)
        : null,
    status: artifact.status,
    errorMessage: artifact.errorMessage ?? null,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

export async function getOrCreateDocumentSpeechManifest(
  deps: DocumentSpeechServiceDeps,
  userId: string,
  documentId: string,
  payload: DocumentSpeechManifestPayload,
  options?: { appConfig?: AppConfig },
): Promise<DocumentSpeechManifest> {
  const { document, renderVersion } = await ensureDocumentAndRenderVersion(
    deps,
    userId,
    documentId,
    payload.renderVersionId,
  );
  const plan = await loadOrCreatePlan(deps, userId, document, renderVersion);
  const profile = resolveSpeechProfile(options?.appConfig, payload.profile);
  const audioCacheKeys = plan.segments.map((segment) => buildAudioCacheKey(segment.spokenFingerprint, profile));
  const audioArtifacts = await deps.listDocumentSpeechAudioArtifacts(userId, {
    audioCacheKeys,
    documentId,
  });
  const artifactByKey = new Map(
    audioArtifacts.map((artifact: IDocumentSpeechAudioArtifact) => [
      artifact.audioCacheKey,
      artifact,
    ]),
  );
  const segments = plan.segments
    .slice()
    .sort((left, right) => left.segmentIndex - right.segmentIndex)
    .map((segment) => ({
      ...segment,
      audio: toManifestAudioState(
        documentId,
        segment,
        profile,
        artifactByKey.get(buildAudioCacheKey(segment.spokenFingerprint, profile)) ?? null,
      ),
    }));
  const startSegmentId = resolveStartSegmentId(plan.segments, payload.startBlockId);

  return {
    planId: plan.planId,
    documentId,
    renderVersionId: renderVersion.renderVersionId,
    speechSurfaceFingerprint: plan.speechSurfaceFingerprint,
    narrationPolicyVersion: plan.narrationPolicyVersion,
    resolvedProfile: profile,
    segments,
    startSegmentId,
    nextPrefetchSegmentIds: resolveNextPrefetchSegmentIds(plan.segments, startSegmentId),
  };
}

export async function getOrCreateDocumentSpeechAudioArtifact(
  deps: DocumentSpeechServiceDeps,
  userId: string,
  documentId: string,
  payload: DocumentSpeechAudioPayload,
  options?: { appConfig?: AppConfig },
): Promise<DocumentSpeechManifestSegment['audio']> {
  const segment = await deps.getDocumentSpeechSegment(userId, payload.segmentId);
  if (!segment || segment.documentId !== documentId) {
    throw new Error('Document speech segment not found');
  }

  const profile = resolveSpeechProfile(options?.appConfig, payload.profile);
  if (segment.playbackDirective === 'pause_for_visual') {
    return toManifestAudioState(documentId, segment, profile, null);
  }

  const audioCacheKey = buildAudioCacheKey(segment.spokenFingerprint, profile);
  const existingArtifact = await deps.getDocumentSpeechAudioArtifact(userId, { audioCacheKey });

  if (existingArtifact?.status === 'ready' && existingArtifact.fileId) {
    const existingFile = await deps.findFileById(existingArtifact.fileId, { user: userId });
    if (existingFile?.filepath && (await fileExists(existingFile.filepath))) {
      return serializeArtifactResponse(documentId, existingArtifact);
    }
  }

  const audioArtifactId = buildAudioArtifactId(audioCacheKey);
  await deps.upsertDocumentSpeechAudioArtifact(userId, {
    audioArtifactId,
    segmentId: segment.segmentId,
    documentId,
    renderVersionId: segment.renderVersionId,
    speechProfile: profile,
    audioCacheKey,
    fileId: existingArtifact?.fileId ?? null,
    mimeType: profile.format,
    durationMs: existingArtifact?.durationMs ?? null,
    alignmentJson: existingArtifact?.alignmentJson ?? null,
    waveformJson: existingArtifact?.waveformJson,
    status: 'pending',
    errorMessage: null,
  });

  try {
    const synthesized = await synthesizeSpeech(options?.appConfig, profile, segment.spokenText);
    const persistedAudio = await persistDocumentSpeechAudio(
      options?.appConfig,
      userId,
      audioArtifactId,
      synthesized.mimeType,
      synthesized.buffer,
    );
    const fileId = existingArtifact?.fileId ?? hashValue(`document_speech_file:${audioArtifactId}`);
    await deps.createFile(
      {
        user: new Types.ObjectId(userId) as IMongoFile['user'],
        file_id: fileId,
        filename: `${audioArtifactId}.${getDocumentSpeechFileExtension(persistedAudio.mimeType)}`,
        filepath: persistedAudio.filePath,
        type: persistedAudio.mimeType,
        bytes: persistedAudio.bytes,
        source: 'document_tts',
        metadata: {
          documentSpeech: {
            audioArtifactId,
            segmentId: segment.segmentId,
            audioCacheKey,
            mimeType: persistedAudio.mimeType,
            alignmentAvailable: false,
            waveformAvailable: false,
          },
        },
      },
      true,
    );
    const artifact = await deps.upsertDocumentSpeechAudioArtifact(userId, {
      audioArtifactId,
      segmentId: segment.segmentId,
      documentId,
      renderVersionId: segment.renderVersionId,
      speechProfile: profile,
      audioCacheKey,
      fileId,
      mimeType: persistedAudio.mimeType,
      durationMs: null,
      alignmentJson: null,
      waveformJson: null,
      status: 'ready',
      errorMessage: null,
    });

    return serializeArtifactResponse(documentId, artifact);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document speech synthesis failed';
    await deps.upsertDocumentSpeechAudioArtifact(userId, {
      audioArtifactId,
      segmentId: segment.segmentId,
      documentId,
      renderVersionId: segment.renderVersionId,
      speechProfile: profile,
      audioCacheKey,
      fileId: existingArtifact?.fileId ?? null,
      mimeType: profile.format,
      durationMs: existingArtifact?.durationMs ?? null,
      alignmentJson: existingArtifact?.alignmentJson ?? null,
      waveformJson: existingArtifact?.waveformJson,
      status: 'failed',
      errorMessage: message,
    });
    throw error;
  }
}

export async function getDocumentSpeechAudioPayload(
  deps: DocumentSpeechServiceDeps,
  userId: string,
  documentId: string,
  audioArtifactId: string,
): Promise<AudioPayload> {
  const artifact = await deps.getDocumentSpeechAudioArtifact(userId, { audioArtifactId });
  if (!artifact || artifact.documentId !== documentId || !artifact.fileId) {
    throw new Error('Document speech audio not found');
  }

  const file = await deps.findFileById(artifact.fileId, { user: userId });
  if (!file?.filepath || !(await fileExists(file.filepath))) {
    throw new Error('Document speech audio not found');
  }

  return {
    filePath: file.filepath,
    mimeType: artifact.mimeType,
    filename: file.filename,
  };
}
