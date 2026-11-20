import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, ArrowUpRight, Send, Mic, Square, X, Trash2 } from 'lucide-react';
import type {
  Lecture,
  LectureEvidence,
  LectureMessage,
  LectureNote,
  LectureSource,
} from 'librechat-data-provider';
import type { Options } from 'react-markdown';
import type { ComponentType } from 'react';
import {
  useLectureAskMutation,
  useLectureNotesMutation,
  useLectureVoiceStatusQuery,
} from '~/data-provider/Lectures';
import { useLocalize } from '~/hooks';
import useLiveConversation from './useLiveConversation';
import useConversation from './useConversation';
import { lectureError } from './error';
import { timestamp as formatTime } from './timeline';
import Reader from './Reader';
import { formatCitations } from './citations';

const Markdown = ReactMarkdown as ComponentType<Options>;

type ExplorerProps = {
  lecture: Lecture;
  timestamp: number;
  momentId: string;
  source: LectureSource;
  evidence?: LectureEvidence;
  notes: LectureNote[];
  onClose: () => void;
  onSave: (note: LectureNote) => void;
  onEdit: (id: string, takeaways: string[], automatic?: boolean) => void;
  onRemove: (id: string) => void;
};

function Answer({
  children,
  citations = [],
}: {
  children: string;
  citations?: LectureNote['citations'];
}) {
  const content = useMemo(() => formatCitations(children, citations), [children, citations]);
  return (
    <div className="lecture-answer">
      <Markdown
        components={{
          a: ({ children: text, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {text}
            </a>
          ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

export default function Explorer({
  lecture,
  timestamp,
  momentId,
  source,
  evidence,
  notes,
  onClose,
  onSave,
  onEdit,
  onRemove,
}: ExplorerProps) {
  const localize = useLocalize();
  const ask = useLectureAskMutation();
  const extract = useLectureNotesMutation();
  const capability = useLectureVoiceStatusQuery();
  const [tab, setTab] = useState<'conversation' | 'notes'>('conversation');
  const [question, setQuestion] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<{ sourceId: string; anchor: string }>();
  const [mobilePane, setMobilePane] = useState<'paper' | 'tutor'>('paper');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSave, onEdit });
  callbacks.current = { onSave, onEdit };
  const saved = useMemo(
    () =>
      notes.filter(
        (note) => note.sourceId === source.id && Math.abs(note.timestamp - timestamp) < 1,
      ),
    [notes, source.id, timestamp],
  );
  const sessionNotes = useRef(saved);
  sessionNotes.current = saved;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (tab === 'notes') {
      if (panel.current) {
        panel.current.scrollTop = 0;
      }
      return;
    }
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [saved.length, pendingQuestion, tab]);
  const makeNote = (text: string, answer: string): LectureNote => ({
    id: crypto.randomUUID(),
    lectureId: lecture.id,
    timestamp,
    momentId,
    sourceId: source.id,
    question: text,
    answer,
    takeaways: [],
    citations: [],
    createdAt: new Date().toISOString(),
  });
  const respond = async (text: string, signal?: AbortSignal) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      controller.abort();
    }
    setPendingQuestion(text);
    setError('');
    setTab('conversation');
    const history: LectureMessage[] = sessionNotes.current.slice(-3).flatMap((note) => [
      { role: 'user' as const, content: note.question.slice(0, 4000) },
      { role: 'assistant' as const, content: note.answer.slice(0, 6000) },
    ]);
    try {
      const reply = await ask.mutateAsync({
        lecture,
        momentId,
        sourceId: source.id,
        focus,
        question: text,
        history,
        signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      callbacks.current.onSave({
        ...makeNote(text, reply.answer),
        takeaways: reply.takeaways ?? [],
        citations: reply.citations,
      });
      return reply.answer;
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) {
        setError(lectureError(cause, localize('com_ui_lecture_ask_failed')));
      }
      throw cause;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (request.current === controller && mounted.current) {
        request.current = null;
        setPendingQuestion('');
      }
    }
  };
  const onExchange = (text: string, answer: string) => {
    if (!mounted.current) {
      return;
    }
    const note = makeNote(text, answer);
    callbacks.current.onSave(note);
    void extract
      .mutateAsync({
        lecture,
        momentId,
        sourceId: source.id,
        question: text.slice(0, 4000),
        answer: answer.slice(0, 18000),
      })
      .then((result) => callbacks.current.onEdit(note.id, result.takeaways, true))
      .catch(() => {
        if (mounted.current) {
          setError(localize('com_ui_lecture_takeaways_failed'));
        }
      });
  };
  const live = useLiveConversation({
    lecture,
    momentId,
    sourceId: source.id,
    focus,
    onExchange,
    onActivity: () => setTab('conversation'),
  });
  const browser = useConversation({
    onQuestion: respond,
    onActivity: () => setTab('conversation'),
  });
  const activeVoice = live.active || browser.active;
  const status = live.active ? live.status : browser.status;
  const statusText = {
    idle: localize('com_ui_lecture_voice_ready'),
    starting: localize('com_ui_lecture_voice_connecting'),
    listening: localize('com_ui_lecture_voice_listening'),
    thinking: localize('com_ui_lecture_thinking'),
    speaking: localize('com_ui_lecture_voice_speaking'),
  };
  const stop = () => {
    live.stop();
    browser.stop();
    request.current?.abort();
    setPendingQuestion('');
  };
  const close = () => {
    stop();
    onClose();
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="lecture-explorer-overlay" />
        <Dialog.Content
          className="lecture-explorer"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <header className="lecture-explorer-header">
            <button onClick={close} className="lecture-back">
              <ArrowLeft size={18} />
              <span>{localize('com_ui_lecture_back')}</span>
              <b>{formatTime(timestamp)}</b>
            </button>
            <div className="lecture-explorer-title">
              <Dialog.Title>{source.title}</Dialog.Title>
              <Dialog.Description>
                {localize('com_ui_lecture_explorer_description')}
              </Dialog.Description>
            </div>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="lecture-original"
            >
              {localize('com_ui_lecture_reader_original')}
              <ArrowUpRight size={16} />
            </a>
          </header>
          <div className="lecture-mobile-panes">
            <button aria-pressed={mobilePane === 'paper'} onClick={() => setMobilePane('paper')}>
              {localize('com_ui_lecture_paper')}
            </button>
            <button aria-pressed={mobilePane === 'tutor'} onClick={() => setMobilePane('tutor')}>
              {localize('com_ui_lecture_tutor')}
            </button>
          </div>
          <div className="lecture-explorer-body" data-pane={mobilePane}>
            <div className="lecture-paper">
              <Reader
                source={source}
                evidence={evidence}
                compact
                onEscape={close}
                onPassage={(passage) => {
                  stop();
                  setFocus(passage);
                }}
              />
            </div>
            <aside className="lecture-tutor" aria-label={localize('com_ui_lecture_tutor')}>
              <div
                className="lecture-tutor-tabs"
                role="tablist"
                aria-label={localize('com_ui_lecture_tutor')}
              >
                <button
                  role="tab"
                  id="lecture-conversation-tab"
                  aria-controls="lecture-conversation-panel"
                  aria-selected={tab === 'conversation'}
                  onClick={() => setTab('conversation')}
                >
                  {localize('com_ui_lecture_conversation')}
                </button>
                <button
                  role="tab"
                  id="lecture-notes-tab"
                  aria-controls="lecture-notes-panel"
                  aria-selected={tab === 'notes'}
                  onClick={() => setTab('notes')}
                >
                  {localize('com_ui_lecture_my_notes')}
                  <span>{saved.length}</span>
                </button>
              </div>
              <div
                ref={panel}
                className="lecture-tutor-content"
                role="tabpanel"
                id={`lecture-${tab}-panel`}
                aria-labelledby={`lecture-${tab}-tab`}
              >
                {saved.length === 0 && !pendingQuestion && (
                  <div className="lecture-conversation-empty">
                    <h3>
                      {localize(
                        tab === 'notes'
                          ? 'com_ui_lecture_notes_empty_title'
                          : 'com_ui_lecture_ask_your_question',
                      )}
                    </h3>
                    <p>
                      {localize(
                        tab === 'notes'
                          ? 'com_ui_lecture_notes_empty'
                          : 'com_ui_lecture_conversation_help',
                      )}
                    </p>
                  </div>
                )}
                {tab === 'conversation' &&
                  saved.map((note) => (
                    <article key={note.id} className="lecture-exchange">
                      <h3>{note.question}</h3>
                      <Answer citations={note.citations}>{note.answer}</Answer>
                      {note.citations.length > 0 && (
                        <details className="lecture-citations">
                          <summary>
                            {localize('com_ui_lecture_cited_passages')} · {note.citations.length}
                          </summary>
                          <div>
                            {note.citations.map((citation, index) => (
                              <a
                                key={`${citation.sourceId}:${citation.url}`}
                                href={citation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {index + 1}. {citation.section}
                                <ArrowUpRight size={11} />
                              </a>
                            ))}
                          </div>
                        </details>
                      )}
                    </article>
                  ))}
                {tab === 'notes' &&
                  saved.map((note) => (
                    <Note key={note.id} note={note} onEdit={onEdit} onRemove={onRemove} />
                  ))}
                {pendingQuestion && (
                  <article className="lecture-exchange">
                    <h3>{pendingQuestion}</h3>
                    <p role="status" className="lecture-muted">
                      {localize('com_ui_lecture_thinking')}
                    </p>
                  </article>
                )}
                <div ref={end} />
              </div>
              <div className="lecture-composer" hidden={tab === 'notes' && !activeVoice}>
                {focus && (
                  <div className="lecture-focus">
                    <span>{localize('com_ui_lecture_selected_passage')}</span>
                    <button
                      aria-label={localize('com_ui_lecture_clear_passage')}
                      onClick={() => {
                        stop();
                        setFocus(undefined);
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {(error || live.error || browser.error) && (
                  <p role="alert" className="lecture-inline-error">
                    {error || live.error || browser.error}
                  </p>
                )}
                {activeVoice ? (
                  <div className="lecture-voice-active">
                    <span className="lecture-voice-dot" />
                    <span role="status">{statusText[status]}</span>
                    <button onClick={stop}>
                      <Square size={13} />
                      {localize('com_ui_lecture_stop_voice')}
                    </button>
                  </div>
                ) : (
                  <>
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const text = question.trim();
                        if (!text || pendingQuestion) {
                          return;
                        }
                        setQuestion('');
                        try {
                          await respond(text);
                        } catch {
                          if (mounted.current) {
                            setQuestion(text);
                          }
                        }
                      }}
                    >
                      <textarea
                        aria-label={localize('com_ui_lecture_question')}
                        placeholder={localize('com_ui_lecture_question_placeholder')}
                        value={question}
                        maxLength={4000}
                        rows={3}
                        onChange={(event) => setQuestion(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                      <button
                        type="submit"
                        className="lecture-send"
                        disabled={!!pendingQuestion || !question.trim()}
                        aria-label={localize('com_ui_lecture_submit_question')}
                      >
                        <Send size={17} />
                      </button>
                    </form>
                    <div className="lecture-voice-controls">
                      <button
                        className="lecture-voice-start"
                        disabled={
                          !!pendingQuestion || !live.supported || !capability.data?.available
                        }
                        onClick={() => {
                          browser.stop();
                          void live.start();
                        }}
                      >
                        <Mic size={16} />
                        {localize('com_ui_lecture_start_live')}
                      </button>
                      <span>{localize('com_ui_lecture_subscription')}</span>
                    </div>
                    <details className="lecture-voice-options">
                      <summary>{localize('com_ui_lecture_voice_options')}</summary>
                      <p>
                        {capability.isLoading
                          ? localize('com_ui_lecture_voice_checking')
                          : (capability.data?.reason ??
                            localize(
                              capability.data?.available
                                ? 'com_ui_lecture_live_help'
                                : 'com_ui_lecture_live_unavailable',
                            ))}
                      </p>
                      {capability.isError && (
                        <button onClick={() => void capability.refetch()}>
                          {localize('com_ui_lecture_reader_retry')}
                        </button>
                      )}
                      <p>{localize('com_ui_lecture_browser_voice_help')}</p>
                      <button
                        disabled={!browser.supported || !!pendingQuestion}
                        onClick={() => {
                          live.stop();
                          browser.start();
                        }}
                      >
                        <Mic size={14} />
                        {localize('com_ui_lecture_start_browser_voice')}
                      </button>
                    </details>
                  </>
                )}
                <p className="lecture-save-hint">
                  {localize('com_ui_lecture_saved_at')} {formatTime(timestamp)}
                </p>
              </div>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Note({
  note,
  onEdit,
  onRemove,
}: Pick<ExplorerProps, 'onEdit' | 'onRemove'> & { note: LectureNote }) {
  const localize = useLocalize();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.takeaways.join('\n'));
  return (
    <article className="lecture-saved-note">
      <div className="lecture-note-heading">
        <span>{formatTime(note.timestamp)}</span>
        <button
          aria-label={localize('com_ui_lecture_remove_note')}
          onClick={() => onRemove(note.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <h3>{note.question}</h3>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onEdit(
              note.id,
              draft
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            );
            setEditing(false);
          }}
        >
          <textarea
            aria-label={localize('com_ui_lecture_edit_takeaways')}
            rows={5}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="lecture-row">
            <button type="submit">{localize('com_ui_save')}</button>
            <button type="button" onClick={() => setEditing(false)}>
              {localize('com_ui_cancel')}
            </button>
          </div>
        </form>
      ) : (
        <>
          {note.takeaways.length > 0 ? (
            <ul>
              {note.takeaways.map((takeaway, index) => (
                <li key={index}>{takeaway}</li>
              ))}
            </ul>
          ) : (
            <p className="lecture-muted">{localize('com_ui_lecture_answer_saved')}</p>
          )}
          <button
            className="lecture-text-button"
            onClick={() => {
              setDraft(note.takeaways.join('\n'));
              setEditing(true);
            }}
          >
            {localize('com_ui_lecture_edit_takeaways')}
          </button>
        </>
      )}
      <details>
        <summary>{localize('com_ui_lecture_full_answer')}</summary>
        <Answer citations={note.citations}>{note.answer}</Answer>
      </details>
    </article>
  );
}
