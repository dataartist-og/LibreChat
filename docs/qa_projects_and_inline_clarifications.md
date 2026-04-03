# QA Checklist: Projects and Inline Clarifications

## Manual Verification

1. Create a new project from the left sidebar.
2. Open the project sources panel and add at least one source.
3. Upload a plain text file into the active project and confirm it appears in the sources list.
4. Start a conversation inside that project and confirm the conversation only appears when that project is active.
5. Generate or seed a long assistant response.
6. Select a span inside the assistant response and choose `Ask inline clarification`.
7. Submit a clarification question and confirm:
   - it is not added as a top-level chat turn
   - it renders inline near the anchored text
   - refresh preserves it
8. Collapse and expand the clarification block.
9. Edit the clarification question or answer and confirm the update persists.
10. Use `Integrate into parent` and save a merged version.
11. Confirm the parent assistant message text changes.
12. Confirm `GET /api/messages/:messageId/revisions` returns a `clarification_integration` revision.
13. Simulate parent text drift and call re-anchor; confirm the clarification either:
   - moves to a recovered span, or
   - records manual re-anchor metadata

## Focused Test Commands

```bash
cd packages/data-schemas && npx jest src/methods/project.spec.ts --runInBand
cd packages/api && npx jest src/clarifications/anchors.spec.ts src/clarifications/service.spec.ts --runInBand
cd client && npx jest src/components/Projects/__tests__/Sidebar.test.tsx src/components/UnifiedSidebar/__tests__/ConversationsSection.test.tsx src/components/Clarifications/__tests__/Annotated.test.tsx src/components/Clarifications/__tests__/Block.test.tsx --runInBand
```

## API Verification Notes

Verified locally with:

- project creation via `POST /api/projects`
- project file upload via `POST /api/files` with `projectId`
- source association via `GET /api/projects/:projectId/sources`
- clarification generation via `POST /api/conversations/:conversationId/clarifications`
- clarification integration via `POST /api/clarifications/:clarificationId/integrate`
- revision history via `GET /api/messages/:messageId/revisions`
- drift recovery via `POST /api/clarifications/:clarificationId/reanchor`

