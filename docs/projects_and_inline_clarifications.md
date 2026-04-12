# Projects, Inline Clarifications, and Visualizations

## Overview

This feature set turns LibreChat into a project-scoped research workspace with inline, anchored clarification and visualization threads on assistant responses.

The MVP adds:

- first-class `projects`
- project-scoped `sources`
- project-scoped `conversations`
- anchored `message_clarifications`
- anchored `visualization_artifacts`
- inline rendering and merge-back into parent assistant content
- parent `message_revisions` for traceable integration history

## Architecture Summary

### Backend

New backend logic is split across the existing shared-package and route layers:

- `packages/data-schemas`
  - project, project source, clarification, and message revision models/types/methods
  - conversation/message/file schemas updated with `projectId`
- `packages/api`
  - `projects/service.ts`
  - `clarifications/service.ts`
  - `clarifications/prompt.ts`
  - `clarifications/anchors.ts`
  - `visualizations/service.ts`
  - `visualizations/prompt.ts`
  - `visualizations/sanitize.ts`
  - `visualizations/storage.ts`
- `api/server/routes`
  - `projects.js`
  - `conversations.js`
  - `clarifications.js`
  - `visualizations.js`

### Frontend

The UI keeps LibreChat’s existing message renderer and adds an annotation layer around assistant content.

- `client/src/components/Projects/Sidebar.tsx`
- `client/src/components/Projects/Sources.tsx`
- `client/src/components/Clarifications/Annotated.tsx`
- `client/src/components/Clarifications/Block.tsx`
- `client/src/components/Clarifications/Merge.tsx`
- `client/src/components/Visualizations/Tab.tsx`
- `client/src/components/Visualizations/Card.tsx`
- `client/src/components/Visualizations/Renderer.tsx`

Supporting state and data access live in:

- `client/src/store/projects.ts`
- `client/src/data-provider/Projects/*`
- `client/src/data-provider/Clarifications/*`
- `client/src/data-provider/Visualizations/*`

## Schema Summary

### Projects

Collection: `projects`

Fields:

- `projectId`
- `name`
- `description`
- `icon`
- `color`
- `createdAt`
- `updatedAt`
- `archivedAt`
- `ownerUserId`

### Project Sources

Collection: `projectsources`

Fields:

- `sourceId`
- `projectId`
- `sourceType` (`file`, `url`, `note`)
- `title`
- `description`
- `fileId`
- `url`
- `noteBody`
- `createdAt`
- `updatedAt`
- `ownerUserId`

### Clarifications

Collection: `messageclarifications`

Fields:

- `clarificationId`
- `projectId`
- `conversationId`
- `parentMessageId`
- `anchorStart`
- `anchorEnd`
- `anchorText`
- `anchorContextBefore`
- `anchorContextAfter`
- `clarificationQuestion`
- `clarificationAnswer`
- `status` (`active`, `collapsed`, `integrated`, `archived`)
- `createdByUserId`
- `createdAt`
- `updatedAt`
- `integratedAt`
- `integrationPatch`

### Visualizations

Collection: `visualizationartifacts`

Fields:

- `visualizationId`
- `projectId`
- `conversationId`
- `parentMessageId`
- `anchorStart`
- `anchorEnd`
- `anchorText`
- `anchorContextBefore`
- `anchorContextAfter`
- `anchorPath`
- `inlineThreadId`
- `parentVisualizationId`
- `rootVisualizationId`
- `title`
- `description`
- `artifactType` (`html_app`, `svg`, `image`, `mermaid`, `markdown_explainer_with_embeds`, `json_spec`)
- `status` (`draft`, `ready`, `failed`, `archived`)
- `storageMode` (`db_inline`, `file_store`, `hybrid`)
- `canonicalSourceText`
- `canonicalSourceMimeType`
- `compiledRenderText`
- `compiledRenderMimeType`
- `compiledRenderStoragePath`
- `thumbnailUrl`
- `sourcePrompt`
- `generationModel`
- `generationMetadata`
- `integrationState` (`nested_only`, `integrated`, `detached`)
- `isLatestVersion`
- `versionNumber`
- `createdByUserId`
- `integratedAt`
- `deletedAt`

### Message Revisions

Collection: `messagerevisions`

Used to preserve parent message edits created by clarification integration.

## API Summary

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`

### Project Sources

- `GET /api/projects/:projectId/sources`
- `POST /api/projects/:projectId/sources`
- `PATCH /api/projects/:projectId/sources/:sourceId`
- `DELETE /api/projects/:projectId/sources/:sourceId`

### Clarifications

- `GET /api/conversations/:conversationId/clarifications`
- `POST /api/conversations/:conversationId/clarifications`
- `PATCH /api/clarifications/:clarificationId`
- `POST /api/clarifications/:clarificationId/integrate`
- `POST /api/clarifications/:clarificationId/reanchor`

### Visualizations

- `GET /api/visualizations?conversationId=...&messageId=...`
- `POST /api/visualizations`
- `GET /api/visualizations/:visualizationId`
- `PATCH /api/visualizations/:visualizationId`
- `POST /api/visualizations/:visualizationId/regenerate`
- `POST /api/visualizations/:visualizationId/integrate`
- `POST /api/visualizations/:visualizationId/duplicate`
- `DELETE /api/visualizations/:visualizationId`
- `GET /api/visualizations/:visualizationId/render`

### Revision History

- `GET /api/messages/:messageId/revisions`

## Frontend Component Map

### Project UX

- `ProjectSidebar`
  - project list
  - create
  - rename
  - archive
  - active project selection
- `ProjectSourcesPanel`
  - notes
  - links
  - uploaded files
  - attach file source to active chat

### Clarification UX

- `AnnotatedAssistantMessage`
  - text selection handling
  - anchor grouping
  - inline slot creation
  - clarification composer popover
- `ClarificationBlock`
  - expand/collapse
  - edit question
  - edit answer
  - regenerate
  - archive
  - re-anchor
  - show revision history
- `ClarificationMergeModal`
  - original excerpt
  - clarification answer
  - editable merged parent content

### Visualization UX

- `VisualizationTab`
  - prompt composer
  - quick artifact type chips
  - attached visualization list
  - active visualization preview
- `VisualizationCard`
  - edit metadata and source
  - regenerate
  - duplicate
  - integrate into parent
  - delete
  - open expanded preview
- `VisualizationRenderer`
  - sandboxed iframe rendering for `html_app`
  - inline sanitized rendering for `svg`
  - responsive image rendering for `image`
  - native Mermaid rendering for `mermaid`

## Setup Instructions

### Prerequisites

- Node 20.19+
- MongoDB running locally or reachable via `MONGO_URI`
- Meilisearch is recommended but not required for the core project/clarification flow

### Start dependencies

```bash
docker compose up -d mongodb meilisearch
```

### Build shared packages

```bash
npm run build:data-provider
npm run build:data-schemas
npm run build:api
npm run build:client-package
npm run migrate:inline-visualizations:dry-run
```

### Start the backend

```bash
npx cross-env NODE_ENV=production node api/server/index.js
```

For local API-driven verification, disabling ban middleware is useful:

```bash
npx cross-env NODE_ENV=production BAN_VIOLATIONS=false node api/server/index.js
```

### Start the frontend

```bash
cd client
npm run dev
```

## Environment Variables

Required:

- existing LibreChat env values, especially `MONGO_URI`
- `OPENAI_API_KEY` for live clarification generation
- `OPENAI_API_KEY` for live visualization generation

Optional:

- `INLINE_CLARIFICATION_MODEL`
  - overrides the model used for clarification generation
  - defaults to `OPENAI_MODEL`, then `gpt-4o-mini`
- `INLINE_VISUALIZATION_MODEL`
  - overrides the chat model used for visualization generation
- `INLINE_VISUALIZATION_IMAGE_MODEL`
  - overrides the image model used for `image` artifacts

## Notes on Source Ingestion

- Uploaded project files reuse LibreChat’s existing message-attachment path.
- When a file upload includes `projectId`, the backend auto-creates a matching project source record.
- Project clarification generation pulls project file text from the existing file store when available.
- Visualization payloads up to 256 KB stay inline in Mongo metadata; larger compiled render payloads spill into `uploads/visualizations`.
- `html_app` render payloads are sanitized server-side and served from a dedicated render route with strict CSP, then loaded in a sandboxed iframe with `allow-scripts` only.

## Known Limitations

- Anchors use character offsets against the rendered plain-text form of the assistant response.
- Re-anchoring is limited to:
  - exact offset
  - exact text search
  - same-paragraph fuzzy whole-word match
  - manual fallback if recovery fails
- Clarification generation currently uses the OpenAI client directly via `OPENAI_API_KEY` rather than routing through the selected chat provider.
- If Meilisearch is unavailable, conversation/file search sync logs errors but the core project and clarification flow still works.
- File uploads still pass through LibreChat’s existing browser-user-agent middleware; scripted upload checks need a browser-like `User-Agent`.
