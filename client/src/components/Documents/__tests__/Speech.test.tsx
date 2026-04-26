import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import type { TDocumentWorkspace } from 'librechat-data-provider';
import DocumentSpeech from '../Speech';

const mockCreateManifest = jest.fn();
const mockCreateAudio = jest.fn();
const mockCreateAudioDownload = jest.fn();
const mockActiveSpeechChange = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('~/data-provider/Documents', () => ({
  useCreateDocumentSpeechManifestMutation: () => ({
    mutateAsync: mockCreateManifest,
  }),
  useCreateDocumentSpeechAudioMutation: () => ({
    mutateAsync: mockCreateAudio,
  }),
  useCreateDocumentSpeechAudioDownloadMutation: () => ({
    mutateAsync: mockCreateAudioDownload,
  }),
}));

const workspace: TDocumentWorkspace = {
  document: {
    documentId: 'document-1',
    projectId: 'project-1',
    sourceFileId: 'file-1',
    title: 'Entropy Notes',
    sourceMimeType: 'application/pdf',
    sourceKind: 'pdf',
    ingestionStatus: 'ready',
    ingestionStrategy: 'ocr_markdown',
    activeRenderVersionId: 'render-1',
    activeOverlayId: 'overlay-1',
    createdByUserId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  renderVersion: {
    renderVersionId: 'render-1',
    documentId: 'document-1',
    versionNumber: 1,
    documentIrJson: {
      documentId: 'document-1',
      projectId: 'project-1',
      sourceFileId: 'file-1',
      sourceType: 'application/pdf',
      title: 'Entropy Notes',
      blocks: [],
      outline: [],
      citations: [],
      assets: [],
      mathSpans: [],
      anchorIndex: {},
      renderVersion: 1,
    },
    renderHtml: null,
    outlineJson: [],
    assetsJson: [],
    createdByUserId: 'user-1',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  overlay: null,
  clarifications: [],
  visualizations: [],
};

describe('DocumentSpeech', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: jest.fn(),
    });
    global.URL.createObjectURL = jest.fn(() => 'blob:document-audio');
    global.URL.revokeObjectURL = jest.fn();

    mockCreateManifest.mockResolvedValue({
      planId: 'plan-1',
      documentId: 'document-1',
      renderVersionId: 'render-1',
      speechSurfaceFingerprint: 'surface-1',
      narrationPolicyVersion: 'document_speech_v1',
      resolvedProfile: {
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        language: null,
        format: 'audio/mpeg',
        rate: null,
      },
      startSegmentId: 'segment-1',
      nextPrefetchSegmentIds: [],
      segments: [
        {
          segmentId: 'segment-1',
          planId: 'plan-1',
          documentId: 'document-1',
          renderVersionId: 'render-1',
          blockId: 'block-1',
          charStart: 0,
          charEnd: 10,
          segmentIndex: 0,
          segmentKind: 'text',
          sourceText: 'Entropy increases.',
          sourceContextBefore: '',
          sourceContextAfter: '',
          sourceFingerprint: 'source-1',
          spokenText: 'Entropy increases.',
          spokenFingerprint: 'spoken-1',
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken: null,
          warnings: [],
          narrationModel: null,
          audio: {
            audioArtifactId: 'audio-1',
            segmentId: 'segment-1',
            documentId: 'document-1',
            renderVersionId: 'render-1',
            speechProfile: {
              provider: 'openai',
              model: 'gpt-4o-mini-tts',
              voice: 'alloy',
              language: null,
              format: 'audio/mpeg',
              rate: null,
            },
            audioCacheKey: 'cache-1',
            fileId: null,
            mimeType: 'audio/mpeg',
            durationMs: null,
            alignment: null,
            audioUrl: null,
            status: 'pending',
            errorMessage: null,
          },
        },
      ],
    });

    mockCreateAudio.mockResolvedValue({
      audioArtifactId: 'audio-1',
      segmentId: 'segment-1',
      documentId: 'document-1',
      renderVersionId: 'render-1',
      speechProfile: {
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        language: null,
        format: 'audio/mpeg',
        rate: null,
      },
      audioCacheKey: 'cache-1',
      fileId: 'file-1',
      mimeType: 'audio/mpeg',
      durationMs: null,
      alignment: null,
      audioUrl: '/api/documents/document-1/speech/audio/audio-1',
      status: 'ready',
      errorMessage: null,
    });
    mockCreateAudioDownload.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));
  });

  it('loads a manifest and audio artifact when playback starts', async () => {
    render(
      <RecoilRoot>
        <DocumentSpeech workspace={workspace} onActiveSpeechChange={mockActiveSpeechChange} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: /com_ui_document_tts_play/i }));

    await waitFor(() => {
      expect(mockCreateManifest).toHaveBeenCalledWith({
        documentId: 'document-1',
        renderVersionId: 'render-1',
        startBlockId: null,
        profile: {
          voice: undefined,
          language: null,
          format: 'audio/mpeg',
          rate: null,
        },
      });
    });

    await waitFor(() => {
      expect(mockCreateAudio).toHaveBeenCalledWith({
        documentId: 'document-1',
        segmentId: 'segment-1',
        profile: {
          voice: undefined,
          language: null,
          format: 'audio/mpeg',
          rate: null,
        },
      });
    });

    await waitFor(() => {
      expect(mockCreateAudioDownload).toHaveBeenCalledWith({
        documentId: 'document-1',
        audioArtifactId: 'audio-1',
      });
    });

    await waitFor(() => {
      expect(mockActiveSpeechChange).toHaveBeenCalledWith({
        blockId: 'block-1',
        excerpt: 'Entropy increases.',
        segmentKind: 'text',
      });
    });
  });
});
