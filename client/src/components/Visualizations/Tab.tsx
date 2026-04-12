import { useEffect, useMemo, useState } from 'react';
import { Loader2, WandSparkles } from 'lucide-react';
import type {
  TClarification,
  TVisualization,
  TVisualizationArtifactType,
} from 'librechat-data-provider';
import { useCreateVisualizationMutation, useVisualizationSuggestionsQuery } from '~/data-provider';
import { useLocalize, type TranslationKeys } from '~/hooks';
import VisualizationCard from './Card';

type InlineSuggestionProfile = 'conceptual' | 'procedural' | 'equational' | 'precise' | 'mixed';

type VisualizationTabProps = {
  anchorStart: number;
  anchorEnd: number;
  anchorText: string;
  anchorContextBefore: string;
  anchorContextAfter: string;
  conversationId: string;
  parentMessageId: string;
  projectId?: string | null;
  clarifications: TClarification[];
  visualizations: TVisualization[];
};

const quickTypes: Array<{ artifactType: TVisualizationArtifactType; labelKey: TranslationKeys }> = [
  { artifactType: 'html_app', labelKey: 'com_ui_interactive_html' },
  { artifactType: 'svg', labelKey: 'com_ui_svg' },
  { artifactType: 'mermaid', labelKey: 'com_ui_mermaid' },
  { artifactType: 'image', labelKey: 'com_ui_static_image' },
];
const contentProfileLabelKeys: Record<InlineSuggestionProfile, TranslationKeys> = {
  conceptual: 'com_ui_content_profile_conceptual',
  procedural: 'com_ui_content_profile_procedural',
  equational: 'com_ui_content_profile_equational',
  precise: 'com_ui_content_profile_precise',
  mixed: 'com_ui_content_profile_mixed',
};

function mapExistingClarifications(clarifications: TClarification[]) {
  return clarifications.slice(0, 3).map((clarification) => ({
    question: clarification.clarificationQuestion,
    answer: clarification.clarificationAnswer,
  }));
}

export default function VisualizationTab({
  anchorStart,
  anchorEnd,
  anchorText,
  anchorContextBefore,
  anchorContextAfter,
  conversationId,
  parentMessageId,
  projectId,
  clarifications,
  visualizations,
}: VisualizationTabProps) {
  const localize = useLocalize();
  const createMutation = useCreateVisualizationMutation();
  const [prompt, setPrompt] = useState('');
  const [artifactType, setArtifactType] = useState<TVisualizationArtifactType>('html_app');
  const [activeVisualizationId, setActiveVisualizationId] = useState<string | null>(null);
  const visualizationSuggestionsQuery = useVisualizationSuggestionsQuery(
    {
      projectId,
      conversationId,
      parentMessageId,
      anchorStart,
      anchorEnd,
      anchorText,
      anchorContextBefore,
      anchorContextAfter,
      existingClarifications: mapExistingClarifications(clarifications),
    },
    {
      enabled: true,
    },
  );

  const sortedVisualizations = useMemo(
    () =>
      [...visualizations].sort(
        (left, right) =>
          Number(right.isLatestVersion) - Number(left.isLatestVersion) ||
          right.versionNumber - left.versionNumber,
      ),
    [visualizations],
  );
  const activeVisualization =
    sortedVisualizations.find((item) => item.visualizationId === activeVisualizationId) ??
    sortedVisualizations[0] ??
    null;
  const buttonLabel = (item: TVisualization) =>
    `${item.title} · v${item.versionNumber}${item.isLatestVersion ? ` · ${localize('com_ui_latest')}` : ''}`;

  useEffect(() => {
    if (!activeVisualizationId && sortedVisualizations[0]) {
      setActiveVisualizationId(sortedVisualizations[0].visualizationId);
      return;
    }

    if (
      activeVisualizationId &&
      !sortedVisualizations.some((item) => item.visualizationId === activeVisualizationId)
    ) {
      setActiveVisualizationId(sortedVisualizations[0]?.visualizationId ?? null);
    }
  }, [activeVisualizationId, sortedVisualizations]);

  const handleCreate = async () => {
    if (!prompt.trim()) {
      return;
    }

    const created = await createMutation.mutateAsync({
      projectId: projectId ?? undefined,
      conversationId,
      parentMessageId,
      anchorStart,
      anchorEnd,
      anchorText,
      anchorContextBefore,
      anchorContextAfter,
      prompt: prompt.trim(),
      artifactType,
    });

    setActiveVisualizationId(created.visualizationId);
    setPrompt('');
  };

  return (
    <div className="space-y-3">
      <div className="bg-surface-secondary/30 rounded-xl border border-border-light p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {localize('com_ui_visualization')}
        </div>
        {visualizationSuggestionsQuery.isLoading ? (
          <div className="bg-surface-primary/40 mb-3 flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {localize('com_ui_generating_suggestions')}
          </div>
        ) : null}
        {!visualizationSuggestionsQuery.isLoading && visualizationSuggestionsQuery.isError ? (
          <div className="bg-surface-primary/40 mb-3 rounded-xl border border-dashed border-border-light px-3 py-2 text-sm text-text-secondary">
            {localize('com_ui_suggestions_unavailable')}
          </div>
        ) : null}
        {visualizationSuggestionsQuery.data ? (
          <>
            <div className="bg-surface-primary/60 mb-3 rounded-xl border border-border-light px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {localize('com_ui_content_profile')}{' '}
                <span className="text-text-primary">
                  {localize(
                    contentProfileLabelKeys[visualizationSuggestionsQuery.data.contentProfile] ??
                      contentProfileLabelKeys.mixed,
                  )}
                </span>
              </div>
              <div className="mt-1 text-sm text-text-primary">
                {visualizationSuggestionsQuery.data.focusSummary}
              </div>
            </div>
            <div className="mb-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                {localize('com_ui_suggested_visualizations')}
              </div>
              {visualizationSuggestionsQuery.data.suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.label}:${suggestion.artifactType}`}
                  type="button"
                  className="bg-surface-primary/70 w-full rounded-xl border border-border-light px-3 py-2 text-left transition hover:bg-surface-hover"
                  onClick={() => {
                    setPrompt(suggestion.proposedPrompt);
                    setArtifactType(suggestion.artifactType);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-text-primary">
                      {suggestion.label}
                    </div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-secondary">
                      {localize('com_ui_use_suggestion')}
                    </div>
                  </div>
                  <div className="mt-1">
                    <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                      {suggestion.artifactType}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-text-primary">{suggestion.proposedPrompt}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {suggestion.understandingGain}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <div className="mb-3 flex flex-wrap gap-2">
          {quickTypes.map((item) => (
            <button
              key={item.artifactType}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                artifactType === item.artifactType
                  ? 'bg-surface-active-alt text-text-primary'
                  : 'bg-surface-primary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
              onClick={() => setArtifactType(item.artifactType)}
            >
              {localize(item.labelKey)}
            </button>
          ))}
        </div>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={localize('com_ui_visualization_prompt_placeholder')}
          className="min-h-[96px] w-full rounded-xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary outline-none focus:border-border-heavy"
        />
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            className="btn btn-primary"
            disabled={createMutation.isLoading || prompt.trim().length === 0}
            onClick={handleCreate}
          >
            {createMutation.isLoading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="mr-1 h-4 w-4" />
            )}
            {localize('com_ui_generate_visualization')}
          </button>
        </div>
      </div>

      {sortedVisualizations.length > 0 ? (
        <div className="bg-surface-primary/70 rounded-xl border border-border-light p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {sortedVisualizations.map((item) => (
              <button
                key={item.visualizationId}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeVisualization?.visualizationId === item.visualizationId
                    ? 'bg-surface-active-alt text-text-primary'
                    : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
                onClick={() => setActiveVisualizationId(item.visualizationId)}
              >
                {buttonLabel(item)}
              </button>
            ))}
          </div>

          {activeVisualization ? (
            <VisualizationCard
              visualization={activeVisualization}
              conversationId={conversationId}
              parentMessageId={parentMessageId}
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-light px-4 py-6 text-sm text-text-secondary">
          {localize('com_ui_no_visualizations_yet')}
        </div>
      )}
    </div>
  );
}
