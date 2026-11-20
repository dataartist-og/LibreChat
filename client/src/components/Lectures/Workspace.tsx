import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Play, Pause, ArrowUpRight, Download, ChevronRight } from 'lucide-react';
import type { Lecture, LectureNote, LectureSource, LectureEvidence } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import { momentAt, timestamp } from './timeline';
import { sourcesAtPause } from './context';
import { downloadJson, notesKey, orderedNotes, persistNotes, readNotes } from './notes';
import type { PlayerHandle } from './Player';
import Player from './Player';
import Creator from './Creator';
import Explorer from './Explorer';
import seed from './mcgrath.json';
import './style.css';

const initialLecture: Lecture = seed;
function loadLibrary(key: string): Lecture[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]') as Lecture[];
    const lectures = [initialLecture, ...saved.filter((lecture) => lecture.moments?.length > 0)];
    return [...new Map(lectures.map((lecture) => [lecture.id, lecture])).values()];
  } catch {
    return [initialLecture];
  }
}

export default function Workspace() {
  const { user } = useAuthContext();
  return <Library key={user?.id ?? 'local'} userId={user?.id ?? 'local'} />;
}
function Library({ userId }: { userId: string }) {
  const localize = useLocalize();
  const libraryKey = `lecture-library-v1:${userId}`;
  const [library, setLibrary] = useState(() => loadLibrary(libraryKey));
  const [selected, setSelected] = useState(initialLecture.id);
  const [creating, setCreating] = useState(false);
  const lecture = library.find((item) => item.id === selected) ?? initialLecture;
  return (
    <main className="lecture-center">
      <header className="lecture-header">
        <div className="lecture-brand">
          <BookOpen size={20} />
          <strong>{localize('com_ui_lecture_center')}</strong>
        </div>
        <div className="lecture-row">
          <select
            aria-label={localize('com_ui_lecture_select')}
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setCreating(false);
            }}
          >
            {library.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <button onClick={() => setCreating(!creating)}>
            <Plus size={16} />
            {localize('com_ui_lecture_new')}
          </button>
        </div>
      </header>
      {creating ? (
        <Creator
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            const updated = [...library.filter((item) => item.id !== created.id), created];
            localStorage.setItem(
              libraryKey,
              JSON.stringify(updated.filter((item) => item !== initialLecture)),
            );
            setLibrary(updated);
            setSelected(created.id);
            setCreating(false);
          }}
        />
      ) : (
        <Session key={`${userId}:${lecture.id}`} userId={userId} lecture={lecture} />
      )}
    </main>
  );
}

type Exploration = {
  timestamp: number;
  momentId: string;
  source: LectureSource;
  evidence?: LectureEvidence;
};
function Session({ lecture, userId }: { lecture: Lecture; userId: string }) {
  const localize = useLocalize();
  const player = useRef<PlayerHandle>(null);
  const progressKey = `lecture-progress-v1:${userId}:${lecture.id}`;
  const notebookKey = notesKey(userId, lecture.id);
  const [initialTime] = useState(() => {
    const saved = Number(
      localStorage.getItem(progressKey) ?? (lecture.id === 'mcgrath' ? '2536' : '0'),
    );
    return Number.isFinite(saved) ? Math.min(Math.max(0, saved), lecture.duration - 1) : 0;
  });
  const [time, setTime] = useState(initialTime);
  const [paused, setPaused] = useState(true);
  const [exploration, setExploration] = useState<Exploration>();
  const [notes, setNotes] = useState(() => readNotes(notebookKey));
  const [storageError, setStorageError] = useState(false);
  const timeRef = useRef(time);
  timeRef.current = time;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const manuallyEdited = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const active = momentAt(lecture.moments, time);
  const suggestions = useMemo(() => sourcesAtPause(lecture, time), [lecture, time]);
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(progressKey, String(timeRef.current));
      } catch {
        setStorageError(true);
      }
    };
    const timer = setInterval(save, 5000);
    return () => {
      clearInterval(timer);
      try {
        localStorage.setItem(progressKey, String(timeRef.current));
      } catch {
        /* Notes can still be exported. */
      }
    };
  }, [progressKey]);
  const updateNotes = (updated: LectureNote[]) => {
    if (!mounted.current) {
      return;
    }
    notesRef.current = updated;
    setNotes(updated);
    setStorageError(!persistNotes(notebookKey, updated));
  };
  const pause = () => {
    player.current?.pause();
    const current = player.current?.time() ?? timeRef.current;
    setTime(current);
    timeRef.current = current;
    setPaused(true);
    return current;
  };
  const explore = (source: LectureSource, evidence?: LectureEvidence, at?: number) => {
    const stopped = at ?? pause();
    if (at !== undefined) {
      player.current?.seek(at);
      setTime(at);
      setPaused(true);
    }
    setExploration({
      timestamp: stopped,
      momentId: momentAt(lecture.moments, stopped).id,
      source,
      evidence,
    });
  };
  return (
    <div className="lecture-watch-scroll">
      <div className="lecture-watch">
        <div className="lecture-watch-title">
          <div>
            <span className="lecture-eyebrow">{localize('com_ui_lecture_watch_label')}</span>
            <h1>{lecture.title}</h1>
          </div>
        </div>
        <Player
          ref={player}
          videoId={lecture.videoId}
          initialTime={initialTime}
          onTime={(value, playing) => {
            if (!exploration) {
              setTime(value);
            }
            if (playing && exploration) {
              player.current?.pause();
            }
          }}
          onPaused={() => {
            setTime(player.current?.time() ?? timeRef.current);
            setPaused(true);
          }}
          onPlaying={() => {
            if (exploration) {
              player.current?.pause();
              return;
            }
            setPaused(false);
          }}
        />
        <div className="lecture-watch-controls">
          <button
            className="lecture-primary"
            onClick={() => {
              if (paused) {
                player.current?.play();
              } else {
                pause();
              }
            }}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
            {localize(paused ? 'com_ui_lecture_resume' : 'com_ui_lecture_pause')}
          </button>
          <span className="lecture-time">
            {timestamp(time)} / {timestamp(lecture.duration)}
          </span>
          <select
            aria-label={localize('com_ui_lecture_timeline')}
            value={active.id}
            onChange={(event) => {
              const moment = lecture.moments.find((item) => item.id === event.target.value);
              if (moment) {
                player.current?.seek(moment.start);
                setTime(moment.start);
                setPaused(true);
              }
            }}
          >
            {lecture.moments.map((moment) => (
              <option key={moment.id} value={moment.id}>
                {timestamp(moment.start)} · {moment.title}
              </option>
            ))}
          </select>
        </div>
        {paused ? (
          <section
            className="lecture-pause-context"
            aria-label={localize('com_ui_lecture_pause_sources')}
          >
            <div className="lecture-context-heading">
              <div>
                <span className="lecture-eyebrow">
                  {localize('com_ui_lecture_paused_at')} {timestamp(time)}
                </span>
                <h2>{active.title}</h2>
              </div>
              <span className="lecture-muted">{localize('com_ui_lecture_choose_depth')}</span>
            </div>
            {suggestions.length === 0 && (
              <p className="lecture-muted">{localize('com_ui_lecture_no_match')}</p>
            )}
            <div className="lecture-source-choices">
              {suggestions.map(({ source, evidence, nearby }) => (
                <button key={source.id} onClick={() => explore(source, evidence)}>
                  <BookOpen size={21} />
                  <span>
                    <strong>{source.title}</strong>
                    <small>{nearby ? localize('com_ui_lecture_nearby') : evidence.section}</small>
                  </span>
                  <span className="lecture-explore-action">
                    {localize('com_ui_lecture_explore')}
                    <ArrowUpRight size={17} />
                  </span>
                </button>
              ))}
            </div>
            <details className="lecture-more-sources">
              <summary>{localize('com_ui_lecture_browse_sources')}</summary>
              <div>
                {lecture.sources.map((source) => (
                  <button key={source.id} onClick={() => explore(source)}>
                    {source.title}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            </details>
          </section>
        ) : (
          <p className="lecture-watch-hint">{localize('com_ui_lecture_pause_hint')}</p>
        )}
        <details className="lecture-notebook">
          <summary>
            {localize('com_ui_lecture_my_notes')} <span>{notes.length}</span>
          </summary>
          <div className="lecture-notebook-heading">
            <p className="lecture-muted">{localize('com_ui_lecture_notes_help')}</p>
            <button
              disabled={!notes.length}
              onClick={() =>
                downloadJson(
                  { version: 1, lecture, notes: orderedNotes(notes) },
                  `${lecture.id}-study-notes.json`,
                )
              }
            >
              <Download size={15} />
              {localize('com_ui_lecture_export_notes')}
            </button>
          </div>
          {notes.length === 0 && (
            <p className="lecture-muted">{localize('com_ui_lecture_notes_empty')}</p>
          )}
          {orderedNotes(notes).map((note) => (
            <div className="lecture-note-preview" key={note.id}>
              <button
                className="lecture-note-time"
                onClick={() => {
                  player.current?.seek(note.timestamp);
                  setTime(note.timestamp);
                  setPaused(true);
                }}
              >
                {timestamp(note.timestamp)}
              </button>
              <div>
                <strong>{note.question}</strong>
                <p>{note.takeaways[0] ?? note.answer.slice(0, 180)}</p>
              </div>
              <button
                aria-label={localize('com_ui_lecture_revisit')}
                onClick={() => {
                  const source = lecture.sources.find((item) => item.id === note.sourceId);
                  if (source) {
                    explore(source, undefined, note.timestamp);
                  }
                }}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          ))}
        </details>
        {storageError && <p role="alert">{localize('com_ui_lecture_storage_failed')}</p>}
        <footer className="lecture-footer">
          <span>{localize('com_ui_lecture_notes_local')}</span>
          <button onClick={() => downloadJson(lecture, `${lecture.id}.json`)}>
            {localize('com_ui_lecture_export')}
          </button>
        </footer>
      </div>
      {exploration && (
        <Explorer
          lecture={lecture}
          {...exploration}
          notes={notes}
          onClose={() => setExploration(undefined)}
          onSave={(note) => updateNotes([...notesRef.current, note])}
          onEdit={(id, takeaways, automatic) => {
            if (automatic && manuallyEdited.current.has(id)) {
              return;
            }
            if (!automatic) {
              manuallyEdited.current.add(id);
            }
            updateNotes(
              notesRef.current.map((note) => (note.id === id ? { ...note, takeaways } : note)),
            );
          }}
          onRemove={(id) => updateNotes(notesRef.current.filter((note) => note.id !== id))}
        />
      )}
    </div>
  );
}
