<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Task tracking

Work is organised as numbered task specs in `docs/tasks/`. When you finish a task (or a step of one), keep its own md in sync — not just `docs/HANDOFF.md`:

- Set the `**Status:**` line at the top of the task's md to `✅ Complete (YYYY-MM-DD)` with a one-line note of what shipped and any deviations from the spec (e.g. routes that landed at a different path).
- Tick every acceptance-criteria checkbox you actually satisfied (`- [ ]` → `- [x]`). Leave a box unchecked only if the item was deliberately deferred, and say where it moved to.
- Then do the task's own "When complete" steps (update `docs/HANDOFF.md`, set the current task, commit).

A task is not "done" until its md reflects reality. Check this before moving to the next task.
