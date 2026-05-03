import { useMemo, useRef, useState } from 'react';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import ReactMarkdown from 'react-markdown';
import { useRecoilValue } from 'recoil';
import supersub from 'remark-supersub';
import type { TDocumentSpeechHighlightMode, TDocumentWorkspace } from 'librechat-data-provider';
import type { PluggableList } from 'unified';
import { BookOpenText, Download, Globe2, Lock, RotateCcw } from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  useToastContext,
} from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { useCreateStarterDialogMutation } from '~/data-provider/Dialogs';
import {
  useImportStudyDocumentMutation,
  useReingestStudyDocumentMutation,
  useUpdateStudyDocumentSharingMutation,
} from '~/data-provider/Documents';
import { preprocessLaTeX } from '~/utils';
import store from '~/store';
import DocumentSpeech from './Speech';
import DocumentViewer from './Viewer';
import type {
  DocumentSpeechActiveState,
  DocumentSpeechHandle,
  DocumentSpeechPlayerState,
} from './Speech';

const outlineRemarkPlugins: PluggableList = [
  supersub,
  remarkGfm,
  [remarkMath, { singleDollarTextMath: true }],
];

const outlineRehypePlugins: PluggableList = [[rehypeKatex]];

function OutlineTitle({ title }: { title: string }) {
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const content = useMemo(() => {
    if (!title) {
      return '';
    }

    return LaTeXParsing ? preprocessLaTeX(title) : title;
  }, [LaTeXParsing, title]);

  return (
    <span className="block break-words [&_.katex-display]:my-0 [&_.katex]:text-inherit">
      <ReactMarkdown
        remarkPlugins={outlineRemarkPlugins}
        rehypePlugins={outlineRehypePlugins}
        components={{
          p: ({ node: _node, ...props }) => <span {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
}

export default function DocumentWorkspace({ workspace }: { workspace: TDocumentWorkspace }) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const reingestMutation = useReingestStudyDocumentMutation();
  const importMutation = useImportStudyDocumentMutation();
  const updateSharingMutation = useUpdateStudyDocumentSharingMutation();
  const createStarterDialogMutation = useCreateStarterDialogMutation();
  const highlightMode = useRecoilValue<TDocumentSpeechHighlightMode>(store.documentSpeechHighlightMode);
  const [repoUrl, setRepoUrl] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSpeech, setActiveSpeech] = useState<DocumentSpeechActiveState | null>(null);
  const [playbackState, setPlaybackState] = useState<DocumentSpeechPlayerState>({
    currentBlockId: null,
    isPausedForVisual: false,
    isPlaying: false,
    isPreparing: false,
  });
  const speechRef = useRef<DocumentSpeechHandle>(null);
  const isOwner = workspace.document.isOwner === true;
  const isImported = workspace.document.isImported === true;
  const viewerCanEdit = isOwner || isImported;
  const isSharedPreview = !viewerCanEdit;

  const handleCreateStarterDialog = async () => {
    try {
      const dialogWorkspace = await createStarterDialogMutation.mutateAsync({
        documentId: workspace.document.documentId,
        repoUrl: repoUrl.trim() || undefined,
      });

      setDialogOpen(false);
      setRepoUrl('');
      navigate(`/dialogs/${dialogWorkspace.dialog.dialogId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : localize('com_ui_dialog_create_failed');
      showToast({ message, status: 'error' });
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-surface-primary">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-border-light px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {localize('com_ui_document_workspace')}
              </div>
              <h1 className="mt-1 truncate text-2xl font-semibold text-text-primary">
                {workspace.document.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                <span>
                  {localize('com_ui_document_source')}: {workspace.document.sourceKind}
                </span>
                <span>
                  {localize('com_ui_document_render_version')}:{' '}
                  {workspace.renderVersion.versionNumber}
                </span>
                <span className="inline-flex items-center gap-1">
                  {workspace.document.sharingVisibility === 'public' ? (
                    <Globe2 className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {workspace.document.sharingVisibility === 'public'
                    ? localize('com_ui_document_public')
                    : localize('com_ui_document_private')}
                </span>
                {isSharedPreview ? (
                  <span>{localize('com_ui_document_shared_preview')}</span>
                ) : null}
                {isImported ? <span>{localize('com_ui_document_imported')}</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {viewerCanEdit ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                  onClick={() => setDialogOpen(true)}
                >
                  <BookOpenText className="h-4 w-4" />
                  {localize('com_ui_create_starter_dialog')}
                </button>
              ) : null}
              {isOwner ? (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                    onClick={() =>
                      updateSharingMutation.mutateAsync({
                        documentId: workspace.document.documentId,
                        sharingVisibility:
                          workspace.document.sharingVisibility === 'public' ? 'private' : 'public',
                      })
                    }
                  >
                    {workspace.document.sharingVisibility === 'public' ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Globe2 className="h-4 w-4" />
                    )}
                    {workspace.document.sharingVisibility === 'public'
                      ? localize('com_ui_document_make_private')
                      : localize('com_ui_document_make_public')}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                    onClick={() =>
                      reingestMutation.mutateAsync({
                        documentId: workspace.document.documentId,
                      })
                    }
                  >
                    <RotateCcw className="h-4 w-4" />
                    {localize('com_ui_reingest_document')}
                  </button>
                </>
              ) : null}
              {isSharedPreview ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                  onClick={async () => {
                    const importedWorkspace = await importMutation.mutateAsync({
                      documentId: workspace.document.documentId,
                    });
                    navigate(`/docs/${importedWorkspace.document.documentId}`);
                  }}
                >
                  <Download className="h-4 w-4" />
                  {localize('com_ui_document_import')}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            <DocumentViewer
              workspace={workspace}
              activeSpeech={activeSpeech}
              highlightMode={highlightMode}
              playbackState={playbackState}
              onPausePlayback={() => speechRef.current?.pause()}
              onPlayFromBlock={(blockId) => speechRef.current?.playFromBlock(blockId)}
              viewerCanEdit={viewerCanEdit}
            />
          </div>

          <aside className="hidden w-72 flex-shrink-0 border-l border-border-light xl:block">
            <div className="h-full overflow-y-auto px-4 py-6">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {localize('com_ui_document_outline')}
              </div>
              <div className="space-y-1">
                {workspace.renderVersion.outlineJson.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                    style={{ paddingLeft: `${item.depth * 12 + 12}px` }}
                    onClick={() =>
                      document
                        .getElementById(`document-block-${item.blockId}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  >
                    <OutlineTitle title={item.title} />
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="border-t border-border-light px-4 py-3 sm:px-6 lg:px-8">
          <DocumentSpeech
            ref={speechRef}
            workspace={workspace}
            onActiveSpeechChange={setActiveSpeech}
            onPlaybackStateChange={setPlaybackState}
          />
        </div>
      </div>

      <OGDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <OGDialogContent className="sm:max-w-xl">
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_ui_create_starter_dialog')}</OGDialogTitle>
          </OGDialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-text-secondary">
              {localize('com_ui_dialog_from_document_description')}
            </div>
            <input
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              className="w-full rounded-xl border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
              placeholder={localize('com_ui_dialog_repo_optional_placeholder')}
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
              onClick={() => setDialogOpen(false)}
            >
              {localize('com_ui_cancel')}
            </button>
            <button
              type="button"
              className="rounded-xl bg-text-primary px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:text-black"
              onClick={() => handleCreateStarterDialog()}
            >
              {localize('com_ui_open_learning_dialog')}
            </button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
