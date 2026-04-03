import { memo, useEffect, useMemo, useState } from 'react';
import { Pencil, Archive, Plus, Check, X } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useLocalize, useNewConvo } from '~/hooks';
import {
  useProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useArchiveProjectMutation,
} from '~/data-provider';
import { cn } from '~/utils';
import store from '~/store';

function ProjectSidebar() {
  const localize = useLocalize();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const [activeProjectId, setActiveProjectId] = useRecoilState(store.activeProjectId);
  const { data: projects = [] } = useProjectsQuery();
  const createProjectMutation = useCreateProjectMutation();
  const updateProjectMutation = useUpdateProjectMutation();
  const archiveProjectMutation = useArchiveProjectMutation();
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const activeProjects = useMemo(
    () => projects.filter((project) => !project.archivedAt),
    [projects],
  );

  useEffect(() => {
    if (activeProjects.length === 0) {
      return;
    }

    if (!activeProjectId || !activeProjects.some((project) => project.projectId === activeProjectId)) {
      setActiveProjectId(activeProjects[0].projectId);
    }
  }, [activeProjectId, activeProjects, setActiveProjectId]);

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);

    if (conversation?.projectId === projectId) {
      return;
    }

    newConversation({
      template: {
        projectId,
      },
    });
  };

  const handleCreateProject = async () => {
    const name = draftName.trim();
    if (!name) {
      return;
    }

    const project = await createProjectMutation.mutateAsync({
      name,
      description: draftDescription.trim() || undefined,
    });

    setActiveProjectId(project.projectId);
    setDraftName('');
    setDraftDescription('');
    setIsCreating(false);
    newConversation({
      template: {
        projectId: project.projectId,
      },
    });
  };

  const handleRenameProject = async (projectId: string) => {
    const name = editingName.trim();
    if (!name) {
      setEditingProjectId(null);
      return;
    }

    await updateProjectMutation.mutateAsync({
      projectId,
      name,
    });
    setEditingProjectId(null);
  };

  const handleArchiveProject = async (projectId: string) => {
    await archiveProjectMutation.mutateAsync(projectId);
    const nextProject = activeProjects.find((project) => project.projectId !== projectId);
    if (activeProjectId === projectId && nextProject) {
      handleSelectProject(nextProject.projectId);
    }
  };

  return (
    <div className="mb-2 rounded-xl border border-border-light/70 bg-surface-secondary/40 px-2 py-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {localize('com_ui_projects')}
        </h2>
        <button
          type="button"
          aria-label={localize('com_ui_create_project')}
          className="rounded-md p-1 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
          onClick={() => setIsCreating((prev) => !prev)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1">
        {activeProjects.map((project) => {
          const isActive = project.projectId === activeProjectId;
          const isEditing = editingProjectId === project.projectId;

          return (
            <div
              key={project.projectId}
              className={cn(
                'group rounded-lg border px-2 py-2 transition',
                isActive
                  ? 'border-border-heavy bg-surface-active-alt'
                  : 'border-transparent hover:border-border-medium hover:bg-surface-hover',
              )}
            >
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    className="h-8 flex-1 rounded-md border border-border-medium bg-transparent px-2 text-sm text-text-primary outline-none focus:border-border-heavy"
                    aria-label={localize('com_ui_project_name')}
                  />
                  <button
                    type="button"
                    className="rounded-md p-1 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                    aria-label={localize('com_ui_save')}
                    onClick={() => handleRenameProject(project.projectId)}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                    aria-label={localize('com_ui_cancel')}
                    onClick={() => setEditingProjectId(null)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    onClick={() => handleSelectProject(project.projectId)}
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: project.color ?? '#64748b' }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text-primary">
                        {project.name}
                      </span>
                      {project.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-text-secondary">
                          {project.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded-md p-1 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                      aria-label={localize('com_ui_rename')}
                      onClick={() => {
                        setEditingProjectId(project.projectId);
                        setEditingName(project.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {project.name !== 'General' ? (
                      <button
                        type="button"
                        className="rounded-md p-1 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                        aria-label={localize('com_ui_archive_project')}
                        onClick={() => handleArchiveProject(project.projectId)}
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isCreating ? (
        <div className="mt-2 space-y-2 rounded-lg border border-border-light bg-surface-primary px-2 py-2">
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder={localize('com_ui_project_name')}
            className="h-9 w-full rounded-md border border-border-medium bg-transparent px-2 text-sm text-text-primary outline-none focus:border-border-heavy"
            aria-label={localize('com_ui_project_name')}
          />
          <textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            placeholder={localize('com_ui_project_description')}
            className="min-h-[72px] w-full rounded-md border border-border-medium bg-transparent px-2 py-2 text-sm text-text-primary outline-none focus:border-border-heavy"
            aria-label={localize('com_ui_project_description')}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-neutral"
              onClick={() => {
                setDraftName('');
                setDraftDescription('');
                setIsCreating(false);
              }}
            >
              {localize('com_ui_cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleCreateProject}>
              {localize('com_ui_create_project')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(ProjectSidebar);
