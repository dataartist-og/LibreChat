import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import type { TDocumentWorkspace } from 'librechat-data-provider';
import DocumentSpeech from '../Speech';
import type { DocumentSpeechHandle } from '../Speech';

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
  Slider: ({
    value,
    onValueChange,
    ...props
  }: {
    value: number[];
    onValueChange: (value: number[]) => void;
  }) => (
    <input
      type="range"
      value={value[0]}
      onChange={(event) => onValueChange([Number(event.target.value)])}
      {...props}
    />
  ),
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
      blocks: [
        {
          blockId: 'block-1',
          type: 'paragraph',
          assetId: null,
          level: null,
          title: null,
          sourcePageStart: 1,
          sourcePageEnd: 1,
          contentMarkdown: 'Entropy increases.',
          contentHtml: null,
          plainText: 'Entropy increases.',
          anchorPath: 'block:block-1',
        },
        {
          blockId: 'block-2',
          type: 'paragraph',
          assetId: null,
          level: null,
          title: null,
          sourcePageStart: 1,
          sourcePageEnd: 1,
          contentMarkdown: 'Free energy decreases.',
          contentHtml: null,
          plainText: 'Free energy decreases.',
          anchorPath: 'block:block-2',
        },
      ],
      outline: [],
      citations: [],
      assets: [],
      mathSpans: [],
      anchorIndex: {
        'block-1': {
          blockId: 'block-1',
          type: 'paragraph',
        },
        'block-2': {
          blockId: 'block-2',
          type: 'paragraph',
        },
      },
      renderVersion: 1,
    },
    renderHtml: null,
    outlineJson: [
      {
        id: 'outline-1',
        blockId: 'block-1',
        depth: 1,
        title: '1. Entropy',
      },
      {
        id: 'outline-2',
        blockId: 'block-2',
        depth: 1,
        title: '2. Free energy',
      },
    ],
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
    window.localStorage.clear();
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
        pauseOnFigures: false,
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

  it('starts playback from an explicit block through the player handle', async () => {
    const speechRef = React.createRef<DocumentSpeechHandle>();

    mockCreateManifest.mockResolvedValueOnce({
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
      startSegmentId: 'segment-2',
      nextPrefetchSegmentIds: [],
      segments: [
        {
          segmentId: 'segment-1',
          planId: 'plan-1',
          documentId: 'document-1',
          renderVersionId: 'render-1',
          blockId: 'block-1',
          charStart: 0,
          charEnd: 18,
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
          audio: null,
        },
        {
          segmentId: 'segment-2',
          planId: 'plan-1',
          documentId: 'document-1',
          renderVersionId: 'render-1',
          blockId: 'block-2',
          charStart: 0,
          charEnd: 22,
          segmentIndex: 1,
          segmentKind: 'text',
          sourceText: 'Free energy decreases.',
          sourceContextBefore: '',
          sourceContextAfter: '',
          sourceFingerprint: 'source-2',
          spokenText: 'Free energy decreases.',
          spokenFingerprint: 'spoken-2',
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken: null,
          warnings: [],
          narrationModel: null,
          audio: null,
        },
      ],
    });
    mockCreateAudio.mockResolvedValueOnce({
      audioArtifactId: 'audio-2',
      segmentId: 'segment-2',
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
      audioCacheKey: 'cache-2',
      fileId: 'file-2',
      mimeType: 'audio/mpeg',
      durationMs: null,
      alignment: null,
      audioUrl: '/api/documents/document-1/speech/audio/audio-2',
      status: 'ready',
      errorMessage: null,
    });

    render(
      <RecoilRoot>
        <DocumentSpeech
          ref={speechRef}
          workspace={workspace}
          onActiveSpeechChange={mockActiveSpeechChange}
        />
      </RecoilRoot>,
    );

    await act(async () => {
      speechRef.current?.playFromBlock('block-2');
    });

    await waitFor(() => {
      expect(mockCreateManifest).toHaveBeenCalledWith({
        documentId: 'document-1',
        renderVersionId: 'render-1',
        startBlockId: 'block-2',
        pauseOnFigures: false,
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
        segmentId: 'segment-2',
        profile: {
          voice: undefined,
          language: null,
          format: 'audio/mpeg',
          rate: null,
        },
      });
    });

    await waitFor(() => {
      expect(mockActiveSpeechChange).toHaveBeenCalledWith({
        blockId: 'block-2',
        excerpt: 'Free energy decreases.',
        segmentKind: 'text',
      });
    });
  });

  it('continues forward from a middle block instead of resetting to the beginning', async () => {
    const speechRef = React.createRef<DocumentSpeechHandle>();

    mockCreateManifest.mockResolvedValueOnce({
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
      startSegmentId: 'segment-2',
      nextPrefetchSegmentIds: ['segment-3'],
      segments: [
        {
          segmentId: 'segment-1',
          planId: 'plan-1',
          documentId: 'document-1',
          renderVersionId: 'render-1',
          blockId: 'block-1',
          charStart: 0,
          charEnd: 18,
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
          audio: null,
        },
        {
          segmentId: 'segment-2',
          planId: 'plan-1',
          documentId: 'document-1',
          renderVersionId: 'render-1',
          blockId: 'block-2',
          charStart: 0,
          charEnd: 22,
          segmentIndex: 1,
          segmentKind: 'text',
          sourceText: 'Free energy decreases.',
          sourceContextBefore: '',
          sourceContextAfter: '',
          sourceFingerprint: 'source-2',
          spokenText: 'Free energy decreases.',
          spokenFingerprint: 'spoken-2',
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken: null,
          warnings: [],
          narrationModel: null,
          audio: null,
        },
        {
          segmentId: 'segment-3',
          planId: 'plan-1',
          documentId: 'document-1',
          renderVersionId: 'render-1',
          blockId: 'block-3',
          charStart: 0,
          charEnd: 24,
          segmentIndex: 2,
          segmentKind: 'text',
          sourceText: 'Entropy stabilizes again.',
          sourceContextBefore: '',
          sourceContextAfter: '',
          sourceFingerprint: 'source-3',
          spokenText: 'Entropy stabilizes again.',
          spokenFingerprint: 'spoken-3',
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken: null,
          warnings: [],
          narrationModel: null,
          audio: null,
        },
      ],
    });

    mockCreateAudio
      .mockResolvedValueOnce({
        audioArtifactId: 'audio-2',
        segmentId: 'segment-2',
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
        audioCacheKey: 'cache-2',
        fileId: 'file-2',
        mimeType: 'audio/mpeg',
        durationMs: null,
        alignment: null,
        audioUrl: '/api/documents/document-1/speech/audio/audio-2',
        status: 'ready',
        errorMessage: null,
      })
      .mockResolvedValueOnce({
        audioArtifactId: 'audio-3',
        segmentId: 'segment-3',
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
        audioCacheKey: 'cache-3',
        fileId: 'file-3',
        mimeType: 'audio/mpeg',
        durationMs: null,
        alignment: null,
        audioUrl: '/api/documents/document-1/speech/audio/audio-3',
        status: 'ready',
        errorMessage: null,
      });

    const { container } = render(
      <RecoilRoot>
        <DocumentSpeech
          ref={speechRef}
          workspace={workspace}
          onActiveSpeechChange={mockActiveSpeechChange}
        />
      </RecoilRoot>,
    );

    await act(async () => {
      speechRef.current?.playFromBlock('block-2');
    });

    await waitFor(() => {
      expect(mockCreateAudio).toHaveBeenCalledWith({
        documentId: 'document-1',
        segmentId: 'segment-2',
        profile: {
          voice: undefined,
          language: null,
          format: 'audio/mpeg',
          rate: null,
        },
      });
    });

    const audioElement = container.querySelector('audio') as HTMLAudioElement | null;
    expect(audioElement).toBeTruthy();

    if (!audioElement) {
      return;
    }

    await act(async () => {
      fireEvent(audioElement, new Event('ended'));
    });

    await waitFor(() => {
      expect(mockCreateAudio).toHaveBeenCalledWith({
        documentId: 'document-1',
        segmentId: 'segment-3',
        profile: {
          voice: undefined,
          language: null,
          format: 'audio/mpeg',
          rate: null,
        },
      });
    });
  });

  it('requests a figure-pause manifest when the toggle is enabled', async () => {
    render(
      <RecoilRoot>
        <DocumentSpeech workspace={workspace} onActiveSpeechChange={mockActiveSpeechChange} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_document_tts_pause_on_figures' }));
    fireEvent.click(screen.getByRole('button', { name: /com_ui_document_tts_play/i }));

    await waitFor(() => {
      expect(mockCreateManifest).toHaveBeenCalledWith({
        documentId: 'document-1',
        renderVersionId: 'render-1',
        startBlockId: null,
        pauseOnFigures: true,
        profile: {
          voice: undefined,
          language: null,
          format: 'audio/mpeg',
          rate: null,
        },
      });
    });
  });

  it('keeps playback speed local and does not send it to the speech API profile', async () => {
    const { container } = render(
      <RecoilRoot>
        <DocumentSpeech workspace={workspace} onActiveSpeechChange={mockActiveSpeechChange} />
      </RecoilRoot>,
    );

    fireEvent.change(screen.getByRole('slider', { name: 'com_ui_document_tts_speed' }), {
      target: { value: '1.6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /com_ui_document_tts_play/i }));

    await waitFor(() => {
      expect(mockCreateManifest).toHaveBeenCalledWith({
        documentId: 'document-1',
        renderVersionId: 'render-1',
        startBlockId: null,
        pauseOnFigures: false,
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

    const audioElement = container.querySelector('audio') as HTMLAudioElement | null;
    expect(audioElement?.playbackRate).toBe(1.6);
  });

  it('resumes paused playback from the current position without rebuilding the segment audio', async () => {
    const { container } = render(
      <RecoilRoot>
        <DocumentSpeech workspace={workspace} onActiveSpeechChange={mockActiveSpeechChange} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: /com_ui_document_tts_play/i }));

    await waitFor(() => {
      expect(mockCreateAudioDownload).toHaveBeenCalledTimes(1);
    });

    const audioElement = container.querySelector('audio') as HTMLAudioElement | null;
    expect(audioElement).toBeTruthy();

    if (!audioElement) {
      return;
    }

    audioElement.currentTime = 9;
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_document_tts_pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_document_tts_resume_reading' }));

    expect(audioElement.currentTime).toBe(9);
    expect(mockCreateManifest).toHaveBeenCalledTimes(1);
    expect(mockCreateAudio).toHaveBeenCalledTimes(1);
    expect(mockCreateAudioDownload).toHaveBeenCalledTimes(1);
  });

  it('jumps to the next chapter from the transport bar', async () => {
    mockCreateManifest.mockResolvedValueOnce({
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
          charEnd: 18,
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
          audio: null,
        },
        {
          segmentId: 'segment-2',
          planId: 'plan-1',
          documentId: 'document-1',
          renderVersionId: 'render-1',
          blockId: 'block-2',
          charStart: 0,
          charEnd: 22,
          segmentIndex: 1,
          segmentKind: 'text',
          sourceText: 'Free energy decreases.',
          sourceContextBefore: '',
          sourceContextAfter: '',
          sourceFingerprint: 'source-2',
          spokenText: 'Free energy decreases.',
          spokenFingerprint: 'spoken-2',
          playbackDirective: 'continue',
          focusBlockId: null,
          resumeToken: null,
          warnings: [],
          narrationModel: null,
          audio: null,
        },
      ],
    });
    mockCreateAudio
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        audioArtifactId: 'audio-2',
        segmentId: 'segment-2',
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
        audioCacheKey: 'cache-2',
        fileId: 'file-2',
        mimeType: 'audio/mpeg',
        durationMs: null,
        alignment: null,
        audioUrl: '/api/documents/document-1/speech/audio/audio-2',
        status: 'ready',
        errorMessage: null,
      });

    render(
      <RecoilRoot>
        <DocumentSpeech workspace={workspace} onActiveSpeechChange={mockActiveSpeechChange} />
      </RecoilRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: /com_ui_document_tts_play/i }));

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

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_document_tts_next_chapter' }));

    await waitFor(() => {
      expect(mockCreateAudio).toHaveBeenCalledWith({
        documentId: 'document-1',
        segmentId: 'segment-2',
        profile: {
          voice: undefined,
          language: null,
          format: 'audio/mpeg',
          rate: null,
        },
      });
    });
  });
});
