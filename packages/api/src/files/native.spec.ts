import { EModelEndpoint, FileSources } from 'librechat-data-provider';
import {
  hasNativeOpenAIFileAttachments,
  isDocumentInputMimeType,
  isOpenAINativeUploadRequest,
  isRemoteOpenAIFile,
} from './native';

describe('native file helpers', () => {
  const originalEnv = process.env.LIBRECHAT_OPENAI_NATIVE_UPLOAD;
  const originalTransportMode = process.env.LIBRECHAT_OPENAI_TRANSPORT_MODE;

  afterEach(() => {
    if (originalEnv == null) {
      delete process.env.LIBRECHAT_OPENAI_NATIVE_UPLOAD;
    } else {
      process.env.LIBRECHAT_OPENAI_NATIVE_UPLOAD = originalEnv;
    }

    if (originalTransportMode == null) {
      delete process.env.LIBRECHAT_OPENAI_TRANSPORT_MODE;
    } else {
      process.env.LIBRECHAT_OPENAI_TRANSPORT_MODE = originalTransportMode;
    }
  });

  describe('isDocumentInputMimeType', () => {
    it('accepts application and text mime types', () => {
      expect(isDocumentInputMimeType('application/pdf')).toBe(true);
      expect(
        isDocumentInputMimeType(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBe(true);
      expect(isDocumentInputMimeType('text/plain')).toBe(true);
    });

    it('rejects image mime types', () => {
      expect(isDocumentInputMimeType('image/png')).toBe(false);
    });
  });

  describe('isOpenAINativeUploadRequest', () => {
    it('rejects uploads when the native upload flag is disabled', () => {
      delete process.env.LIBRECHAT_OPENAI_NATIVE_UPLOAD;

      expect(
        isOpenAINativeUploadRequest({
          endpoint: EModelEndpoint.agents,
          endpointType: EModelEndpoint.openAI,
          mimetype: 'application/pdf',
        }),
      ).toBe(false);
    });

    it('accepts openai uploads without tool resources when the native upload flag is enabled', () => {
      process.env.LIBRECHAT_OPENAI_NATIVE_UPLOAD = 'true';

      expect(
        isOpenAINativeUploadRequest({
          endpoint: EModelEndpoint.agents,
          endpointType: EModelEndpoint.openAI,
          mimetype: 'application/pdf',
        }),
      ).toBe(true);
    });

    it('accepts openai uploads when transport mode is official', () => {
      process.env.LIBRECHAT_OPENAI_TRANSPORT_MODE = 'official';
      delete process.env.LIBRECHAT_OPENAI_NATIVE_UPLOAD;

      expect(
        isOpenAINativeUploadRequest({
          endpoint: EModelEndpoint.openAI,
          endpointType: EModelEndpoint.openAI,
          mimetype: 'application/pdf',
        }),
      ).toBe(true);
    });

    it('rejects openai uploads when transport mode is proxy_context', () => {
      process.env.LIBRECHAT_OPENAI_TRANSPORT_MODE = 'proxy_context';
      process.env.LIBRECHAT_OPENAI_NATIVE_UPLOAD = 'true';

      expect(
        isOpenAINativeUploadRequest({
          endpoint: EModelEndpoint.openAI,
          endpointType: EModelEndpoint.openAI,
          mimetype: 'application/pdf',
        }),
      ).toBe(false);
    });

    it('rejects tool resource uploads', () => {
      process.env.LIBRECHAT_OPENAI_NATIVE_UPLOAD = 'true';

      expect(
        isOpenAINativeUploadRequest({
          endpoint: EModelEndpoint.openAI,
          endpointType: EModelEndpoint.openAI,
          tool_resource: 'context',
          mimetype: 'application/pdf',
        }),
      ).toBe(false);
    });
  });

  describe('hasNativeOpenAIFileAttachments', () => {
    it('detects stored openai files in request attachments', () => {
      expect(
        hasNativeOpenAIFileAttachments([
          { file_id: 'file_1', source: FileSources.openai },
          { file_id: 'file_2', source: FileSources.local },
        ]),
      ).toBe(true);
    });

    it('ignores non-openai attachments', () => {
      expect(
        hasNativeOpenAIFileAttachments([{ file_id: 'local-1', source: FileSources.local }]),
      ).toBe(false);
    });
  });

  describe('isRemoteOpenAIFile', () => {
    it('accepts persisted openai file sources', () => {
      expect(isRemoteOpenAIFile(FileSources.openai)).toBe(true);
      expect(isRemoteOpenAIFile(FileSources.azure)).toBe(true);
    });

    it('rejects local sources', () => {
      expect(isRemoteOpenAIFile(FileSources.local)).toBe(false);
    });
  });
});
