import { useMemo } from 'react';
import type {
  TDialogCell,
  TDialogClarification,
  TDialogPlanNode,
  TDialogTrajectory,
  TDialogVisualization,
  TDialogWorkspace,
} from 'librechat-data-provider';
import { Plus } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useLearnerWorkspaceQuery } from '~/data-provider/Learners';
import {
  useCreateDialogCellMutation,
  useDialogTutorQuery,
  useRunDialogTutorActionMutation,
  useSelectDialogTrajectoryMutation,
  useUpdateDialogMutation,
} from '~/data-provider/Dialogs';
import DialogCellCard from './Cell';

function groupByCellId<T extends { cellId: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const current = grouped.get(item.cellId) ?? [];
    current.push(item);
    grouped.set(item.cellId, current);
  });

  return grouped;
}

function getNewCellDefaults(
  cellType: TDialogCell['cellType'],
): Pick<TDialogCell, 'title' | 'sourceMarkdown' | 'sourceCode'> {
  if (cellType === 'note') {
    return {
      title: 'New note',
      sourceMarkdown: '## New note\n\nCapture what you are learning here.',
      sourceCode: undefined,
    };
  }

  if (cellType === 'code') {
    return {
      title: 'New code cell',
      sourceMarkdown: undefined,
      sourceCode: 'from pathlib import Path\n\nrepo = Path(repo_root)\nprint(repo)',
    };
  }

  return {
    title: 'New prompt cell',
    sourceMarkdown: '',
    sourceCode: undefined,
  };
}

function getStatusClassName(status: TDialogPlanNode['status']): string {
  if (status === 'mastered') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  }
  if (status === 'in_progress') {
    return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
  }
  if (status === 'needs_breakdown') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
  if (status === 'skipped') {
    return 'bg-slate-500/15 text-slate-700 dark:text-slate-300';
  }
  if (status === 'blocked') {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  }
  return 'bg-border-light text-text-secondary';
}

function getLearnerStatusTone(status: 'emerging' | 'practicing' | 'solid' | 'mastered') {
  if (status === 'practicing') {
    return 'in_progress';
  }

  if (status === 'emerging') {
    return 'not_started';
  }

  return 'mastered';
}

export default function DialogWorkspace({ workspace }: { workspace: TDialogWorkspace }) {
  const localize = useLocalize();
  const updateDialogMutation = useUpdateDialogMutation();
  const selectTrajectoryMutation = useSelectDialogTrajectoryMutation();
  const createCellMutation = useCreateDialogCellMutation();
  const tutorActionMutation = useRunDialogTutorActionMutation();
  const { data: tutor } = useDialogTutorQuery(workspace.dialog.dialogId);
  const { data: learner } = useLearnerWorkspaceQuery();

  const trajectories = useMemo(() => {
    const metadata = workspace.dialog.metadataJson as { trajectories?: TDialogTrajectory[] } | null;
    return Array.isArray(metadata?.trajectories) ? metadata.trajectories : [];
  }, [workspace.dialog.metadataJson]);

  const clarificationsByCell = useMemo(
    () => groupByCellId<TDialogClarification>(workspace.clarifications),
    [workspace.clarifications],
  );
  const visualizationsByCell = useMemo(
    () => groupByCellId<TDialogVisualization>(workspace.visualizations),
    [workspace.visualizations],
  );
  const sortedCells = useMemo(
    () => [...workspace.cells].sort((left, right) => left.position - right.position),
    [workspace.cells],
  );
  const sortedPlanNodes = useMemo(
    () => [...(tutor?.nodes ?? [])].sort((left, right) => left.priority - right.priority),
    [tutor?.nodes],
  );
  const activeNode = useMemo(
    () => sortedPlanNodes.find((node) => node.nodeId === tutor?.tutorState?.activeNodeId) ?? null,
    [sortedPlanNodes, tutor?.tutorState?.activeNodeId],
  );
  const learnerNodes = useMemo(() => {
    if (!learner) {
      return [];
    }

    const normalizedActive = activeNode?.title.toLowerCase() ?? '';
    const matchingNodes = learner.nodes.filter(
      (node) =>
        normalizedActive.length > 0 &&
        (node.label.toLowerCase().includes(normalizedActive) ||
          normalizedActive.includes(node.label.toLowerCase())),
    );

    return (matchingNodes.length > 0 ? matchingNodes : learner.nodes).slice(0, 4);
  }, [activeNode?.title, learner]);
  const completionState = tutor?.tutorState?.completionState ?? 'active';
  const activeStatus =
    completionState === 'complete' ? 'mastered' : (activeNode?.status ?? 'not_started');
  const activeStatusLabel =
    completionState === 'complete'
      ? localize('com_ui_dialog_complete')
      : localize(`com_ui_dialog_status_${activeStatus}`);

  const addCell = async (cellType: TDialogCell['cellType']) => {
    const defaults = getNewCellDefaults(cellType);
    await createCellMutation.mutateAsync({
      dialogId: workspace.dialog.dialogId,
      cellType,
      title: defaults.title,
      sourceMarkdown: defaults.sourceMarkdown,
      sourceCode: defaults.sourceCode,
    });
  };

  const runTutorAction = async (
    action: 'advance' | 'understood' | 'break_down' | 'stuck' | 'skip',
  ) => {
    await tutorActionMutation.mutateAsync({
      dialogId: workspace.dialog.dialogId,
      action,
      nodeId: activeNode?.nodeId ?? undefined,
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-surface-primary">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-border-light px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {localize('com_ui_dialog_workspace')}
              </div>
              <h1 className="mt-1 truncate text-2xl font-semibold text-text-primary">
                {workspace.dialog.title}
              </h1>
              {workspace.dialog.description ? (
                <div className="mt-2 max-w-3xl text-sm text-text-secondary">
                  {workspace.dialog.description}
                </div>
              ) : null}
            </div>

            <select
              className="rounded-xl border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
              value={workspace.dialog.teachingMode}
              onChange={(event) =>
                updateDialogMutation.mutateAsync({
                  dialogId: workspace.dialog.dialogId,
                  teachingMode: event.target.value as TDialogWorkspace['dialog']['teachingMode'],
                })
              }
            >
              <option value="teach_me">{localize('com_ui_teach_me')}</option>
              <option value="hint_mode">{localize('com_ui_hint_mode')}</option>
              <option value="explain_then_do">{localize('com_ui_explain_then_do')}</option>
              <option value="just_do_it">{localize('com_ui_just_do_it')}</option>
            </select>
          </div>

          {trajectories.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {trajectories.map((trajectory) => {
                const typedTrajectory = trajectory as {
                  key: string;
                  title: string;
                  description: string;
                };
                const isActive = workspace.dialog.selectedTrajectoryKey === typedTrajectory.key;

                return (
                  <button
                    key={typedTrajectory.key}
                    type="button"
                    className={`rounded-full px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-text-primary text-white dark:text-black'
                        : 'border border-border-light text-text-primary hover:bg-surface-hover'
                    }`}
                    title={typedTrajectory.description}
                    onClick={() =>
                      selectTrajectoryMutation.mutateAsync({
                        dialogId: workspace.dialog.dialogId,
                        trajectoryKey: typedTrajectory.key,
                      })
                    }
                  >
                    {typedTrajectory.title}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="bg-surface-hover/40 mt-5 rounded-2xl border border-border-light p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_dialog_active_step')}
                </div>
                <div className="mt-1 text-lg font-semibold text-text-primary">
                  {activeNode?.title ?? localize('com_ui_dialog_no_active_step')}
                </div>
                <div className="mt-1 max-w-3xl text-sm text-text-secondary">
                  {activeNode?.objective ?? localize('com_ui_dialog_no_active_step_desc')}
                </div>
              </div>

              <span
                className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${getStatusClassName(activeStatus)}`}
              >
                {activeStatusLabel}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-text-primary px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:text-black"
                disabled={!activeNode || tutorActionMutation.isLoading}
                onClick={() => runTutorAction('understood')}
              >
                {localize('com_ui_dialog_action_understood')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                disabled={!activeNode || tutorActionMutation.isLoading}
                onClick={() => runTutorAction('advance')}
              >
                {localize('com_ui_dialog_action_continue')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                disabled={!activeNode || tutorActionMutation.isLoading}
                onClick={() => runTutorAction('break_down')}
              >
                {localize('com_ui_dialog_action_break_down')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                disabled={!activeNode || tutorActionMutation.isLoading}
                onClick={() => runTutorAction('stuck')}
              >
                {localize('com_ui_dialog_action_stuck')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                disabled={!activeNode || tutorActionMutation.isLoading}
                onClick={() => runTutorAction('skip')}
              >
                {localize('com_ui_dialog_action_skip')}
              </button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
              {sortedCells.map((cell) => (
                <DialogCellCard
                  key={cell.cellId}
                  dialogId={workspace.dialog.dialogId}
                  cell={cell}
                  clarifications={clarificationsByCell.get(cell.cellId) ?? []}
                  visualizations={visualizationsByCell.get(cell.cellId) ?? []}
                />
              ))}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                  onClick={() => addCell('note')}
                >
                  <Plus className="h-4 w-4" />
                  {localize('com_ui_add_note_cell')}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                  onClick={() => addCell('code')}
                >
                  <Plus className="h-4 w-4" />
                  {localize('com_ui_add_code_cell')}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-primary transition hover:bg-surface-hover"
                  onClick={() => addCell('prompt')}
                >
                  <Plus className="h-4 w-4" />
                  {localize('com_ui_add_prompt_cell')}
                </button>
              </div>
            </div>
          </div>

          <aside className="hidden w-80 flex-shrink-0 border-l border-border-light xl:block">
            <div className="h-full overflow-y-auto px-4 py-6">
              <div className="mb-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_dialog_learner_state')}
                </div>
                {learner ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border-light p-3">
                      <div className="text-sm font-medium text-text-primary">
                        {localize('com_ui_dialog_knowledge_level')}
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">
                        {learner.profile.knowledgeLevelSummary}
                      </div>
                    </div>

                    {learner.profile.currentFocusLabels.length > 0 ? (
                      <div className="rounded-xl border border-border-light p-3">
                        <div className="text-sm font-medium text-text-primary">
                          {localize('com_ui_dialog_current_focus')}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {learner.profile.currentFocusLabels.slice(0, 6).map((label) => (
                            <span
                              key={label}
                              className="rounded-full bg-surface-hover px-2 py-1 text-xs text-text-secondary"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-border-light p-3">
                      <div className="text-sm font-medium text-text-primary">
                        {localize('com_ui_dialog_relevant_knowledge')}
                      </div>
                      <div className="mt-2 space-y-2">
                        {learnerNodes.length === 0 ? (
                          <div className="text-sm text-text-secondary">
                            {localize('com_ui_dialog_no_learner_nodes')}
                          </div>
                        ) : (
                          learnerNodes.map((node) => (
                            <div
                              key={node.learnerNodeId}
                              className="bg-surface-hover/50 rounded-lg p-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-medium text-text-primary">
                                  {node.label}
                                </div>
                                <span
                                  className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getStatusClassName(
                                    getLearnerStatusTone(node.status),
                                  )}`}
                                >
                                  {localize(`com_ui_dialog_learner_status_${node.status}`)}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-text-secondary">
                                {localize('com_ui_dialog_mastery_label', {
                                  mastery: `${Math.round(node.mastery * 100)}%`,
                                  confidence: `${Math.round(node.confidence * 100)}%`,
                                })}
                              </div>
                              {node.evidenceSummary ? (
                                <div className="mt-1 text-xs text-text-secondary">
                                  {node.evidenceSummary}
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border-light p-3">
                      <div className="text-sm font-medium text-text-primary">
                        {localize('com_ui_dialog_recent_evidence')}
                      </div>
                      <div className="mt-2 space-y-2">
                        {learner.recentEvents.length === 0 ? (
                          <div className="text-sm text-text-secondary">
                            {localize('com_ui_dialog_no_recent_evidence')}
                          </div>
                        ) : (
                          learner.recentEvents.slice(0, 4).map((event) => (
                            <div key={event.eventId} className="bg-surface-hover/50 rounded-lg p-2">
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                                {localize(`com_ui_dialog_surface_${event.surface}`)}
                              </div>
                              <div className="mt-1 text-sm text-text-primary">{event.summary}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border-light px-3 py-4 text-sm text-text-secondary">
                    {localize('com_ui_dialog_learner_loading')}
                  </div>
                )}
              </div>

              <div className="mb-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_imports')}
                </div>
                <div className="space-y-2">
                  {workspace.imports.map((dialogImport) => (
                    <div
                      key={dialogImport.importId}
                      className="rounded-xl border border-border-light p-3"
                    >
                      <div className="text-sm font-medium text-text-primary">
                        {dialogImport.title}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-text-secondary">
                        {dialogImport.sourceType}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_dialog_trajectory_tree')}
                </div>
                <div className="space-y-2">
                  {sortedPlanNodes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border-light px-3 py-4 text-sm text-text-secondary">
                      {localize('com_ui_dialog_no_plan')}
                    </div>
                  ) : (
                    sortedPlanNodes.map((node) => {
                      const isActive = node.nodeId === activeNode?.nodeId;
                      return (
                        <div
                          key={node.nodeId}
                          className={`rounded-xl border border-border-light p-3 ${
                            isActive ? 'bg-surface-hover/50' : ''
                          }`}
                          style={{ marginLeft: `${node.depth * 12}px` }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-text-primary">
                                {node.title}
                              </div>
                              <div className="mt-1 text-xs text-text-secondary">
                                {node.objective}
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getStatusClassName(
                                node.status,
                              )}`}
                            >
                              {localize(`com_ui_dialog_status_${node.status}`)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  {localize('com_ui_source_map')}
                </div>
                <div className="space-y-2">
                  {workspace.sourceMaps.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border-light px-3 py-4 text-sm text-text-secondary">
                      {localize('com_ui_no_source_map_yet')}
                    </div>
                  ) : (
                    workspace.sourceMaps.map((sourceMap) => (
                      <div
                        key={sourceMap.mapId}
                        className="rounded-xl border border-border-light p-3"
                      >
                        <div className="text-sm font-medium text-text-primary">
                          {sourceMap.paperAnchor}
                        </div>
                        <div className="mt-1 text-sm text-text-secondary">{sourceMap.repoPath}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
