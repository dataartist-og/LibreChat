# Lecture Center

Open `/lectures` in LibreChat. The main view contains the video, a compact chapter selector, and your notebook. Pause the video to see sources mapped to that moment. Choose **Explore** to open a full-page paper reader with a conversation panel. The video stays paused until you choose to continue.

## Studying a source

The reader loads the original public HTML, including equations, figures, tables, and headings, and scrolls to the indexed passage. Select text to focus your next question on a passage. The tutor can also retrieve relevant material elsewhere in that paper—for example its datasets, methods, controls, results, and limitations. It does not start a prewritten lesson when the reader opens.

Typed answers include source links and up to three factual takeaways. Completed voice exchanges are saved immediately; a separate grounded extraction request produces their takeaways. **My notes** lets you edit the takeaways, inspect the full answer, or remove the exchange. These are generated study notes, not a claim that the learner has mastered the material. Both the question and answer remain attached to the exact time at which the source was opened. Closing the explorer stops microphone/audio activity, cancels pending typed work, and returns to the paused video.

The notebook below the video orders exchanges by timestamp and lets you revisit a source or seek back to the video. Notes, lecture indexes, and playback progress are scoped by LibreChat user and stored in this browser. They are not synchronized to MongoDB or other devices. Export notes as JSON to keep a copy; lecture-index import is separate from note export. Storage failures are visible rather than silently discarding the active session's notes.

## Adding a YouTube video

Choose **New lecture**, paste its URL, and select **Get transcript & sources**. The server reads public metadata and available captions, retrieves the description, and extracts its source links. Review or edit the imported information if useful, then build the lecture index. Public `youtube.com/watch`, Shorts, live, embed, and `youtu.be` links use the same reusable pipeline.

Caption availability is controlled by YouTube. Disabled captions, private or restricted videos, rate limits, and very large transcripts can prevent automatic import. When metadata succeeds but captions do not, the title, description, and source links are retained and the transcript editor opens. Paste a timestamped transcript to continue. Automatic captions are labeled. The importer never downloads video/audio, reads browser cookies, or bypasses login/CAPTCHA restrictions.

The server uses `python3 -m yt_dlp` (already installed on this machine), with user configuration and plugins disabled. Deployment requires that module, or an explicitly configured `LECTURE_YTDLP_PATH` (or `LECTURE_PYTHON` for its Python interpreter). Source discovery currently extracts description URLs; independent web research based on the speaker/transcript is not yet implemented. Source alignment is generated from the transcript and retrieved public source passages, then validated against actual timestamps and source anchors. A saved lecture JSON can also be imported without a model call.

## Subscription tutor and voice

By default, lecture text tutoring, index generation, and note extraction run through the locally installed **Codex app server**, authenticated using its existing **ChatGPT sign-in**. The server launches an isolated ephemeral study session and supplies only bounded lecture/source context. API-key authentication is refused for this mode. There is no automatic paid API fallback.

Live voice uses the installed app server's experimental **WebRTC v3** interface. Start it explicitly in the explorer; only then does the browser request microphone access. Microphone audio and remote speech use WebRTC, while native transcript events supply the saved exchanges. Native voice supports simultaneous listening and speech; interrupted responses are not treated as completed answers. Changing the source or selected passage stops the session so the next connection uses the new context. A session is limited to 15 minutes, with one live session per authenticated user; reconnect to continue.

The implementation was checked against installed Codex **0.153.4**. Text completion through ChatGPT sign-in and a real microphone-free browser connection were verified, including SDP negotiation, ICE/DTLS connectivity, an open conversation data channel, and an actual spoken model response with transcript events and inbound audio packets. The audio check used a synthetic silent track, without activating the microphone. This protocol is experimental and may change with Codex updates or account availability. Microphone permissions, device routing, network restrictions, and subscription limits can still affect a particular conversation. Browser speech recognition plus speech synthesis is an explicitly selected fallback; it has weaker interruption/echo behavior and may use the browser vendor's speech service. It does not call the app's paid audio endpoints.

A text-compatible Codex proxy alone does not establish native duplex audio support. This implementation uses the app server directly, keeping the existing Codex login in Codex. Relevant primary references:

- [Codex authentication and subscription/API-key modes](https://developers.openai.com/codex/auth)
- [Codex app-server protocol](https://developers.openai.com/codex/app-server)
- [OpenAI-compatible server via Codex](https://github.com/hotchpotch/openai-api-server-via-codex)

Optional server settings:

- `LECTURE_CODEX_BINARY`: absolute path to an installed Codex executable. Common macOS locations are detected automatically.
- `LECTURE_CODEX_MODEL`: optional Codex text model override; normally use the signed-in account's default.
- `LECTURE_MODEL_PROVIDER=openai`: explicit opt-in to the previous OpenAI API text backend. This uses configured API credentials and can incur separate API charges. It does not change native subscription voice.

This is a local personal-app integration: authenticated lecture users consume the server operator's Codex subscription. Keep that in mind before deploying it as a shared service.

## Grounding and boundaries

The current question determines retrieval across a source. Retrieval is bounded lexical ranking with heading/query expansions, not unlimited full-document context or an entailment verifier. Native voice starts with a bounded selection covering the chosen passage plus methods, data, results, and limitations; its source context is fixed for that connection. If a voice question falls outside those passages, the tutor is instructed to say so. A typed question performs fresh question-specific retrieval.

Source fetching validates public addresses and every redirect, blocks private/local network targets, limits response size/time, and does not forward credentials. The reader independently sanitizes HTML, runs it in a script-free iframe, preserves safe mathematical markup and figures, and blocks unsafe URLs. arXiv links are converted to HTML when available; generic PDF-only and paywalled sources are not ingested. Failed sources are reported, not presented as verified evidence.

Codex study sessions disable command execution, file editing, browser/computer tools, MCP, apps/plugins, project instructions, and skill discovery. They use an empty temporary workspace, read-only sandboxing, managed ChatGPT authentication, an environment allowlist, and reject unexpected server tool/approval requests. Codex credentials never go to the frontend. Voice session IDs are checked against the authenticated LibreChat user.

The seeded McGrath index is a researched example. The player, source selection, reader, tutor, voice transport, timestamped notes, and importer operate on shared lecture types and do not depend on that video.

## Validation

From `client`: `npx jest src/components/Lectures/__tests__ --runInBand --coverage=false`.

From `packages/api`: `npx jest src/lectures --runInBand --coverage=false`.

Build shared types before the API and client: `npm run build:data-provider`, `npm run build:api`, `npm run build:client`. The repository currently has unrelated TypeScript diagnostics; new lecture code is checked separately in the full reports.
