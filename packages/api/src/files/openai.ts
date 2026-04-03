import OpenAI from 'openai';
import { EModelEndpoint } from 'librechat-data-provider';
import type { EndpointDbMethods, ServerRequest } from '~/types';
import { initializeOpenAI } from '~/endpoints/openai/initialize';

type OpenAIFileClient = OpenAI & { req?: ServerRequest };
type OpenAIFileConfig = { apiKey?: string };

export async function createOpenAIFileClient(
  req: ServerRequest,
  db: EndpointDbMethods,
): Promise<OpenAIFileClient> {
  const result = await initializeOpenAI({
    req,
    endpoint: EModelEndpoint.openAI,
    model_parameters: {
      model: typeof req.body?.model === 'string' ? req.body.model : undefined,
      useResponsesApi: true,
    },
    db,
  });
  const llmConfig = result.llmConfig as OpenAIFileConfig;

  if (typeof llmConfig.apiKey !== 'string' || llmConfig.apiKey.length === 0) {
    throw new Error('OpenAI API key not provided.');
  }

  const openai = new OpenAI({
    apiKey: llmConfig.apiKey,
    ...result.configOptions,
  }) as OpenAIFileClient;

  openai.req = req;
  return openai;
}
