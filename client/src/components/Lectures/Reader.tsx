import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import type { LectureSource, LectureEvidence } from 'librechat-data-provider';
import {
  createReaderDocument,
  highlightSourceAnchor,
  selectedSourceAnchor,
  sourcePassageUrl,
} from './sanitize';
import { useLectureSourceQuery } from '~/data-provider/Lectures';
import { useLocalize } from '~/hooks';

export default function Reader({
  source,
  evidence,
  onPassage,
  compact = false,
  onEscape,
}: {
  source: LectureSource | undefined;
  evidence: LectureEvidence | undefined;
  onPassage?: (focus: { sourceId: string; anchor: string }) => void;
  compact?: boolean;
  onEscape?: () => void;
}) {
  const localize = useLocalize();
  const query = useLectureSourceQuery(source);
  const frame = useRef<HTMLIFrameElement>(null);
  const removeDocumentHandlers = useRef<(() => void) | null>(null);
  const currentPassage = useRef({ sourceId: source?.id, onPassage, onEscape });
  currentPassage.current = { sourceId: source?.id, onPassage, onEscape };
  const [loadedHtml, setLoadedHtml] = useState('');
  const [matched, setMatched] = useState(false);
  const html = useMemo(
    () => (query.data ? createReaderDocument(query.data.html, query.data.url) : ''),
    [query.data],
  );
  const anchor = evidence?.sourceId === source?.id ? evidence?.anchor : undefined;
  const ready = !!html && loadedHtml === html;
  const errorDetail = isAxiosError<{ error?: string }>(query.error)
    ? query.error.response?.data?.error
    : undefined;
  const anchorStatus = matched
    ? localize('com_ui_lecture_reader_match')
    : localize('com_ui_lecture_reader_missing');
  const passageStatus = anchor ? anchorStatus : localize('com_ui_lecture_reader_no_anchor');
  const focusPassage = useCallback(() => {
    const document = frame.current?.contentDocument;
    setMatched(!!document && !!highlightSourceAnchor(document, anchor));
  }, [anchor]);

  useEffect(() => {
    if (ready) {
      focusPassage();
    }
  }, [ready, focusPassage]);

  useEffect(() => () => removeDocumentHandlers.current?.(), []);

  const onLoad = () => {
    removeDocumentHandlers.current?.();
    const document = frame.current?.contentDocument;
    if (!document) {
      return;
    }
    const openLink = (event: MouseEvent) => {
      const element = event.target instanceof document.defaultView!.Element ? event.target : null;
      const link = element?.closest('a');
      const href = link?.getAttribute('href');
      if (!href) {
        return;
      }
      if (href.startsWith('#')) {
        event.preventDefault();
        try {
          document
            .getElementById(decodeURIComponent(href.slice(1)))
            ?.scrollIntoView({ block: 'start' });
        } catch {
          return;
        }
        return;
      }
      if (!/^https?:\/\//.test(href)) {
        return;
      }
      event.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
    };
    const loadedSourceId = source?.id;
    const selectPassage = () => {
      const current = currentPassage.current;
      if (!loadedSourceId || current.sourceId !== loadedSourceId) {
        return;
      }
      const selectedAnchor = selectedSourceAnchor(document, document.getSelection());
      if (selectedAnchor) {
        current.onPassage?.({ sourceId: loadedSourceId, anchor: selectedAnchor });
      }
    };
    document.addEventListener('click', openLink);
    document.addEventListener('mouseup', selectPassage);
    document.addEventListener('keyup', selectPassage);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        currentPassage.current.onEscape?.();
      }
    };
    document.addEventListener('keydown', escape);
    removeDocumentHandlers.current = () => {
      document.removeEventListener('click', openLink);
      document.removeEventListener('mouseup', selectPassage);
      document.removeEventListener('keyup', selectPassage);
      document.removeEventListener('keydown', escape);
    };
    setLoadedHtml(html);
    focusPassage();
  };

  if (!source) {
    return (
      <div className="p-8 text-sm text-text-secondary">
        {localize('com_ui_lecture_reader_empty')}
      </div>
    );
  }

  return (
    <section
      className={
        compact
          ? 'lecture-reader'
          : 'flex h-full min-h-[480px] flex-col overflow-hidden rounded-xl border border-border-medium bg-surface-primary'
      }
      aria-label={source.title}
    >
      {!compact && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border-medium px-4 py-3 text-sm">
          <h2 className="min-w-0 flex-1 font-semibold">{source.title}</h2>
          <a
            className="underline underline-offset-4"
            href={sourcePassageUrl(source.url, anchor)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {localize('com_ui_lecture_reader_original')}
          </a>
          <button
            type="button"
            className="rounded-md border border-border-medium px-2 py-1 disabled:opacity-50"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            {localize('com_ui_lecture_reader_retry')}
          </button>
        </div>
      )}
      {query.isError && (
        <p role="alert" className="p-4 text-sm text-red-600">
          {localize('com_ui_lecture_reader_error')}
          {typeof errorDetail === 'string' && ` ${errorDetail.slice(0, 500)}`}
          {compact && (
            <button
              className="ml-3 underline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {localize('com_ui_lecture_reader_retry')}
            </button>
          )}
        </p>
      )}
      {!query.isError && !ready && (
        <p role="status" className="p-4 text-sm text-text-secondary">
          {localize('com_ui_lecture_reader_loading')}
        </p>
      )}
      {ready && (!compact || anchor) && (
        <div
          role="status"
          className="flex items-center gap-3 border-b border-border-medium px-4 py-2 text-sm text-text-secondary"
        >
          <span>
            {passageStatus}
            {matched && evidence?.section ? `: ${evidence.section}` : ''}
          </span>
          {matched && (
            <button
              type="button"
              className="ml-auto shrink-0 underline underline-offset-4"
              onClick={focusPassage}
            >
              {localize('com_ui_lecture_reader_position')}
            </button>
          )}
        </div>
      )}
      {ready && onPassage && !compact && (
        <p className="border-b border-border-medium px-4 py-2 text-sm text-text-secondary">
          {localize('com_ui_lecture_reader_select')}
        </p>
      )}
      {html && (
        <iframe
          key={query.data?.url}
          ref={frame}
          title={localize('com_ui_lecture_reader_frame')}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          srcDoc={html}
          onLoad={onLoad}
          className={
            compact
              ? 'min-h-0 w-full flex-1 border-0 bg-[#fffdf8]'
              : 'min-h-[480px] w-full flex-1 border-0 bg-[#fffdf8]'
          }
        />
      )}
    </section>
  );
}
