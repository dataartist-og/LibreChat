import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from '@librechat/data-schemas';

type PersistDocumentSpeechAudioResult = {
  filePath: string;
  bytes: number;
  mimeType: string;
};

function getUploadsRoot(appConfig?: AppConfig): string {
  return appConfig?.paths?.uploads ?? path.resolve(process.cwd(), 'uploads');
}

export function getDocumentSpeechStorageRoot(appConfig: AppConfig | undefined, userId: string): string {
  return path.join(getUploadsRoot(appConfig), 'document-tts', userId);
}

export function getDocumentSpeechFileExtension(mimeType: string): string {
  if (mimeType === 'audio/mpeg') {
    return 'mp3';
  }
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') {
    return 'wav';
  }
  if (mimeType === 'audio/ogg') {
    return 'ogg';
  }
  if (mimeType === 'audio/webm') {
    return 'webm';
  }

  return 'bin';
}

export async function persistDocumentSpeechAudio(
  appConfig: AppConfig | undefined,
  userId: string,
  audioArtifactId: string,
  mimeType: string,
  buffer: Buffer,
): Promise<PersistDocumentSpeechAudioResult> {
  const storageRoot = getDocumentSpeechStorageRoot(appConfig, userId);
  await fs.mkdir(storageRoot, { recursive: true });

  const filePath = path.join(
    storageRoot,
    `${audioArtifactId}.${getDocumentSpeechFileExtension(mimeType)}`,
  );
  await fs.writeFile(filePath, buffer);

  return {
    filePath,
    bytes: buffer.byteLength,
    mimeType,
  };
}
