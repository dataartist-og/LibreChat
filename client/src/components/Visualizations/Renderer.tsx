import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { apiBaseUrl, request } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Mermaid from '~/components/Messages/Content/Mermaid';

type VisualizationRendererRecord = {
  visualizationId: string;
  title: string;
  artifactType: string;
  status: string;
  compiledRenderText?: string | null;
  compiledRenderMimeType: string;
  canonicalSourceText: string;
};

type VisualizationRendererProps = {
  visualization: VisualizationRendererRecord;
  expanded?: boolean;
  renderUrl?: string;
};

function getVisualizationRenderUrl(visualizationId: string, renderUrl?: string): string {
  return (
    renderUrl ?? `${apiBaseUrl()}/api/visualizations/${encodeURIComponent(visualizationId)}/render`
  );
}

const iframeCsp =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';";

export default function VisualizationRenderer({
  visualization,
  expanded = false,
  renderUrl,
}: VisualizationRendererProps) {
  const localize = useLocalize();
  const [renderText, setRenderText] = useState<string | null>(
    visualization.artifactType === 'html_app' ? (visualization.compiledRenderText ?? null) : null,
  );
  const [binaryUrl, setBinaryUrl] = useState<string | null>(
    visualization.artifactType === 'image' ? (visualization.compiledRenderText ?? null) : null,
  );
  const [renderError, setRenderError] = useState<string | null>(null);
  const sanitizedSvg = useMemo(() => {
    if (visualization.artifactType !== 'svg' || !visualization.compiledRenderText) {
      return null;
    }

    return DOMPurify.sanitize(visualization.compiledRenderText, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ['foreignObject', 'use', 'switch'],
      ADD_ATTR: [
        'dominant-baseline',
        'text-anchor',
        'requiredFeatures',
        'systemLanguage',
        'xmlns:xlink',
      ],
    });
  }, [visualization.artifactType, visualization.compiledRenderText]);

  useEffect(() => {
    setRenderError(null);

    if (visualization.artifactType === 'html_app') {
      if (visualization.compiledRenderText) {
        setRenderText(visualization.compiledRenderText);
        return;
      }

      let isCancelled = false;
      request
        .get<string>(getVisualizationRenderUrl(visualization.visualizationId, renderUrl))
        .then((value) => {
          if (!isCancelled) {
            setRenderText(value);
          }
        })
        .catch((error) => {
          if (!isCancelled) {
            setRenderError(
              error instanceof Error ? error.message : localize('com_ui_visualization_failed'),
            );
          }
        });

      return () => {
        isCancelled = true;
      };
    }

    setRenderText(null);
    return undefined;
  }, [
    localize,
    renderUrl,
    visualization.artifactType,
    visualization.compiledRenderText,
    visualization.visualizationId,
  ]);

  useEffect(() => {
    if (visualization.artifactType !== 'image') {
      setBinaryUrl(null);
      return undefined;
    }

    if (visualization.compiledRenderText) {
      setBinaryUrl(visualization.compiledRenderText);
      return undefined;
    }

    let isCancelled = false;
    let objectUrl: string | null = null;

    request
      .get<Blob>(getVisualizationRenderUrl(visualization.visualizationId, renderUrl), {
        responseType: 'blob',
      })
      .then((blob) => {
        if (isCancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setBinaryUrl(objectUrl);
      })
      .catch((error) => {
        if (!isCancelled) {
          setRenderError(
            error instanceof Error ? error.message : localize('com_ui_visualization_failed'),
          );
        }
      });

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    localize,
    renderUrl,
    visualization.artifactType,
    visualization.compiledRenderText,
    visualization.visualizationId,
  ]);

  if (visualization.status === 'failed') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        {visualization.description || localize('com_ui_visualization_failed')}
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        {localize('com_ui_visualization_failed')}
      </div>
    );
  }

  if (visualization.artifactType === 'html_app') {
    if (!renderText) {
      return (
        <div className="rounded-xl border border-border-light bg-surface-primary-alt px-3 py-6 text-sm text-text-secondary">
          {localize('com_ui_loading')}
        </div>
      );
    }

    return (
      <iframe
        title={visualization.title}
        srcDoc={renderText}
        sandbox="allow-scripts"
        csp={iframeCsp}
        className={`w-full rounded-xl border border-border-light bg-white ${
          expanded ? 'min-h-[70vh]' : 'min-h-[24rem]'
        }`}
      />
    );
  }

  if (visualization.artifactType === 'svg' && sanitizedSvg) {
    return (
      <div
        className={`rounded-xl border border-border-light bg-white/70 p-4 dark:bg-white/[0.02] ${
          expanded ? 'min-h-[60vh]' : ''
        }`}
        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
      />
    );
  }

  if (visualization.artifactType === 'image') {
    if (!binaryUrl) {
      return (
        <div className="rounded-xl border border-border-light bg-surface-primary-alt px-3 py-6 text-sm text-text-secondary">
          {localize('com_ui_loading')}
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border border-border-light bg-surface-primary-alt">
        <img
          src={binaryUrl}
          alt={visualization.title}
          className={`h-auto w-full object-contain ${expanded ? 'max-h-[75vh]' : 'max-h-[32rem]'}`}
          loading="lazy"
        />
      </div>
    );
  }

  if (visualization.artifactType === 'mermaid') {
    return (
      <div className="overflow-hidden rounded-xl border border-border-light bg-surface-primary-alt">
        <Mermaid>{visualization.compiledRenderText ?? visualization.canonicalSourceText}</Mermaid>
      </div>
    );
  }

  if (visualization.artifactType === 'markdown_explainer_with_embeds') {
    return (
      <div className="bg-surface-primary/60 rounded-xl border border-border-light p-4">
        <MarkdownLite
          content={visualization.compiledRenderText ?? visualization.canonicalSourceText}
        />
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded-xl border border-border-light bg-surface-primary-alt p-4 text-xs text-text-secondary">
      {visualization.compiledRenderText ?? visualization.canonicalSourceText}
    </pre>
  );
}
