import type { IDocumentRenderVersion, IStudyDocument } from '@librechat/data-schemas';
import { buildDocumentSpeechPlan } from './planner';

describe('document speech planner', () => {
  const document: IStudyDocument = {
    documentId: 'document-1',
    projectId: 'project-1',
    sourceFileId: 'file-1',
    title: 'Flow Matching Notes',
    sourceMimeType: 'application/pdf',
    sourceKind: 'pdf',
    ingestionStatus: 'ready',
    ingestionStrategy: 'ocr_markdown',
    activeRenderVersionId: 'render-1',
    activeOverlayId: 'overlay-1',
    createdByUserId: 'user-1',
  };

  const renderVersion: IDocumentRenderVersion = {
    renderVersionId: 'render-1',
    documentId: 'document-1',
    versionNumber: 1,
    documentIrJson: {
      documentId: 'document-1',
      projectId: 'project-1',
      sourceFileId: 'file-1',
      sourceType: 'application/pdf',
      title: 'Flow Matching Notes',
      blocks: [
        {
          blockId: 'block-1',
          type: 'paragraph',
          level: null,
          title: null,
          sourcePageStart: 1,
          sourcePageEnd: 1,
          contentMarkdown: 'Let $F(s)$ be a flow on the graph.',
          contentHtml: null,
          plainText: 'Let F(s) be a flow on the graph.',
          anchorPath: 'block:block-1',
          assetId: null,
        },
        {
          blockId: 'block-2',
          type: 'math_block',
          level: null,
          title: null,
          sourcePageStart: 1,
          sourcePageEnd: 1,
          contentMarkdown: '\\[ F(s) = \\sum_{s\\prime \\in \\mathrm{Par}(s)} F(s\\prime \\to s) \\]',
          contentHtml: null,
          plainText: 'F(s) = sum over parents of s.',
          anchorPath: 'block:block-2',
          assetId: null,
        },
      ],
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
  };

  it('creates continue, pause, and resume segments for display math handoff', async () => {
    const plan = await buildDocumentSpeechPlan({
      document,
      pauseOnFigures: false,
      renderVersion,
      narrationModel: 'gpt-4o-mini',
      runNarrationModel: async (messages) => {
        const prompt = messages[0]?.content;
        if (typeof prompt === 'string' && prompt.includes('display equation')) {
          return JSON.stringify({
            mode: 'handoff',
            prePauseText: 'The next equation gives the conservation rule.',
            equationNarration: '',
            handoffText: 'Take a moment to inspect it visually.',
            resumeText: 'Then we can continue with the proof.',
            focusBlockId: 'block-2',
          });
        }

        return JSON.stringify({
          spoken_text: 'Let F of s be a flow on the graph.',
        });
      },
    });

    expect(plan.segments.map((segment) => segment.segmentKind)).toEqual([
      'math_inline_rewrite',
      'math_block_narration',
      'pause_for_visual',
      'resume_after_pause',
    ]);
    expect(plan.segments[1].spokenText).toContain('Take a moment to inspect it visually.');
    expect(plan.segments[2].focusBlockId).toBe('block-2');
    expect(plan.segments[2].playbackDirective).toBe('pause_for_visual');
    expect(plan.segments[3].spokenText).toBe('Then we can continue with the proof.');
  });

  it('adds a visual pause after figure blocks when pause-on-figures is enabled', async () => {
    const figureRenderVersion: IDocumentRenderVersion = {
      ...renderVersion,
      documentIrJson: {
        ...renderVersion.documentIrJson,
        blocks: [
          {
            blockId: 'block-figure',
            type: 'figure',
            level: null,
            title: null,
            sourcePageStart: 1,
            sourcePageEnd: 1,
            contentMarkdown: 'Figure 1: Crystal mode exploration.',
            contentHtml: null,
            plainText: 'Figure 1: Crystal mode exploration.',
            anchorPath: 'block:block-figure',
            assetId: 'asset-1',
          },
        ],
        assets: [
          {
            assetId: 'asset-1',
            annotation: 'A chart showing crystal modes over training.',
          },
        ],
      },
      assetsJson: [
        {
          assetId: 'asset-1',
          annotation: 'A chart showing crystal modes over training.',
        },
      ],
    };

    const plan = await buildDocumentSpeechPlan({
      document,
      pauseOnFigures: true,
      renderVersion: figureRenderVersion,
      narrationModel: 'gpt-4o-mini',
      runNarrationModel: async () => '',
    });

    expect(plan.segments.map((segment) => segment.segmentKind)).toEqual([
      'figure_summary',
      'pause_for_visual',
    ]);
    expect(plan.segments[0].spokenText).toContain('Please inspect the figure in the document.');
    expect(plan.segments[1].focusBlockId).toBe('block-figure');
  });
});
