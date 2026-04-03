import { checkOpenAIStorage, EModelEndpoint } from 'librechat-data-provider';

const nativeUploadMimePrefixes = ['application/', 'text/'] as const;
const nativeUploadEnvFlag = 'LIBRECHAT_OPENAI_NATIVE_UPLOAD';
const openAITransportModeEnvFlag = 'LIBRECHAT_OPENAI_TRANSPORT_MODE';
const openAITransportModes = {
  official: 'official',
  proxyContext: 'proxy_context',
  legacy: 'legacy',
} as const;

export type OpenAITransportMode =
  (typeof openAITransportModes)[keyof typeof openAITransportModes];

interface UploadMetadataLike {
  endpoint?: string | null;
  endpointType?: string | null;
  tool_resource?: string | null;
}

interface FileLike {
  source?: string | null;
}

function isFileLike(value: unknown): value is FileLike {
  return typeof value === 'object' && value != null;
}

export function isDocumentInputMimeType(mimetype?: string | null): boolean {
  if (typeof mimetype !== 'string' || mimetype.length === 0) {
    return false;
  }

  return nativeUploadMimePrefixes.some((prefix) => mimetype.startsWith(prefix));
}

export function getOpenAITransportMode(): OpenAITransportMode {
  const configuredMode = process.env[openAITransportModeEnvFlag];
  if (configuredMode === openAITransportModes.official) {
    return openAITransportModes.official;
  }

  if (configuredMode === openAITransportModes.proxyContext) {
    return openAITransportModes.proxyContext;
  }

  return openAITransportModes.legacy;
}

export function isNativeOpenAIUploadEnabled(): boolean {
  const mode = getOpenAITransportMode();
  if (mode === openAITransportModes.official) {
    return true;
  }

  if (mode === openAITransportModes.proxyContext) {
    return false;
  }

  return process.env[nativeUploadEnvFlag] === 'true';
}

export function shouldUseOfficialOpenAITransport(): boolean {
  return getOpenAITransportMode() === openAITransportModes.official;
}

export function getConfiguredOpenAIBaseURL(): string | undefined {
  if (shouldUseOfficialOpenAITransport()) {
    return undefined;
  }

  return process.env.OPENAI_REVERSE_PROXY || undefined;
}

export function isOpenAINativeUploadRequest(
  params: UploadMetadataLike & { mimetype?: string | null },
): boolean {
  if (!isNativeOpenAIUploadEnabled()) {
    return false;
  }

  if (params.tool_resource != null && params.tool_resource !== '') {
    return false;
  }

  if (!isDocumentInputMimeType(params.mimetype)) {
    return false;
  }

  return params.endpoint === EModelEndpoint.openAI || params.endpointType === EModelEndpoint.openAI;
}

export function hasNativeOpenAIFileAttachments(files: unknown): boolean {
  if (!Array.isArray(files)) {
    return false;
  }

  return files.some((file) => isFileLike(file) && checkOpenAIStorage(file.source ?? ''));
}

export function isRemoteOpenAIFile(source?: string | null): boolean {
  if (typeof source !== 'string' || source.length === 0) {
    return false;
  }

  return checkOpenAIStorage(source);
}
