import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from '@librechat/data-schemas';

const MAX_DB_INLINE_BYTES = 256 * 1024;

type PersistPayloadResult = {
  storageMode: 'db_inline' | 'hybrid';
  compiledRenderText: string | null;
  compiledRenderStoragePath: string | null;
  storageByteSize: number;
};

type LoadPayloadResult = {
  body: Buffer | string;
  isBinary: boolean;
  mimeType: string;
};

type DataUrlPayload = {
  mimeType: string;
  buffer: Buffer;
};

function getVisualizationStorageRoot(appConfig?: AppConfig): string {
  const uploadsRoot = appConfig?.paths?.uploads ?? path.resolve(process.cwd(), 'uploads');
  return path.join(uploadsRoot, 'visualizations');
}

function getFileExtension(mimeType: string): string {
  if (mimeType === 'text/html') {
    return 'html';
  }
  if (mimeType === 'image/svg+xml') {
    return 'svg';
  }
  if (mimeType === 'text/vnd.mermaid') {
    return 'mmd';
  }
  if (mimeType === 'text/markdown') {
    return 'md';
  }
  if (mimeType === 'application/json') {
    return 'json';
  }
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  return 'txt';
}

function parseDataUrl(value: string): DataUrlPayload {
  const match = value.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) {
    throw new Error('Visualization image payload is not a valid data URL');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function getByteSize(content: string, mimeType: string): number {
  if (mimeType.startsWith('image/') && content.startsWith('data:')) {
    return parseDataUrl(content).buffer.byteLength;
  }

  return Buffer.byteLength(content, 'utf8');
}

export async function persistVisualizationPayload(
  appConfig: AppConfig | undefined,
  visualizationId: string,
  mimeType: string,
  content: string,
): Promise<PersistPayloadResult> {
  const storageByteSize = getByteSize(content, mimeType);
  if (storageByteSize <= MAX_DB_INLINE_BYTES) {
    return {
      storageMode: 'db_inline',
      compiledRenderText: content,
      compiledRenderStoragePath: null,
      storageByteSize,
    };
  }

  const storageRoot = getVisualizationStorageRoot(appConfig);
  await fs.mkdir(storageRoot, { recursive: true });

  const fileExtension = getFileExtension(mimeType);
  const storagePath = path.join(storageRoot, `${visualizationId}.${fileExtension}`);

  if (mimeType.startsWith('image/') && content.startsWith('data:')) {
    const { buffer } = parseDataUrl(content);
    await fs.writeFile(storagePath, buffer);
  } else {
    await fs.writeFile(storagePath, content, 'utf8');
  }

  return {
    storageMode: 'hybrid',
    compiledRenderText: null,
    compiledRenderStoragePath: storagePath,
    storageByteSize,
  };
}

export async function loadVisualizationPayload(
  appConfig: AppConfig | undefined,
  mimeType: string,
  compiledRenderText: string | null | undefined,
  compiledRenderStoragePath: string | null | undefined,
): Promise<LoadPayloadResult> {
  if (compiledRenderStoragePath) {
    const storageRoot = getVisualizationStorageRoot(appConfig);
    const resolvedStoragePath = path.isAbsolute(compiledRenderStoragePath)
      ? compiledRenderStoragePath
      : path.join(storageRoot, compiledRenderStoragePath);
    const body = await fs.readFile(
      resolvedStoragePath,
      mimeType.startsWith('image/') ? undefined : 'utf8',
    );

    return {
      body,
      isBinary: Buffer.isBuffer(body),
      mimeType,
    };
  }

  if (mimeType.startsWith('image/') && compiledRenderText?.startsWith('data:')) {
    const parsed = parseDataUrl(compiledRenderText);
    return {
      body: parsed.buffer,
      isBinary: true,
      mimeType: parsed.mimeType,
    };
  }

  return {
    body: compiledRenderText ?? '',
    isBinary: false,
    mimeType,
  };
}
