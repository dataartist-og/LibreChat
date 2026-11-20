import { useState } from 'react';
import type { Lecture, LectureYouTubeResponse } from 'librechat-data-provider';
import {
  useLectureIndexMutation,
  useLectureImportMutation,
  useLectureYouTubeMutation,
} from '~/data-provider/Lectures';
import { useLocalize } from '~/hooks';
import { lectureError } from './error';

const captionMessage = {
  manual: 'com_ui_lecture_caption_manual',
  automatic: 'com_ui_lecture_caption_automatic',
  unavailable: 'com_ui_lecture_caption_unavailable',
} as const;

export default function Creator({
  onCreated,
  onClose,
}: {
  onCreated: (lecture: Lecture) => void;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const index = useLectureIndexMutation();
  const imported = useLectureImportMutation();
  const youtube = useLectureYouTubeMutation();
  const [importError, setImportError] = useState(false);
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [description, setDescription] = useState('');
  const [metadata, setMetadata] = useState<LectureYouTubeResponse>();
  const [manual, setManual] = useState(false);
  const pending = youtube.isLoading || index.isLoading;
  return (
    <div className="lecture-creator">
      <div className="lecture-row">
        <h2>{localize('com_ui_lecture_create')}</h2>
        <button type="button" onClick={onClose}>
          {localize('com_ui_cancel')}
        </button>
      </div>
      <p>{localize('com_ui_lecture_create_dynamic_help')}</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            const fetched = await youtube.mutateAsync({ videoUrl });
            setMetadata(fetched);
            setTitle(fetched.title);
            setTranscript(fetched.transcript);
            setDescription(fetched.description);
            setManual(fetched.transcriptKind === 'unavailable');
          } catch {
            /* React Query exposes the import error below. */
          }
        }}
      >
        <label>
          {localize('com_ui_lecture_url')}
          <input
            required
            type="url"
            value={videoUrl}
            disabled={pending}
            onChange={(event) => {
              setVideoUrl(event.target.value);
              setMetadata(undefined);
            }}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </label>
        <button className="lecture-primary" disabled={pending} type="submit">
          {localize(
            youtube.isLoading ? 'com_ui_lecture_fetching_video' : 'com_ui_lecture_fetch_video',
          )}
        </button>
        <p className="lecture-muted">{localize('com_ui_lecture_youtube_help')}</p>
        {youtube.isError && (
          <p role="alert">{lectureError(youtube.error, localize('com_ui_lecture_fetch_failed'))}</p>
        )}
      </form>
      {metadata && (
        <section className="lecture-import-result">
          <h3>{title}</h3>
          <p>
            {localize('com_ui_lecture_sources_detected')}: {metadata.sourceUrls.length}
          </p>
          <p className="lecture-muted">{localize(captionMessage[metadata.transcriptKind])}</p>
          {metadata.warnings.map((warning) => (
            <p key={warning} className="lecture-muted">
              {warning}
            </p>
          ))}
        </section>
      )}
      <details
        className="lecture-manual-details"
        open={manual}
        onToggle={(event) => setManual(event.currentTarget.open)}
      >
        <summary>
          {localize(metadata ? 'com_ui_lecture_import_review' : 'com_ui_lecture_manual_details')}
        </summary>
        <div className="lecture-import-fields">
          <label>
            {localize('com_ui_lecture_title')}
            <input
              required
              maxLength={200}
              disabled={pending}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            {localize('com_ui_lecture_transcript')}
            <textarea
              required
              rows={8}
              maxLength={160000}
              disabled={pending}
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder={'[00:00] …\n[00:15] …'}
            />
          </label>
          <label>
            {localize('com_ui_lecture_description')}
            <textarea
              rows={5}
              maxLength={20000}
              disabled={pending}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>
      </details>
      {(metadata || manual) && (
        <div className="lecture-build">
          <button
            className="lecture-primary"
            disabled={pending || !title.trim() || !transcript.trim() || !videoUrl.trim()}
            onClick={async () => {
              try {
                onCreated(await index.mutateAsync({ title, videoUrl, transcript, description }));
              } catch {
                /* React Query exposes the indexing error below. */
              }
            }}
          >
            {localize(index.isLoading ? 'com_ui_lecture_indexing' : 'com_ui_lecture_build')}
          </button>
          <p className="lecture-muted">{localize('com_ui_lecture_local')}</p>
        </div>
      )}
      {index.isError && (
        <p role="alert">{lectureError(index.error, localize('com_ui_lecture_index_failed'))}</p>
      )}
      <details className="lecture-manual-details">
        <summary>{localize('com_ui_lecture_import')}</summary>
        <label className="lecture-import">
          {localize('com_ui_lecture_import')}
          <input
            type="file"
            accept=".json,application/json"
            disabled={imported.isLoading || pending}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              setImportError(false);
              try {
                if (file.size > 2 * 1024 * 1024) {
                  throw new Error('Index too large');
                }
                onCreated(await imported.mutateAsync(JSON.parse(await file.text()) as Lecture));
              } catch {
                setImportError(true);
              }
            }}
          />
        </label>
        {importError && (
          <p role="alert">
            {lectureError(imported.error, localize('com_ui_lecture_import_failed'))}
          </p>
        )}
      </details>
    </div>
  );
}
