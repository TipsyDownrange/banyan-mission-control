<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BanyanOS Mission Control Code-Agent Rules

You are working on BanyanOS for Sean Daniels / Kula Glass.

BanyanOS Build Quality System:
- Canon file: `00_CANONICAL/BanyanOS_Build_Quality_System.md`
- Drive ID: `1GVqFvTDv-11W8AyZ0UtpgTYXFPjlhQjg`
- Status: ratified by `GC-D068` on `2026-05-01`
- BAN-92 adds branch-explicit dispatch and staging verification routing.

Drive remains BanyanOS canon. Linear is the command board. GitHub is code reality. Codex and Claude Code are build lanes, not canon.

## Source hierarchy

1. Drive canonical packet/spec linked in the task
2. Linear issue scope and acceptance criteria
3. Current repo files, including this `AGENTS.md`
4. Existing tests and deployment behavior
5. Chat context

If these conflict, stop and report the conflict. Chat history, code-agent memory, stale comments, and old task summaries are not canon.

## Repo role

Mission Control is the office / PM / admin control plane for BanyanOS. It generally owns admin, management, governance, service coordination, scheduling, Work Orders management, reporting, and many canonical data controls.

Field App is generally the field consumer/capture app. Do not implement Field App work in this repo unless explicitly instructed.

## Build readiness

Do not implement a meaningful feature unless the task provides:
- `REPO`
- `BRANCH TO CHECK OUT`
- `BASE BRANCH`
- `CURRENT EXPECTED SHA`
- `CREATE BRANCH? YES/NO`
- `STAGING / VERIFICATION TARGET`
- `PRODUCTION IMPACT ALLOWED? YES/NO`
- canon packet or source links
- scope
- out of scope
- protected surfaces
- stop conditions
- verification steps
- done report requirements

If build readiness is missing, produce a stop report or packet gap report instead of coding.

## Branch and workspace gate

Every Codex or Claude Code task must begin by verifying execution context:

1. Confirm current branch.
2. Confirm current SHA.
3. Confirm working tree status.
4. Check out the requested branch or create the approved branch.
5. Stop if the branch/SHA does not match the prompt.
6. Stop if tracked files are dirty unless the prompt explicitly handles them.
7. Do not proceed on the wrong branch.

Being in the Mission Control repo is not enough. The branch and SHA must match the task.

For implementation tasks, work on the approved task branch. For staging verification, only update the `staging` branch when the prompt explicitly authorizes staging promotion. Never use `main`, `staging`, or an old feature branch just because it is currently checked out.

## Lane rules

Codex and Claude Code are both valid build lanes. Both must follow the same canon, scope, stop-condition, verification, and done-report rules.

Chat history is not canon. Code-agent memory is not canon.

One lane should execute each approved prompt. Do not duplicate the same work across lanes unless Sean explicitly authorizes parallel work.

## Owner / consumer rule

When work touches both Mission Control and Field App:

1. identify which repo owns the schema, write path, or canonical data contract;
2. build owner repo first;
3. verify owner repo;
4. then build consumer repo;
5. verify the connected workflow end-to-end.

Do not make cross-repo changes unless the task explicitly authorizes cross-repo work.

## No hardcoded production logic

Do not hard-code operator names, customer names, sheet IDs, folder IDs, role bypasses, or one-off production values unless the task explicitly instructs it and explains why.

Use existing config/helper patterns such as backend config, auth helpers, role helpers, sheet helpers, and established API route patterns.

## Before editing

Inspect relevant files first. Report mismatches before changing files.

Identify whether this repo owns the change or only consumes a contract from another repo. Stop if the task requires another repo and that repo is unavailable.

## Protected surfaces

Do not regress existing navigation, auth, role visibility, Work Orders, service workflows, scheduling, dispatch, admin dashboards, backend sheet config, PDFs, or existing production workflows unless explicitly in scope.

Do not make opportunistic improvements. Do not change unrelated files. Do not call work done without evidence.

## Authenticated verification routing

Random Vercel PR preview URLs are not valid authenticated Google OAuth verification surfaces for BanyanOS.

Use random PR preview URLs only for:
- build/deploy status
- unauthenticated smoke
- safe API smoke
- code/diff review

Mission Control authenticated UI verification must use the BAN-55 staging lane unless the task explicitly approves production post-merge verification:

`https://banyan-mission-control-env-staging-sean-2881s-projects.vercel.app`

Before claiming authenticated UI verification, confirm:
1. the staging deployment includes the expected commit SHA;
2. the deployment uses the staging target/environment;
3. staging backend Sheet isolation is preserved;
4. the tested URL is the staging alias above, not a random branch preview URL.

If a prompt asks for authenticated verification on a random PR preview URL, stop and report verification-route drift.

## Smoke / verification

Run task-specified checks. If no checks are specified, inspect package scripts and recommend checks before implementation.

Available package scripts in this repo include:
- `npm run build`
- `npm test`
- `npm run dev`
- `npm start`

Work is not done until behavior is verified against the operator workflow requested by the task. For docs-only changes, verify the document diff and confirm no app, test, package, or production workflow files changed.

## Stop conditions

Stop and report if:
- required branch/SHA fields are missing for code-agent work;
- current branch or SHA does not match the task;
- the task routes authenticated UI verification to a random Vercel PR preview URL;
- Drive canon is missing or inaccessible;
- Drive canon and Linear issue scope conflict;
- Linear scope is required but unavailable or missing acceptance criteria;
- GitHub repo access is unavailable for code-reality checks;
- Required permissions are missing;
- Repo reality conflicts with the canonical packet or task scope;
- Current `AGENTS.md` instructions conflict with the task or canonical packet;
- Tracked files are dirty with unrelated changes;
- Syncing the target branch would overwrite local work;
- Implementation would require app code changes outside scope;
- Work would cross repo boundaries without explicit approval;
- Protected surfaces would be touched outside scope;
- Verification cannot be run or cannot produce evidence;
- Untracked local tool folders such as `.claude/` would need to be modified, deleted, staged, or committed.

## Stop report

If blocked, return:

```text
STOP REPORT

1. What stopped:
2. Expected:
3. Actual:
4. Files inspected:
5. Recommended next step:
6. Whether any changes were made:
```

## Done report

Return:

```text
DONE REPORT

1. Branch / PR:
2. Commit SHA:
3. Files changed:
4. File:line evidence:
5. Tests/checks run:
6. Deployment/preview:
7. Verification evidence:
8. Known limitations:
9. Follow-up drift created or closed:
```

Do not modify Drive canon. Do not invent current bundle status. Do not mark any seed issue Done unless verified by actual evidence.
