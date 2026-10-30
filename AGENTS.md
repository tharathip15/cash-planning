## User Git workflow

For every change to this project:

- Before editing, inspect local changes and fetch the remote. Update from the appropriate upstream using a fast-forward merge before starting work. Preserve local work; never reset or discard it to update. If fetching fails or local changes/divergence block the update, resolve the blocker before editing and ask for a decision when needed.
- After editing and validation, summarize the result and ask: "ให้อัปขึ้น Git เลยไหมครับ?" Wait for a fresh answer before every push or other action that uploads the changes. Approval for an earlier push does not apply to a new change set.
- Use the user's selected GitHub account `nattawan2816` for authentication. Commit author/committer attribution is separate; do not invent an email or rewrite history to change it.

The personal skill `cash-planning-git-workflow` contains the full workflow at `C:/Users/baspa/.codex/skills/cash-planning-git-workflow/SKILL.md`. Read it when available; the rules above also apply when that local skill is unavailable.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
