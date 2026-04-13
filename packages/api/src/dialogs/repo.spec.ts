import { normalizeReadmeMarkdown, summarizeReadme } from './repo';

describe('dialog repo helpers', () => {
  it('normalizes markdownish html before building README summaries', () => {
    const rawReadme = [
      '<img src="_assets/dag_gflownet.png" align="right" width="40%"/>',
      '',
      'Train DAG GFlowNets with JAX.',
      '',
      'See <a href="https://example.com/docs">the docs</a> for usage details.',
    ].join('\n');

    const normalized = normalizeReadmeMarkdown(rawReadme);
    const summary = summarizeReadme('tristandeleu/jax-dag-gflownet', normalized, ['train.py']);

    expect(normalized).not.toContain('<img');
    expect(normalized).toContain('[the docs](https://example.com/docs)');
    expect(summary).toBe('Train DAG GFlowNets with JAX.');
  });
});
