import { Providers } from '@librechat/agents';
import {
  isOpenAILikeProvider,
  isBedrockDocumentType,
  bedrockDocumentFormats,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type {
  AnthropicDocumentBlock,
  StrategyFunctions,
  DocumentResult,
  ServerRequest,
} from '~/types';
import { validatePdf, validateBedrockDocument } from '~/files/validation';
import { getFileStream, getConfiguredFileSizeLimit } from './utils';
import { isDocumentInputMimeType, isRemoteOpenAIFile } from '../native';

function canUseOpenAIFileId(provider: Providers): boolean {
  return provider === Providers.OPENAI || provider === Providers.AZURE;
}

function createRemoteOpenAIBlock(file: IMongoFile): DocumentResult['documents'][number] {
  return {
    type: 'file',
    file: {
      file_id: file.file_id,
    },
  };
}

/**
 * Processes and encodes document files for various providers
 * @param req - Express request object
 * @param files - Array of file objects to process
 * @param params - Object containing provider, endpoint, and other options
 * @param params.provider - The provider name
 * @param params.endpoint - Optional endpoint name for file config lookup
 * @param params.useResponsesApi - Whether to use responses API format
 * @param getStrategyFunctions - Function to get strategy functions
 * @returns Promise that resolves to documents and file metadata
 */
export async function encodeAndFormatDocuments(
  req: ServerRequest,
  files: IMongoFile[],
  params: { provider: Providers; endpoint?: string; useResponsesApi?: boolean; model?: string },
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<DocumentResult> {
  const { provider, endpoint, useResponsesApi, model } = params;
  if (!files?.length) {
    return { documents: [], files: [] };
  }

  const encodingMethods: Record<string, StrategyFunctions> = {};
  const result: DocumentResult = { documents: [], files: [] };

  const isBedrock = provider === Providers.BEDROCK;
  const isDocSupported = isDocumentSupportedProvider(provider);

  const documentFiles = files.filter((file) => {
    if (isBedrock && isBedrockDocumentType(file.type)) {
      return true;
    }
    return isDocumentInputMimeType(file.type);
  });

  if (!documentFiles.length) {
    return result;
  }

  const results = await Promise.allSettled(
    documentFiles.map((file) => {
      if (isRemoteOpenAIFile(file.source)) {
        return Promise.resolve({
          file,
          content: '',
          metadata: {
            file_id: file.file_id,
            temp_file_id: file.temp_file_id,
            filepath: file.filepath,
            source: file.source,
            filename: file.filename,
            type: file.type,
          },
        });
      }

      const isProcessable = isBedrock ? isBedrockDocumentType(file.type) : isDocSupported;
      if (!isProcessable) {
        return Promise.resolve(null);
      }
      return getFileStream(req, file, encodingMethods, getStrategyFunctions);
    }),
  );

  for (const settledResult of results) {
    if (settledResult.status === 'rejected') {
      console.error('Document processing failed:', settledResult.reason);
      continue;
    }

    const processed = settledResult.value;
    if (!processed) continue;

    const { file, content, metadata } = processed;

    if (isRemoteOpenAIFile(file.source)) {
      if (canUseOpenAIFileId(provider)) {
        result.documents.push(createRemoteOpenAIBlock(file));
      }
      result.files.push(metadata);
      continue;
    }

    if (!content || !file) {
      if (metadata) result.files.push(metadata);
      continue;
    }

    const configuredFileSizeLimit = getConfiguredFileSizeLimit(req, { provider, endpoint });
    const mimeType = file.type ?? '';

    if (isBedrock && isBedrockDocumentType(mimeType)) {
      const fileBuffer = Buffer.from(content, 'base64');
      const format = bedrockDocumentFormats[mimeType];

      const validation = await validateBedrockDocument(
        fileBuffer.length,
        mimeType,
        fileBuffer,
        configuredFileSizeLimit,
        model,
      );

      if (!validation.isValid) {
        throw new Error(`Document validation failed: ${validation.error}`);
      }

      const sanitizedName = (file.filename || 'document')
        .replace(/[^a-zA-Z0-9\s\-()[\]]/g, '_')
        .slice(0, 200);
      result.documents.push({
        type: 'document',
        document: {
          name: sanitizedName,
          format,
          source: {
            bytes: fileBuffer,
          },
        },
      });
      result.files.push(metadata);
    } else if (isDocSupported && isDocumentInputMimeType(file.type)) {
      const pdfBuffer = Buffer.from(content, 'base64');

      if (file.type === 'application/pdf') {
        const validation = await validatePdf(
          pdfBuffer,
          pdfBuffer.length,
          provider,
          configuredFileSizeLimit,
          model,
        );

        if (!validation.isValid) {
          throw new Error(`PDF validation failed: ${validation.error}`);
        }
      }

      if (provider === Providers.ANTHROPIC && file.type === 'application/pdf') {
        const document: AnthropicDocumentBlock = {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: content,
          },
          citations: { enabled: true },
        };

        if (file.filename) {
          document.context = `File: "${file.filename}"`;
        }

        result.documents.push(document);
      } else if (useResponsesApi) {
        result.documents.push({
          type: 'file',
          file: {
            filename: file.filename,
            file_data: `data:${mimeType};base64,${content}`,
          },
        });
      } else if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
        result.documents.push({
          type: 'media',
          mimeType,
          data: content,
        });
      } else if (isOpenAILikeProvider(provider)) {
        result.documents.push({
          type: 'file',
          file: {
            filename: file.filename,
            file_data: `data:${mimeType};base64,${content}`,
          },
        });
      }
      result.files.push(metadata);
    }
  }

  return result;
}
