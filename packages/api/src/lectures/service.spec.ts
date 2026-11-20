import type { Lecture } from 'librechat-data-provider';
import { lectureAskSchema, lectureNotesSchema, lectureSchema } from './schema';
import { parseSource } from './source';
import * as sourceModule from './source';
import * as codexModule from './codex';
import {
  askLecture,
  buildLectureContext,
  extractLectureTakeaways,
  resolveEvidence,
  resolveQuestionEvidence,
  validateLectureAnswer,
} from './service';

const lecture: Lecture = {
  id: 'lecture',
  title: 'Study',
  videoId: '_egu7OFem-k',
  description: '',
  duration: 60,
  sources: [{ id: 'paper', title: 'Paper', url: 'https://example.com/paper' }],
  moments: [
    {
      id: 'moment',
      start: 0,
      end: 60,
      title: 'Probe',
      explanation: '',
      technical: '',
      question: '',
      checkpoint: false,
      evidence: [
        {
          sourceId: 'paper',
          anchor: 'actual',
          section: 'Untrusted claimed heading',
          why: 'Example',
        },
      ],
    },
  ],
};

describe('lecture evidence verification', () => {
  it('uses retrieved passage content and source headings instead of client descriptions', () => {
    const source = parseSource(
      '<article><h1>Measured results</h1><p id="actual">This is the actual source passage describing an experiment with a held-out test set.</p></article>',
      lecture.sources[0],
    );
    const evidence = resolveEvidence(lecture, 'moment', [source]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].passage.section).toBe('Measured results');
    expect(evidence[0].url).toBe('https://example.com/paper#actual');
  });
  it('never creates citations for missing sources or invented anchors', () => {
    expect(resolveEvidence(lecture, 'moment', [])).toEqual([]);
    const source = parseSource(
      '<article><p id="different">This is a sufficiently long real passage, but the claimed anchor does not exist in this article.</p></article>',
      lecture.sources[0],
    );
    expect(resolveEvidence(lecture, 'moment', [source])).toEqual([]);
  });
  it('focuses on the selected real passage and refuses an invented selection', () => {
    const source = parseSource(
      '<article><h1>Selected material</h1><p id="selected">The learner selected this real paper passage outside the current lecture moment evidence.</p></article>',
      lecture.sources[0],
    );
    expect(
      resolveEvidence(lecture, 'moment', [source], { sourceId: 'paper', anchor: 'selected' })[0]
        .passage.text,
    ).toContain('learner selected');
    expect(() =>
      resolveEvidence(lecture, 'moment', [source], { sourceId: 'paper', anchor: 'invented' }),
    ).toThrow('could not be verified');
    expect(() =>
      resolveEvidence(lecture, 'moment', [source], { sourceId: 'foreign', anchor: 'selected' }),
    ).toThrow('not part of this lecture');
  });
  it('links reader-assigned paragraph anchors to the original page without a nonexistent fragment', () => {
    const source = parseSource(
      '<article><p>This paragraph has no publisher ID, so its reader anchor is assigned by the study service.</p></article>',
      lecture.sources[0],
    );
    const evidence = resolveEvidence(lecture, 'moment', [source], {
      sourceId: 'paper',
      anchor: source.passages[0].anchor,
    });
    expect(evidence[0].passage.originalAnchor).toBe(false);
    expect(evidence[0].url).toBe('https://example.com/paper');
  });
  it('rejects manifests with nonexistent source IDs or invalid durations', () => {
    expect(
      lectureSchema.safeParse({ ...lecture, sources: [{ ...lecture.sources[0], id: 'other' }] })
        .success,
    ).toBe(false);
    expect(lectureSchema.safeParse({ ...lecture, duration: 20 }).success).toBe(false);
  });
  it('rejects overlapping imported intervals and allows leading gaps', () => {
    expect(
      lectureSchema.safeParse({ ...lecture, moments: [{ ...lecture.moments[0], start: 5 }] })
        .success,
    ).toBe(true);
    expect(
      lectureSchema.safeParse({
        ...lecture,
        moments: [lecture.moments[0], { ...lecture.moments[0], id: 'second', start: 40 }],
      }).success,
    ).toBe(false);
  });
});

describe('selected source exploration', () => {
  const selectedLecture: Lecture = {
    ...lecture,
    sources: [
      ...lecture.sources,
      { id: 'selected', title: 'Selected paper', url: 'https://example.com/selected' },
    ],
  };
  const selectedPaper = parseSource(
    '<article><h1>Selected paper</h1><h2>Representation</h2><p id="focus">The activation representation describes an internal state, distinct from an experimental outcome.</p><h2>Experimental methods</h2><p id="setup">The researchers compared a targeted activation intervention with a matched control on held-out examples.</p><h2>Results</h2><p id="result">The intervention raised the measured accuracy from 52 to 68 percent on the selected task.</p><h2>History</h2><p id="unrelated">Early astronomers recorded the positions of stars in a catalogue many centuries before neural networks.</p></article>',
    selectedLecture.sources[1],
  );
  const unselectedPaper = parseSource(
    '<article><p id="actual">This is a moment-mapped passage in the other paper and should not appear in selected-source exploration.</p></article>',
    lecture.sources[0],
  );

  it('retrieves from a selected paper without any moment-to-source mapping', () => {
    const contexts = resolveQuestionEvidence(
      selectedLecture,
      'moment',
      [unselectedPaper, selectedPaper],
      'What was the experimental setup and what were the outcomes?',
      'selected',
    );
    expect(contexts.map((context) => context.key)).toEqual(
      expect.arrayContaining(['selected#setup', 'selected#result']),
    );
    expect(contexts.every((context) => context.sourceId === 'selected')).toBe(true);
    expect(contexts.some((context) => context.key === 'selected#unrelated')).toBe(false);
  });

  it('keeps the selected real passage first while retrieving broader experiment evidence', () => {
    const contexts = resolveQuestionEvidence(
      selectedLecture,
      'moment',
      [selectedPaper],
      'How was the experiment set up and what were the outcomes?',
      'selected',
      { sourceId: 'selected', anchor: 'focus' },
    );
    expect(contexts[0].key).toBe('selected#focus');
    expect(contexts.map((context) => context.key)).toContain('selected#result');
  });

  it('bounds serialized evidence as well as passage text when source metadata is long', () => {
    const longSource = {
      ...selectedLecture.sources[1],
      title: 'T'.repeat(400),
      url: `https://example.com/${'a'.repeat(1800)}`,
    };
    const longPaper = parseSource(
      `<article><h1>${longSource.title}</h1><h2>Results ${'r'.repeat(450)}</h2>${Array.from(
        { length: 30 },
        (_, index) =>
          `<p id="result-${index}">Trial ${index}: The measured accuracy improved after the intervention compared against a matched baseline.</p>`,
      ).join('')}</article>`,
      longSource,
    );
    const contexts = resolveQuestionEvidence(
      { ...selectedLecture, sources: [longSource] },
      'moment',
      [longPaper],
      'What were the measured results?',
      'selected',
    );
    expect(contexts.length).toBeGreaterThan(0);
    expect(JSON.stringify(contexts).length).toBeLessThanOrEqual(30000);
    expect(contexts.every((context) => context.passage.text.length >= 45)).toBe(true);
  });

  it('rejects a fabricated focus even if the rest of the source could answer', () => {
    expect(() =>
      resolveQuestionEvidence(selectedLecture, 'moment', [selectedPaper], 'Results?', 'selected', {
        sourceId: 'selected',
        anchor: 'fabricated',
      }),
    ).toThrow('could not be verified');
  });

  it('validates source-only selections and requires any focus to belong to the same paper', async () => {
    const request = {
      lecture: selectedLecture,
      momentId: 'moment',
      question: 'What did the experiment show?',
      sourceId: 'selected',
    };
    expect(lectureAskSchema.safeParse(request).success).toBe(true);
    expect(lectureAskSchema.safeParse({ ...request, sourceId: 'foreign' }).success).toBe(false);
    expect(
      lectureAskSchema.safeParse({
        ...request,
        focus: { sourceId: 'paper', anchor: 'actual' },
      }).success,
    ).toBe(false);
    await expect(askLecture({ ...request, sourceId: 'foreign' })).rejects.toThrow(
      'not part of this lecture',
    );
  });

  it('retrieves source-wide context without sending prewritten moment notes to the source explorer', async () => {
    jest.spyOn(sourceModule, 'retrieveSource').mockResolvedValue(selectedPaper);
    const context = await buildLectureContext({
      lecture: {
        ...selectedLecture,
        moments: [{ ...selectedLecture.moments[0], explanation: 'Stale authored material.' }],
      },
      momentId: 'moment',
      question: 'What was the experimental setup and what were the outcomes?',
      sourceId: 'selected',
    });
    expect(sourceModule.retrieveSource).toHaveBeenCalledTimes(1);
    expect(sourceModule.retrieveSource).toHaveBeenCalledWith(selectedLecture.sources[1], undefined);
    const prompt = context.messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('matched control');
    expect(prompt).toContain('52 to 68 percent');
    expect(prompt).not.toContain('Stale authored material.');
    expect(prompt).not.toContain('untrustedAuthoredNotes');
    expect(prompt).toContain('under 250 words');
    expect(context.missingSources).toBe(0);
  });

  it('uses the subscription adapter by default and returns verified typed-answer takeaways', async () => {
    const previous = process.env.LECTURE_MODEL_PROVIDER;
    delete process.env.LECTURE_MODEL_PROVIDER;
    try {
      jest.spyOn(sourceModule, 'retrieveSource').mockResolvedValue(selectedPaper);
      const complete = jest.spyOn(codexModule, 'completeCodexJson').mockResolvedValue(
        JSON.stringify({
          answer: 'The intervention improved accuracy on this task. [selected]',
          citationKeys: ['selected#result'],
          takeaways: ['The measured task accuracy increased from 52 to 68 percent.'],
        }),
      );
      const result = await askLecture({
        lecture: selectedLecture,
        momentId: 'moment',
        question: 'What were the outcomes?',
        sourceId: 'selected',
      });
      expect(complete).toHaveBeenCalledTimes(1);
      expect(result.takeaways).toEqual([
        'The measured task accuracy increased from 52 to 68 percent.',
      ]);
      expect(result.citations[0].url).toBe('https://example.com/selected#result');
    } finally {
      if (previous === undefined) delete process.env.LECTURE_MODEL_PROVIDER;
      else process.env.LECTURE_MODEL_PROVIDER = previous;
    }
  });

  it('propagates a subscription failure without silently falling back to an API request', async () => {
    const previous = process.env.LECTURE_MODEL_PROVIDER;
    delete process.env.LECTURE_MODEL_PROVIDER;
    try {
      jest.spyOn(sourceModule, 'retrieveSource').mockResolvedValue(selectedPaper);
      const failure = new Error('Subscription unavailable.');
      const complete = jest.spyOn(codexModule, 'completeCodexJson').mockRejectedValue(failure);
      await expect(
        askLecture({
          lecture: selectedLecture,
          momentId: 'moment',
          sourceId: 'selected',
          question: 'What were the outcomes?',
        }),
      ).rejects.toBe(failure);
      expect(complete).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.LECTURE_MODEL_PROVIDER;
      else process.env.LECTURE_MODEL_PROVIDER = previous;
    }
  });

  it('refuses fabricated citations and real but unretrieved irrelevant passages', () => {
    const contexts = resolveQuestionEvidence(
      selectedLecture,
      'moment',
      [selectedPaper],
      'What were the outcomes?',
      'selected',
    );
    for (const key of ['selected#fabricated', 'selected#unrelated', 'paper#actual']) {
      expect(() =>
        validateLectureAnswer({ answer: 'An answer.', citationKeys: [key] }, contexts),
      ).toThrow('unverified passage');
    }
    expect(() =>
      validateLectureAnswer(
        {
          answer: 'A [fabricated link](https://example.com/fake).',
          citationKeys: ['selected#result'],
        },
        contexts,
      ),
    ).toThrow('unverified citation link');
    expect(() =>
      validateLectureAnswer(
        { answer: 'A fabricated inline source label. [paper]', citationKeys: ['selected#result'] },
        contexts,
      ),
    ).toThrow('uncited source');
    expect(
      validateLectureAnswer(
        {
          answer: 'The toy vector $[x]$ and code `a[0]` are illustrations. [selected]',
          citationKeys: ['selected#result'],
        },
        contexts,
      ).citations,
    ).toHaveLength(1);
  });

  it('returns bounded factual takeaways alongside the existing verified answer and citations', () => {
    const contexts = resolveQuestionEvidence(
      selectedLecture,
      'moment',
      [selectedPaper],
      'What were the outcomes?',
      'selected',
    );
    const response = {
      answer: 'On this task, the intervention raised accuracy from 52 to 68 percent. [selected]',
      citationKeys: ['selected#result'],
      takeaways: ['The measured accuracy increased on the selected task.'],
    };
    expect(validateLectureAnswer(response, contexts)).toEqual({
      answer: response.answer,
      citations: [
        { sourceId: 'selected', url: 'https://example.com/selected#result', section: 'Results' },
      ],
      takeaways: response.takeaways,
    });
    expect(
      validateLectureAnswer({ ...response, takeaways: undefined }, contexts),
    ).not.toHaveProperty('takeaways');
    for (const takeaways of [[], [''], ['a'.repeat(301)], ['One', 'Two', 'Three', 'Four']]) {
      expect(() => validateLectureAnswer({ ...response, takeaways }, contexts)).toThrow(
        'invalid answer format',
      );
    }
    expect(() => validateLectureAnswer({ ...response, citationKeys: [] }, contexts)).toThrow(
      'without supporting passages',
    );
  });

  it('extracts grounded takeaways from a completed conversation without adding claims about mastery', async () => {
    const previous = process.env.LECTURE_MODEL_PROVIDER;
    delete process.env.LECTURE_MODEL_PROVIDER;
    try {
      jest.spyOn(sourceModule, 'retrieveSource').mockResolvedValue(selectedPaper);
      const complete = jest.spyOn(codexModule, 'completeCodexJson').mockResolvedValue(
        JSON.stringify({
          takeaways: ['The intervention was compared against a matched control.'],
          citationKeys: ['selected#setup'],
        }),
      );
      const request = {
        lecture: selectedLecture,
        momentId: 'moment',
        sourceId: 'selected',
        question: 'How was the experiment controlled?',
        answer: 'They compared the targeted intervention with a matched control.',
      };
      await expect(extractLectureTakeaways(request)).resolves.toEqual({
        takeaways: ['The intervention was compared against a matched control.'],
      });
      const prompt = complete.mock.calls[0][0].map((message) => message.content).join('\n');
      expect(prompt).toContain('omit claims');
      expect(prompt).toContain('learner mastering or understanding');
      expect(prompt).toContain(request.answer);
      complete.mockResolvedValue(JSON.stringify({ takeaways: [], citationKeys: [] }));
      await expect(extractLectureTakeaways(request)).resolves.toEqual({ takeaways: [] });
      complete.mockResolvedValue(
        JSON.stringify({
          takeaways: ['An unsupported fact.'],
          citationKeys: ['selected#invented'],
        }),
      );
      await expect(extractLectureTakeaways(request)).rejects.toThrow('unverified passage');
    } finally {
      if (previous === undefined) delete process.env.LECTURE_MODEL_PROVIDER;
      else process.env.LECTURE_MODEL_PROVIDER = previous;
    }
  });

  it('bounds note extraction input and refuses a source absent from the lecture', () => {
    const request = {
      lecture: selectedLecture,
      momentId: 'moment',
      sourceId: 'selected',
      question: 'What happened?',
      answer: 'A short answer.',
    };
    expect(lectureNotesSchema.safeParse(request).success).toBe(true);
    expect(lectureNotesSchema.safeParse({ ...request, answer: 'x'.repeat(18001) }).success).toBe(
      false,
    );
    expect(lectureNotesSchema.safeParse({ ...request, question: 'x'.repeat(4001) }).success).toBe(
      false,
    );
    expect(lectureNotesSchema.safeParse({ ...request, sourceId: 'foreign' }).success).toBe(false);
  });
});
