import { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import supersub from 'remark-supersub';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { useRecoilValue } from 'recoil';
import type { PluggableList } from 'unified';
import { code, codeNoExecution, a, p, img } from './MarkdownComponents';
import { CodeBlockProvider, ArtifactProvider } from '~/Providers';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { langSubset, preprocessLaTeX } from '~/utils';
import store from '~/store';

const MarkdownLite = memo(
  ({ content = '', codeExecution = true }: { content?: string; codeExecution?: boolean }) => {
    const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
    const currentContent = useMemo(() => {
      if (!content) {
        return '';
      }
      return LaTeXParsing ? preprocessLaTeX(content) : content;
    }, [content, LaTeXParsing]);

    const rehypePlugins: PluggableList = [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ];

    return (
      <MarkdownErrorBoundary content={content} codeExecution={codeExecution}>
        <ArtifactProvider>
          <CodeBlockProvider>
            <ReactMarkdown
              remarkPlugins={[
                /** @ts-ignore */
                supersub,
                remarkGfm,
                [remarkMath, { singleDollarTextMath: true }],
              ]}
              /** @ts-ignore */
              rehypePlugins={rehypePlugins}
              components={
                {
                  code: codeExecution ? code : codeNoExecution,
                  a,
                  p,
                  img,
                } as {
                  [nodeType: string]: React.ElementType;
                }
              }
            >
              {currentContent}
            </ReactMarkdown>
          </CodeBlockProvider>
        </ArtifactProvider>
      </MarkdownErrorBoundary>
    );
  },
);

export default MarkdownLite;
