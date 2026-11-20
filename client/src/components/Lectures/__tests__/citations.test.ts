import { formatCitations } from '../citations';
it('renders compact numbered links only for verified source identifiers and anchors', () => {
  const citations = [
    { sourceId: 'paper', url: 'https://arxiv.org/html/2602.10067v3#S4', section: 'Results' },
  ];
  expect(
    formatCitations('Evidence [paper#S4], general [paper], unknown [paper#fake].', citations),
  ).toBe(
    'Evidence [1](<https://arxiv.org/html/2602.10067v3#S4>), general [1](<https://arxiv.org/html/2602.10067v3#S4>), unknown [paper#fake].',
  );
  expect(formatCitations('[paper](https://example.org)', citations)).toBe(
    '[paper](https://example.org)',
  );
});
it('never renders an unsafe or malformed saved citation URL', () => {
  expect(
    formatCitations('[bad]', [{ sourceId: 'bad', url: 'javascript:alert(1)', section: 'Bad' }]),
  ).toBe('[bad]');
  expect(formatCitations('[bad]', [{ sourceId: 'bad', url: 'not-a-url', section: 'Bad' }])).toBe(
    '[bad]',
  );
});
