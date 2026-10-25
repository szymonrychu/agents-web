# agents-web memory

Lessons that outlive a session. Newest first.

## 2026-10-25

- imported frontend/ from agent-orchestrator b7906aa355a91fa51ddd5e6e2d62df63c23f6744 with history (git subtree split); agent-orchestrator/frontend is frozen from this commit until frontend-decoupling deletes it.

## 2026-10-24

- react-resizable-panels `Separator` pitfall (moved from agent-orchestrator MEMORY.md): the library writes an INLINE `flex-basis: auto` (plus `flex-grow: 0; flex-shrink: 0`) on the separator element, which beats a styled `flex: 0 0 4px` shorthand, so a childless separator renders 0px wide and its colour never shows (dragging still works through pointer hit regions). Size it with an inline `style={{ flexBasis: ... }}` (props.style is spread after the defaults), never with a stylesheet `flex` rule. Why recorded: the dividers were invisible in the live UI while every jsdom test passed.
- FilesPanel polling (moved from agent-orchestrator MEMORY.md; amends D25 of the prior web-ui epic: "event-driven refresh plus a manual refresh button; no inotify", user decisions U2, X2): the "Refresh files" button is removed. `FilesPanel` now polls `pollExpanded()` every 3 s while `document.visibilityState` is visible, plus one pass on `visibilitychange` to visible and on every event stream open, and refetches the open preview when its entry mtime or size changes in the parent listing. The stream path (`fileEvents`) stays for instant agent writes. Why: terminal shells, check jobs and any writer outside the agent hooks produce no events, and a tree that loaded in error (409) or missing only recovered by clicking. Still no inotify and no backend or API change: the tree reads the existing files API. No timer runs while the tab is hidden or the panel is unmounted.
