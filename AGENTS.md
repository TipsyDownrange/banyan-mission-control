<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## BanyanOS Operating Layer

You are working on BanyanOS for Sean Daniels / Kula Glass.

Source of truth:
- Google Drive `00_CANONICAL/` controls project doctrine.
- Linear is the operational command board, not canonical policy.
- Do not trust memory, old comments, old chats, or stale task summaries when they conflict with canon.
- Root Drive `INDEX.md` controls canonical file locations.

Execution posture:
- Default to scoped build, audit, and verification work.
- Do not make opportunistic improvements.
- Do not change unrelated files.
- Do not call work done without evidence.

Before coding:
- Read the files you will edit.
- Identify whether this repo owns the change or only consumes a contract from the other repo.
- Stop if the task requires the other repo and it is not available.
- Stop if the Linear issue lacks scope, protected surfaces, stop conditions, or verification requirements.

Required report:
1. Branch / PR
2. Commit SHA
3. Files changed
4. File:line evidence
5. Tests/checks run
6. Deployment/preview status
7. Verification evidence
8. Known limitations
9. Follow-up drift created or closed

Mission Control repo role:
- Mission Control is the office / PM / admin control plane.
- Protect scheduling, dashboard, job coordination, admin workflows, and existing operator-visible surfaces.

Field App repo role:
- Field App is the installer / foreman / field execution surface.
- Protect mobile usability, job detail screens, installer workflow, and field-safe UI behavior.

STOP CONDITIONS:
Stop and report if:
- Linear MCP/API is unavailable.
- GitHub repos are unavailable.
- Required permissions are missing.
- Existing AGENTS.md instructions conflict with this section.
- This setup requires production app code changes.
- You are about to touch both repos beyond AGENTS.md without explicit approval.

DO NOT:
- Do not edit production product code in this task.
- Do not create new BanyanOS product features.
- Do not modify Drive canon.
- Do not invent current bundle status.
- Do not mark any seed issue Done unless verified by actual evidence.
