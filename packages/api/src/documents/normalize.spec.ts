import { normalizeDocumentText } from './normalize';

describe('document normalize', () => {
  it('turns dense labeled textbook text into a labeled heading plus paragraph body', () => {
    const result = normalizeDocumentText({
      documentId: 'document-1',
      projectId: 'project-1',
      sourceFileId: 'file-1',
      sourceMimeType: 'text/plain',
      sourceFilename: 'manifolds.pdf',
      sourcePath: 'document_parser',
      title: 'Manifolds',
      text: [
        'Definitions 1.1 Let M be a topological space. A covering of M is a collection of open subsets whose union is M, and this sentence keeps the parser output dense enough to trigger the textbook normalization path without leaving the whole definition trapped inside a giant heading block.',
      ].join('\n'),
      renderVersion: 1,
    });

    expect(result.sourceKind).toBe('pdf');
    expect(result.ingestionStrategy).toBe('document_parser');

    const definitionHeading = result.ir.blocks.find(
      (block) => block.type === 'heading' && block.title === 'Definition 1.1',
    );
    const definitionParagraph = result.ir.blocks.find(
      (block) =>
        block.type === 'paragraph' &&
        block.plainText.startsWith('Let M be a topological space.'),
    );
    const oversizedHeading = result.ir.blocks.find(
      (block) => block.type === 'heading' && block.title?.startsWith('1.1 Let M be'),
    );

    expect(definitionHeading).toBeTruthy();
    expect(definitionParagraph).toBeTruthy();
    expect(oversizedHeading).toBeUndefined();
  });

  it('does not turn in-sentence structural references into fake headings', () => {
    const result = normalizeDocumentText({
      documentId: 'document-2',
      projectId: 'project-1',
      sourceFileId: 'file-2',
      sourceMimeType: 'text/plain',
      sourceFilename: 'manifolds.pdf',
      sourcePath: 'document_parser',
      title: 'Manifolds',
      text: [
        'Remark 1.4 In the present book, we use parametrisations of surfaces in order to keep them consistent with the fact that the coordinate neighbourhoods defined in Definitions 1.1 above are open subsets of the relevant surface, and this sentence stays long enough to exercise the dense textbook parser branch.',
      ].join('\n'),
      renderVersion: 1,
    });

    const fakeDefinitionReference = result.ir.blocks.find(
      (block) => block.type === 'heading' && block.title === 'Definition 1.1',
    );

    expect(fakeDefinitionReference).toBeUndefined();
  });

  it('converts OCR figure captions into figure blocks and folds table captions into tables', () => {
    const result = normalizeDocumentText({
      documentId: 'document-3',
      projectId: 'project-1',
      sourceFileId: 'file-3',
      sourceMimeType: 'application/pdf',
      sourceFilename: 'figures.pdf',
      sourcePath: 'mistral_ocr',
      title: 'Figures',
      text: [
        '# PAGE 1',
        'Figure 1: A simple flow diagram.',
        '',
        'Table 1: Evaluation metrics.',
        '',
        '| Metric | Value |',
        '| --- | --- |',
        '| Accuracy | 0.91 |',
      ].join('\n'),
      ocrPages: [
        {
          index: 0,
          dimensions: {
            dpi: 300,
            height: 1000,
            width: 800,
          },
          images: [
            {
              id: 'figure-1',
              topLeftX: 10,
              topLeftY: 20,
              bottomRightX: 410,
              bottomRightY: 420,
              imageBase64: 'ZmFrZS1pbWFnZQ==',
              imageAnnotation: 'A simple flow diagram.',
            },
          ],
        },
      ],
      renderVersion: 1,
    });

    const figureBlock = result.ir.blocks.find((block) => block.type === 'figure');
    const tableBlock = result.ir.blocks.find((block) => block.type === 'table');

    expect(figureBlock).toMatchObject({
      type: 'figure',
      assetId: expect.stringContaining('ocr-figure-1-1'),
    });
    expect(figureBlock?.plainText).toBe('Figure 1: A simple flow diagram.');
    expect(tableBlock?.contentMarkdown).toContain('Table 1: Evaluation metrics.');
    expect(result.ir.blocks.some((block) => block.type === 'paragraph' && /Figure 1:/i.test(block.plainText))).toBe(false);
    expect(result.ir.assets).toEqual([
      expect.objectContaining({
        assetId: expect.stringContaining('ocr-figure-1-1'),
        source: 'ocr_page_image',
        pageNumber: 1,
        imageIndex: 1,
      }),
    ]);
  });

  it('decodes OCR html entities inside math blocks', () => {
    const result = normalizeDocumentText({
      documentId: 'document-4',
      projectId: 'project-1',
      sourceFileId: 'file-4',
      sourceMimeType: 'application/pdf',
      sourceFilename: 'math.pdf',
      sourcePath: 'mistral_ocr',
      title: 'Math',
      text: ['# PAGE 1', '$$', "\\forall s' &gt; s_0 &amp; s' &lt; s_f", '$$'].join('\n'),
      renderVersion: 1,
    });

    const mathBlock = result.ir.blocks.find((block) => block.type === 'math_block');
    expect(mathBlock?.contentMarkdown).toContain("\\forall s' > s_0 \\\\& s' < s_f");
  });

  it('turns standalone OCR latex paragraphs into math blocks', () => {
    const result = normalizeDocumentText({
      documentId: 'document-5',
      projectId: 'project-1',
      sourceFileId: 'file-5',
      sourceMimeType: 'application/pdf',
      sourceFilename: 'equations.pdf',
      sourcePath: 'mistral_ocr',
      title: 'Equations',
      text: ['# PAGE 1', "\\forall s' &gt; s_0, \\hat{F}(s') = \\sum_{u \\in \\text{Par}(s')} F(u, s')", '(23)'].join('\n'),
      renderVersion: 1,
    });

    const mathBlock = result.ir.blocks.find((block) => block.type === 'math_block');
    expect(mathBlock?.contentMarkdown).toContain("$$\n\\forall s' > s_0, \\hat{F}(s') = \\sum_{u \\in \\text{Par}(s')} F(u, s')\n(23)\n$$");
  });

  it('keeps prose paragraphs with inline math as paragraphs', () => {
    const result = normalizeDocumentText({
      documentId: 'document-5b',
      projectId: 'project-1',
      sourceFileId: 'file-5b',
      sourceMimeType: 'application/pdf',
      sourceFilename: 'inline-math.pdf',
      sourcePath: 'mistral_ocr',
      title: 'Inline Math',
      text: ['# PAGE 1', '(i) $\\\\bigcup_{\\\\alpha \\\\in A} U_{\\\\alpha} = M$'].join('\n'),
      renderVersion: 1,
    });

    expect(
      result.ir.blocks.find(
        (block) =>
          block.type === 'paragraph' &&
          block.contentMarkdown.includes('$\\\\bigcup_{\\\\alpha \\\\in A} U_{\\\\alpha} = M$'),
      ),
    ).toBeTruthy();
    expect(result.ir.blocks.some((block) => block.type === 'math_block')).toBe(false);
  });

  it('turns standalone table captions into inline figure blocks when OCR only has page snapshots', () => {
    const result = normalizeDocumentText({
      documentId: 'document-6',
      projectId: 'project-1',
      sourceFileId: 'file-6',
      sourceMimeType: 'application/pdf',
      sourceFilename: 'tables.pdf',
      sourcePath: 'mistral_ocr',
      title: 'Tables',
      text: ['# PAGE 1', 'Table 2: Ablation comparison across tasks.'].join('\n'),
      ocrPages: [
        {
          index: 0,
          dimensions: {
            dpi: 200,
            height: 1000,
            width: 800,
          },
          images: [
            {
              id: 'page-snapshot-1',
              topLeftX: 0,
              topLeftY: 0,
              bottomRightX: 800,
              bottomRightY: 1000,
              imageBase64: 'ZmFrZS10YWJsZS1pbWFnZQ==',
              reusable: true,
            },
          ],
        },
      ],
      renderVersion: 1,
    });

    const figureBlock = result.ir.blocks.find((block) => block.type === 'figure');
    expect(figureBlock).toMatchObject({
      type: 'figure',
      plainText: 'Table 2: Ablation comparison across tasks.',
      assetId: expect.stringContaining('page-snapshot-1'),
    });
  });

  it('maps OCR image placeholders to figure blocks before falling back to caption heuristics', () => {
    const result = normalizeDocumentText({
      documentId: 'document-7',
      projectId: 'project-1',
      sourceFileId: 'file-7',
      sourceMimeType: 'application/pdf',
      sourceFilename: 'placeholder-figures.pdf',
      sourcePath: 'mistral_ocr',
      title: 'Placeholder Figures',
      text: ['# PAGE 1', '![img-0.jpeg](img-0.jpeg)', '', 'Figure 1: Mode exploration.'].join('\n'),
      ocrPages: [
        {
          index: 0,
          dimensions: {
            dpi: 200,
            height: 1000,
            width: 800,
          },
          images: [
            {
              id: 'img-0.jpeg',
              topLeftX: 10,
              topLeftY: 20,
              bottomRightX: 410,
              bottomRightY: 420,
              imageBase64: 'ZmFrZS1wbGFjZWhvbGRlci1pbWFnZQ==',
            },
          ],
        },
      ],
      renderVersion: 1,
    });

    const figureBlocks = result.ir.blocks.filter((block) => block.type === 'figure');
    const paragraphBlocks = result.ir.blocks.filter((block) => block.type === 'paragraph');

    expect(figureBlocks).toHaveLength(1);
    expect(figureBlocks[0]).toMatchObject({
      type: 'figure',
      plainText: 'Figure 1: Mode exploration.',
      assetId: expect.stringContaining('img-0.jpeg'),
    });
    expect(
      paragraphBlocks.some((block) => block.contentMarkdown.includes('![img-0.jpeg](img-0.jpeg)')),
    ).toBe(false);
    expect(result.ir.assets).toEqual([
      expect.objectContaining({
        assetId: expect.stringContaining('img-0.jpeg'),
        ocrImageId: 'img-0.jpeg',
      }),
    ]);
  });

  it('folds trailing figure captions into the preceding same-page figure block', () => {
    const result = normalizeDocumentText({
      documentId: 'document-8',
      projectId: 'project-1',
      sourceFileId: 'file-8',
      sourceMimeType: 'application/pdf',
      sourceFilename: 'subfigures.pdf',
      sourcePath: 'mistral_ocr',
      title: 'Subfigures',
      text: [
        '# PAGE 1',
        '![img-0.jpeg](img-0.jpeg)',
        '',
        '(a) Distribution of formation energy term',
        '',
        '![img-1.jpeg](img-1.jpeg)',
        '',
        '(b) Distribution of density term',
        '',
        'Figure 9: The distribution of structures sampled by four models.',
      ].join('\n'),
      ocrPages: [
        {
          index: 0,
          dimensions: {
            dpi: 200,
            height: 1000,
            width: 800,
          },
          images: [
            {
              id: 'img-0.jpeg',
              topLeftX: 10,
              topLeftY: 20,
              bottomRightX: 410,
              bottomRightY: 420,
              imageBase64: 'ZmFrZS1maWd1cmUtMQ==',
            },
            {
              id: 'img-1.jpeg',
              topLeftX: 420,
              topLeftY: 20,
              bottomRightX: 780,
              bottomRightY: 420,
              imageBase64: 'ZmFrZS1maWd1cmUtMg==',
            },
          ],
        },
      ],
      renderVersion: 1,
    });

    const figureBlocks = result.ir.blocks.filter((block) => block.type === 'figure');

    expect(figureBlocks).toHaveLength(2);
    expect(figureBlocks[1]?.plainText).toContain('(b) Distribution of density term');
    expect(figureBlocks[1]?.plainText).toContain(
      'Figure 9: The distribution of structures sampled by four models.',
    );
    expect(
      result.ir.blocks.some(
        (block) => block.type === 'paragraph' && /^Figure 9:/i.test(block.plainText.trim()),
      ),
    ).toBe(false);
  });
});
