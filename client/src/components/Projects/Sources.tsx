import { memo, useMemo, useRef, useState } from 'react';
import { Link2, FileText, Upload, StickyNote, Trash2, Plus } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
} from '@librechat/client';
import type { ExtendedFile } from '~/common';
import { useChatContext } from '~/Providers';
import {
  useGetFiles,
  useProjectQuery,
  useProjectsQuery,
  useProjectSourcesQuery,
  useCreateProjectSourceMutation,
  useDeleteProjectSourceMutation,
} from '~/data-provider';
import { useFileHandling, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

function ProjectSourcesPanel() {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useRecoilState(store.projectSourcesOpen);
  const activeProjectId = useRecoilValue(store.activeProjectId);
  const { setFiles, files } = useChatContext();
  const { handleFileChange } = useFileHandling({
    additionalMetadata: {
      projectId: activeProjectId ?? undefined,
    },
  });
  const { data: project } = useProjectQuery(activeProjectId, {
    enabled: open && !!activeProjectId,
  });
  const { data: projects = [] } = useProjectsQuery({
    enabled: open,
  });
  const { data: sources = [] } = useProjectSourcesQuery(activeProjectId, {
    enabled: open && !!activeProjectId,
  });
  const { data: filesData = [] } = useGetFiles({
    enabled: open,
  });
  const createSourceMutation = useCreateProjectSourceMutation();
  const deleteSourceMutation = useDeleteProjectSourceMutation();
  const [mode, setMode] = useState<'note' | 'url' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const activeProject = useMemo(
    () => project ?? projects.find((_project) => _project.projectId === activeProjectId),
    [activeProjectId, project, projects],
  );
  const fileMap = useMemo(
    () => new Map(filesData.map((file) => [file.file_id, file])),
    [filesData],
  );

  const handleAttachFile = (fileId: string) => {
    const file = fileMap.get(fileId);
    if (!file) {
      return;
    }

    const extendedFile: ExtendedFile = {
      attached: true,
      embedded: file.embedded,
      file_id: file.file_id,
      filename: file.filename,
      filepath: file.filepath,
      height: file.height,
      metadata: file.metadata,
      progress: 1,
      size: file.bytes,
      source: file.source,
      type: file.type,
      width: file.width,
    };

    setFiles((currentFiles) => {
      const nextFiles = new Map(currentFiles);
      nextFiles.set(file.file_id, extendedFile);
      return nextFiles;
    });
  };

  const handleCreateSource = async () => {
    if (!activeProjectId || !mode || !title.trim()) {
      return;
    }

    if (mode === 'note') {
      await createSourceMutation.mutateAsync({
        projectId: activeProjectId,
        sourceType: 'note',
        title: title.trim(),
        noteBody: body.trim(),
      });
    } else if (mode === 'url') {
      await createSourceMutation.mutateAsync({
        projectId: activeProjectId,
        sourceType: 'url',
        title: title.trim(),
        url: body.trim(),
      });
    }

    setMode(null);
    setTitle('');
    setBody('');
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!activeProjectId) {
      return;
    }

    await deleteSourceMutation.mutateAsync({
      projectId: activeProjectId,
      sourceId,
    });
  };

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <OGDialogHeader>
          <OGDialogTitle>
            {localize('com_ui_project_sources_for', {
              project: activeProject?.name ?? localize('com_ui_projects'),
            })}
          </OGDialogTitle>
        </OGDialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-border-light bg-surface-secondary/50 p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {localize('com_ui_upload_file')}
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setMode('note')}>
                <StickyNote className="h-4 w-4" />
                {localize('com_ui_add_note')}
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setMode('url')}>
                <Link2 className="h-4 w-4" />
                {localize('com_ui_add_link')}
              </Button>
            </div>
            <p className="text-sm text-text-secondary">
              {localize('com_ui_project_file_hint')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {mode ? (
            <div className="rounded-xl border border-border-light bg-surface-primary p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
                <Plus className="h-4 w-4" />
                {mode === 'note' ? localize('com_ui_add_note') : localize('com_ui_add_link')}
              </div>
              <div className="space-y-2">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={localize('com_ui_title')}
                  className="h-9 w-full rounded-md border border-border-medium bg-transparent px-2 text-sm text-text-primary outline-none focus:border-border-heavy"
                />
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={
                    mode === 'note'
                      ? localize('com_ui_project_note_body')
                      : localize('com_ui_project_link_url')
                  }
                  className="min-h-[96px] w-full rounded-md border border-border-medium bg-transparent px-2 py-2 text-sm text-text-primary outline-none focus:border-border-heavy"
                />
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="btn btn-neutral" onClick={() => setMode(null)}>
                    {localize('com_ui_cancel')}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleCreateSource}>
                    {localize('com_ui_save')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {sources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-medium px-4 py-8 text-center text-sm text-text-secondary">
                {localize('com_ui_no_project_sources')}
              </div>
            ) : null}
            {sources.map((source) => {
              const attached = !!(source.fileId && files.has(source.fileId));
              const sourceFile = source.fileId ? fileMap.get(source.fileId) : undefined;

              return (
                <div
                  key={source.sourceId}
                  className="rounded-xl border border-border-light bg-surface-primary px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-text-primary">
                        {source.sourceType === 'file' ? (
                          <FileText className="h-4 w-4 flex-shrink-0" />
                        ) : source.sourceType === 'url' ? (
                          <Link2 className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <StickyNote className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="truncate">{source.title}</span>
                      </div>
                      <div className="text-sm text-text-secondary">
                        {source.sourceType === 'file' ? sourceFile?.filename ?? source.fileId : null}
                        {source.sourceType === 'url' ? source.url : null}
                        {source.sourceType === 'note' ? source.noteBody : null}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {source.sourceType === 'file' && source.fileId ? (
                        <button
                          type="button"
                          className={cn('btn btn-neutral text-xs', attached && 'opacity-70')}
                          disabled={attached}
                          onClick={() => handleAttachFile(source.fileId ?? '')}
                        >
                          {attached
                            ? localize('com_ui_attached')
                            : localize('com_ui_use_in_chat')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-md p-2 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                        aria-label={localize('com_ui_delete')}
                        onClick={() => handleDeleteSource(source.sourceId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default memo(ProjectSourcesPanel);
