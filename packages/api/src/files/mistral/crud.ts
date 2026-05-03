import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import FormData from 'form-data';
import { logger } from '@librechat/data-schemas';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  FileSources,
  envVarRegex,
  extractEnvVariable,
  extractVariableName,
} from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import type {
  MistralFileUploadResponse,
  MistralSignedUrlResponse,
  MistralOCRUploadResult,
  MistralOCRError,
  OCRResultPage,
  ServerRequest,
  OCRResult,
  OCRImage,
  OCRStoredPage,
} from '~/types';
import { logAxiosError, createAxiosInstance } from '~/utils/axios';
import { readFileAsBuffer } from '~/utils/files';
import { loadServiceKey } from '~/utils/key';

const axios = createAxiosInstance();
const DEFAULT_MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
const DEFAULT_MISTRAL_MODEL = 'mistral-ocr-latest';
const execFile = promisify(execFileCallback);
const captionPattern = /(?:^|\n)\s*(?:Figure|Fig\.|Table)\s+\d+[A-Za-z]?(?::|\.)/gim;

/** Helper type for auth configuration */
interface AuthConfig {
  apiKey: string;
  baseURL: string;
}

/** Helper type for Google service account */
interface GoogleServiceAccount {
  client_email?: string;
  private_key?: string;
  project_id?: string;
}

/** Helper type for OCR request context */
interface OCRContext {
  req: ServerRequest;
  file: Express.Multer.File;
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
    optional?: Set<string>;
  }) => Promise<Record<string, string | undefined>>;
}

/**
 * Uploads a document to Mistral API using file streaming to avoid loading the entire file into memory
 * @param params Upload parameters
 * @param params.filePath The path to the file on disk
 * @param params.fileName Optional filename to use (defaults to the name from filePath)
 * @param params.apiKey Mistral API key
 * @param params.baseURL Mistral API base URL
 * @returns The response from Mistral API
 */
export async function uploadDocumentToMistral({
  apiKey,
  filePath,
  baseURL = DEFAULT_MISTRAL_BASE_URL,
  fileName = '',
}: {
  apiKey: string;
  filePath: string;
  baseURL?: string;
  fileName?: string;
}): Promise<MistralFileUploadResponse> {
  const form = new FormData();
  form.append('purpose', 'ocr');
  const actualFileName = fileName || path.basename(filePath);
  const fileStream = fs.createReadStream(filePath);
  form.append('file', fileStream, { filename: actualFileName });

  const config: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  };

  if (process.env.PROXY) {
    config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  return axios
    .post(`${baseURL}/files`, form, config)
    .then((res) => res.data)
    .catch((error) => {
      throw error;
    });
}

export async function getSignedUrl({
  apiKey,
  fileId,
  expiry = 24,
  baseURL = DEFAULT_MISTRAL_BASE_URL,
}: {
  apiKey: string;
  fileId: string;
  expiry?: number;
  baseURL?: string;
}): Promise<MistralSignedUrlResponse> {
  const config: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };

  if (process.env.PROXY) {
    config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  return axios
    .get(`${baseURL}/files/${fileId}/url?expiry=${expiry}`, config)
    .then((res) => res.data)
    .catch((error) => {
      logger.error('Error fetching signed URL:', error.message);
      throw error;
    });
}

/**
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.url - The document or image URL
 * @param {string} [params.documentType='document_url'] - 'document_url' or 'image_url'
 * @param {string} [params.model]
 * @param {string} [params.baseURL]
 * @returns {Promise<OCRResult>}
 */
export async function performOCR({
  url,
  apiKey,
  model = DEFAULT_MISTRAL_MODEL,
  baseURL = DEFAULT_MISTRAL_BASE_URL,
  documentType = 'document_url',
  includeImageBase64 = false,
}: {
  url: string;
  apiKey: string;
  model?: string;
  baseURL?: string;
  documentType?: 'document_url' | 'image_url';
  includeImageBase64?: boolean;
}): Promise<OCRResult> {
  const documentKey = documentType === 'image_url' ? 'image_url' : 'document_url';

  const config: AxiosRequestConfig = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  };

  if (process.env.PROXY) {
    config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  const ocrURL = baseURL.endsWith('/ocr') ? baseURL : `${baseURL}/ocr`;

  return axios
    .post(
      ocrURL,
      {
        model,
        include_image_base64: includeImageBase64,
        document: {
          type: documentType,
          [documentKey]: url,
        },
      },
      config,
    )
    .then((res) => res.data)
    .catch((error) => {
      logger.error('Error performing OCR:', error.message);
      throw error;
    });
}

/**
 * Deletes a file from Mistral API
 * @param params Delete parameters
 * @param params.fileId The file ID to delete
 * @param params.apiKey Mistral API key
 * @param params.baseURL Mistral API base URL
 * @returns Promise that resolves when the file is deleted
 */
export async function deleteMistralFile({
  fileId,
  apiKey,
  baseURL = DEFAULT_MISTRAL_BASE_URL,
}: {
  fileId: string;
  apiKey: string;
  baseURL?: string;
}): Promise<void> {
  const config: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };

  if (process.env.PROXY) {
    config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  try {
    const result = await axios.delete(`${baseURL}/files/${fileId}`, config);
    logger.debug(`Mistral file ${fileId} deleted successfully:`, result.data);
  } catch (error) {
    logger.error(`Error deleting Mistral file ${fileId}:`, error);
  }
}

/**
 * Determines if a value needs to be loaded from environment
 */
function needsEnvLoad(value: string): boolean {
  return envVarRegex.test(value) || !value.trim();
}

/**
 * Gets the environment variable name for a config value
 */
function getEnvVarName(configValue: string, defaultName: string): string {
  if (!envVarRegex.test(configValue)) {
    return defaultName;
  }
  return extractVariableName(configValue) || defaultName;
}

/**
 * Resolves a configuration value from either hardcoded or environment
 */
async function resolveConfigValue(
  configValue: string,
  defaultEnvName: string,
  authValues: Record<string, string | undefined>,
  defaultValue?: string,
): Promise<string> {
  // If it's a hardcoded value (not env var and not empty), use it directly
  if (!needsEnvLoad(configValue)) {
    return configValue;
  }

  // Otherwise, get from auth values
  const envVarName = getEnvVarName(configValue, defaultEnvName);
  return authValues[envVarName] || defaultValue || '';
}

/**
 * Loads authentication configuration from OCR config
 */
async function loadAuthConfig(context: OCRContext): Promise<AuthConfig> {
  const appConfig = context.req.config;
  const ocrConfig = appConfig?.ocr;
  const apiKeyConfig = ocrConfig?.apiKey || '';
  const baseURLConfig = ocrConfig?.baseURL || '';

  if (!needsEnvLoad(apiKeyConfig) && !needsEnvLoad(baseURLConfig)) {
    return {
      apiKey: apiKeyConfig,
      baseURL: baseURLConfig,
    };
  }

  const authFields: string[] = [];

  if (needsEnvLoad(baseURLConfig)) {
    authFields.push(getEnvVarName(baseURLConfig, 'OCR_BASEURL'));
  }

  if (needsEnvLoad(apiKeyConfig)) {
    authFields.push(getEnvVarName(apiKeyConfig, 'OCR_API_KEY'));
  }

  const authValues = await context.loadAuthValues({
    userId: context.req.user?.id || '',
    authFields,
    optional: new Set(['OCR_BASEURL']),
  });

  const apiKey = await resolveConfigValue(apiKeyConfig, 'OCR_API_KEY', authValues);
  const baseURL = await resolveConfigValue(
    baseURLConfig,
    'OCR_BASEURL',
    authValues,
    DEFAULT_MISTRAL_BASE_URL,
  );

  return { apiKey, baseURL };
}

/**
 * Gets the model configuration
 */
function getModelConfig(ocrConfig?: TCustomConfig['ocr']): string {
  const modelConfig = ocrConfig?.mistralModel || '';

  if (!modelConfig.trim()) {
    return DEFAULT_MISTRAL_MODEL;
  }

  if (envVarRegex.test(modelConfig)) {
    return extractEnvVariable(modelConfig) || DEFAULT_MISTRAL_MODEL;
  }

  return modelConfig.trim();
}

/**
 * Determines document type based on file
 */
function getDocumentType(file: Express.Multer.File): 'image_url' | 'document_url' {
  const mimetype = (file.mimetype || '').toLowerCase();
  const originalname = file.originalname || '';
  const isImage =
    mimetype.startsWith('image') || /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(originalname);

  return isImage ? 'image_url' : 'document_url';
}

/**
 * Processes OCR result pages into aggregated text and images
 */
export function countCaptionCandidates(markdown: string): number {
  return markdown.match(captionPattern)?.length ?? 0;
}

function isPdfSourceFile(sourceFilePath?: string): boolean {
  return path.extname(sourceFilePath ?? '').toLowerCase() === '.pdf';
}

async function renderPdfPageSnapshot(params: {
  filePath: string;
  pageNumber: number;
}): Promise<string | null> {
  const outputBase = path.join(
    os.tmpdir(),
    `librechat-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}-page-${params.pageNumber}`,
  );
  const outputPath = `${outputBase}.png`;

  try {
    await execFile('pdftocairo', [
      '-png',
      '-singlefile',
      '-f',
      String(params.pageNumber),
      '-l',
      String(params.pageNumber),
      params.filePath,
      outputBase,
    ]);

    const rendered = await fs.promises.readFile(outputPath);
    return rendered.toString('base64');
  } catch (error) {
    logger.error('Error rendering PDF page snapshot fallback:', error);
    return null;
  } finally {
    await fs.promises.rm(outputPath, { force: true }).catch(() => undefined);
  }
}

type OCRProcessingOptions = {
  sourceFilePath?: string;
  renderPageSnapshot?: (params: { filePath: string; pageNumber: number }) => Promise<string | null>;
};

export async function processOCRResult(
  ocrResult: OCRResult,
  options: OCRProcessingOptions = {},
): Promise<{
  text: string;
  images: string[];
  pages: OCRStoredPage[];
}> {
  let aggregatedText = '';
  const images: string[] = [];
  const pages: OCRStoredPage[] = [];
  const renderPageSnapshot = options.renderPageSnapshot ?? renderPdfPageSnapshot;

  for (const [index, page] of ocrResult.pages.entries()) {
    if (ocrResult.pages.length > 1) {
      aggregatedText += `# PAGE ${index + 1}\n`;
    }

    aggregatedText += page.markdown + '\n\n';

    const storedImages = (page.images || [])
      .filter((image: OCRImage) => Boolean(image.image_base64))
      .map((image: OCRImage) => ({
        id: image.id,
        topLeftX: image.top_left_x,
        topLeftY: image.top_left_y,
        bottomRightX: image.bottom_right_x,
        bottomRightY: image.bottom_right_y,
        imageBase64: image.image_base64,
        imageAnnotation: image.image_annotation ?? null,
        reusable: false,
      }));

    const pageNumber = page.index + 1;
    const missingCaptionAssets =
      countCaptionCandidates(page.markdown) - Math.max(storedImages.length, 0);

    if (
      missingCaptionAssets > 0 &&
      isPdfSourceFile(options.sourceFilePath) &&
      options.sourceFilePath
    ) {
      const snapshotBase64 = await renderPageSnapshot({
        filePath: options.sourceFilePath,
        pageNumber,
      });

      if (snapshotBase64) {
        storedImages.push({
          id: `page-snapshot-${pageNumber}`,
          topLeftX: 0,
          topLeftY: 0,
          bottomRightX: page.dimensions.width,
          bottomRightY: page.dimensions.height,
          imageBase64: snapshotBase64,
          imageAnnotation: null,
          reusable: true,
        });
      }
    }

    pages.push({
      index: page.index,
      dimensions: page.dimensions,
      images: storedImages,
    });

    storedImages.forEach((image) => {
      if (image.imageBase64) {
        images.push(image.imageBase64);
      }
    });
  }

  return { text: aggregatedText, images, pages };
}

/**
 * Creates an error message for OCR operations
 */
function createOCRError(error: unknown, baseMessage: string): Error {
  const axiosError = error as AxiosError<MistralOCRError>;
  const detail = axiosError?.response?.data?.detail;
  const message = detail || baseMessage;

  const responseMessage = axiosError?.response?.data?.message;
  const errorLog = logAxiosError({ error: axiosError, message });
  const fullMessage = responseMessage ? `${errorLog} - ${responseMessage}` : errorLog;

  return new Error(fullMessage);
}

/**
 * Uploads a file to the Mistral OCR API and processes the OCR result.
 *
 * @param params - The params object.
 * @param params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param params.loadAuthValues - Function to load authentication values
 * @returns - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
export const uploadMistralOCR = async (context: OCRContext): Promise<MistralOCRUploadResult> => {
  let mistralFileId: string | undefined;
  let apiKey: string | undefined;
  let baseURL: string | undefined;

  try {
    const authConfig = await loadAuthConfig(context);
    apiKey = authConfig.apiKey;
    baseURL = authConfig.baseURL;
    const model = getModelConfig(context.req.config?.ocr);

    const mistralFile = await uploadDocumentToMistral({
      filePath: context.file.path,
      fileName: context.file.originalname,
      apiKey,
      baseURL,
    });

    mistralFileId = mistralFile.id;

    const signedUrlResponse = await getSignedUrl({
      apiKey,
      baseURL,
      fileId: mistralFile.id,
    });

    const documentType = getDocumentType(context.file);
    const ocrResult = await performOCR({
      url: signedUrlResponse.url,
      documentType,
      baseURL,
      apiKey,
      model,
      includeImageBase64: true,
    });

    if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
      throw new Error(
        'No OCR result returned from service, may be down or the file is not supported.',
      );
    }
    const { text, images, pages } = await processOCRResult(ocrResult, {
      sourceFilePath: context.file.path,
    });

    if (mistralFileId && apiKey && baseURL) {
      await deleteMistralFile({ fileId: mistralFileId, apiKey, baseURL });
    }

    return {
      filename: context.file.originalname,
      bytes: text.length * 4,
      filepath: FileSources.mistral_ocr,
      text,
      images,
      pages,
    };
  } catch (error) {
    if (mistralFileId && apiKey && baseURL) {
      await deleteMistralFile({ fileId: mistralFileId, apiKey, baseURL });
    }
    throw createOCRError(error, 'Error uploading document to Mistral OCR API:');
  }
};

/**
 * Use Azure Mistral OCR API to processe the OCR result.
 *
 * @param params - The params object.
 * @param params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param params.appConfig - Application configuration object
 * @param params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param params.loadAuthValues - Function to load authentication values
 * @returns - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
export const uploadAzureMistralOCR = async (
  context: OCRContext,
): Promise<MistralOCRUploadResult> => {
  try {
    const { apiKey, baseURL } = await loadAuthConfig(context);
    const model = getModelConfig(context.req.config?.ocr);

    const { content: buffer } = await readFileAsBuffer(context.file.path, {
      fileSize: context.file.size,
    });
    const base64 = buffer.toString('base64');
    /** Uses actual mimetype of the file, 'image/jpeg' as fallback since it seems to be accepted regardless of mismatch */
    const base64Prefix = `data:${context.file.mimetype || 'image/jpeg'};base64,`;

    const documentType = getDocumentType(context.file);
    const ocrResult = await performOCR({
      apiKey,
      baseURL,
      model,
      url: `${base64Prefix}${base64}`,
      documentType,
      includeImageBase64: true,
    });

    if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
      throw new Error(
        'No OCR result returned from service, may be down or the file is not supported.',
      );
    }

    const { text, images, pages } = await processOCRResult(ocrResult, {
      sourceFilePath: context.file.path,
    });

    return {
      filename: context.file.originalname,
      bytes: text.length * 4,
      filepath: FileSources.azure_mistral_ocr,
      text,
      images,
      pages,
    };
  } catch (error) {
    throw createOCRError(error, 'Error uploading document to Azure Mistral OCR API:');
  }
};

/**
 * Loads Google service account configuration
 */
async function loadGoogleAuthConfig(): Promise<{
  serviceAccount: GoogleServiceAccount;
  accessToken: string;
}> {
  /** Path from environment variable or default location */
  const serviceKeyPath =
    process.env.GOOGLE_SERVICE_KEY_FILE ||
    path.join(__dirname, '..', '..', '..', 'api', 'data', 'auth.json');

  const serviceKey = await loadServiceKey(serviceKeyPath);

  if (!serviceKey) {
    throw new Error(
      `Google service account not found or could not be loaded from ${serviceKeyPath}`,
    );
  }

  if (!serviceKey.client_email || !serviceKey.private_key || !serviceKey.project_id) {
    throw new Error('Invalid Google service account configuration');
  }

  const jwt = await createJWT(serviceKey as GoogleServiceAccount);
  const accessToken = await exchangeJWTForAccessToken(jwt);

  return {
    serviceAccount: serviceKey as GoogleServiceAccount,
    accessToken,
  };
}

/**
 * Creates a JWT token manually
 */
async function createJWT(serviceKey: GoogleServiceAccount): Promise<string> {
  const crypto = await import('crypto');

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceKey.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  sign.end();

  const signature = sign.sign(serviceKey.private_key!, 'base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Exchanges JWT for access token
 */
async function exchangeJWTForAccessToken(jwt: string): Promise<string> {
  const config: AxiosRequestConfig = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };

  if (process.env.PROXY) {
    config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  const response = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    config,
  );

  if (!response.data?.access_token) {
    throw new Error('No access token in response');
  }

  return response.data.access_token;
}

/**
 * Performs OCR using Google Vertex AI
 */
async function performGoogleVertexOCR({
  url,
  accessToken,
  projectId,
  model,
  documentType = 'document_url',
}: {
  url: string;
  accessToken: string;
  projectId: string;
  model: string;
  documentType?: 'document_url' | 'image_url';
}): Promise<OCRResult> {
  const location = process.env.GOOGLE_LOC || 'us-central1';
  const modelId = model || 'mistral-ocr-2505';

  let baseURL: string;
  if (location === 'global') {
    baseURL = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/mistralai/models/${modelId}:rawPredict`;
  } else {
    baseURL = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/mistralai/models/${modelId}:rawPredict`;
  }

  const documentKey = documentType === 'image_url' ? 'image_url' : 'document_url';

  const requestBody = {
    model: modelId,
    document: {
      type: documentType,
      [documentKey]: url,
    },
    include_image_base64: true,
  };

  logger.debug('Sending request to Google Vertex AI:', {
    url: baseURL,
    body: {
      ...requestBody,
      document: { ...requestBody.document, [documentKey]: 'base64_data_hidden' },
    },
  });

  const config: AxiosRequestConfig = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  };

  if (process.env.PROXY) {
    config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  return axios
    .post(baseURL, requestBody, config)
    .then((res) => {
      logger.debug('Google Vertex AI response received');
      return res.data;
    })
    .catch((error) => {
      if (error.response?.data) {
        logger.error('Vertex AI error response: ' + JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(
        logAxiosError({
          error: error as AxiosError,
          message: 'Error calling Google Vertex AI Mistral OCR',
        }),
      );
    });
}

/**
 * Use Google Vertex AI Mistral OCR API to process the OCR result.
 *
 * @param params - The params object.
 * @param params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param params.appConfig - Application configuration object
 * @param params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param params.loadAuthValues - Function to load authentication values
 * @returns - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
export const uploadGoogleVertexMistralOCR = async (
  context: OCRContext,
): Promise<MistralOCRUploadResult> => {
  try {
    const { serviceAccount, accessToken } = await loadGoogleAuthConfig();
    const model = getModelConfig(context.req.config?.ocr);

    const { content: buffer } = await readFileAsBuffer(context.file.path, {
      fileSize: context.file.size,
    });
    const base64 = buffer.toString('base64');
    const base64Prefix = `data:${context.file.mimetype || 'application/pdf'};base64,`;

    const documentType = getDocumentType(context.file);
    const ocrResult = await performGoogleVertexOCR({
      url: `${base64Prefix}${base64}`,
      accessToken,
      projectId: serviceAccount.project_id!,
      model,
      documentType,
    });

    if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
      throw new Error(
        'No OCR result returned from service, may be down or the file is not supported.',
      );
    }

    const { text, images, pages } = await processOCRResult(ocrResult, {
      sourceFilePath: context.file.path,
    });

    return {
      filename: context.file.originalname,
      bytes: text.length * 4,
      filepath: FileSources.vertexai_mistral_ocr as string,
      text,
      images,
      pages,
    };
  } catch (error) {
    throw createOCRError(error, 'Error uploading document to Google Vertex AI Mistral OCR:');
  }
};
