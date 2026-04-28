# Generic Create Agent Plan

## Context

The current Phase 3 create-agent modal is OpenClaw-template centric. It presents useful archetypes, but the configuration path assumes an OpenClaw agent record with Claude-flavoured model tiers and workspace provisioning. The older Agent Squad modal already has a runtime selector, but that path is not the active Phase 3 wizard.

Mission Control already has partial runtime support in the backend:

- `POST /api/agents` accepts `runtime_type`: `hermes`, `openclaw`, `claude`, `codex`, `custom`.
- Task dispatch supports `openclaw`, `hermes`, `claude`, and `codex`.
- Runtime setup UI also knows about `opencode`, but agent validation/dispatch do not yet include it.
- The create wizard loads configured OpenClaw models from `/api/status?action=models`, but shows them as a flat text field rather than grouped provider/model choices.
- OpenClaw agent config can use `agents.list[].model`, `skills`, `agentRuntime`, and `runtime.type = "acp"` for ACP-backed agents.

## Product Goal

Make "Create Agent" a generic assistant/persona/profile builder, not a Claude Code builder.

An agent should be able to be:

1. A Mission Control-only planning/assignment profile.
2. An OpenClaw-native agent with its own workspace, identity, tools, skills, model/provider, and optional subagent permissions.
3. A runtime-backed worker using Hermes, Claude Code, Codex, or later OpenCode.
4. A specialist profile that uses existing runtimes but carries specialised instructions, skills, model defaults, workspace rules, and task routing metadata.

## Recommended UX Shape

Replace the current 3-step wizard with four clear steps:

### 1. Archetype

Keep current templates, but rename them from implementation-specific templates to role archetypes:

- Orchestrator
- Developer
- Frontend/UI specialist
- Backend/API specialist
- Reviewer/QA
- Researcher
- Content/docs
- Security auditor
- Custom

Templates should set defaults only. The user should still be able to change backend, model, workspace, skills, and instructions.

### 2. Backend / Runtime

Add an explicit backend selector:

- Mission Control profile only — no runtime; useful for planning, assignment, documentation, humans, or placeholder teams.
- OpenClaw — native OpenClaw agent, can use configured providers/models, skills, tools, memory, subagents.
- Hermes — Hermes CLI/profile-backed execution.
- Claude Code — Claude Code CLI execution.
- Codex — Codex CLI execution.
- OpenCode — show if supported/configured; add backend support before enabling task dispatch.
- Custom/manual — record-only or external agent integration.

Show a short explanation under each option:

- whether it creates a workspace
- whether it writes to OpenClaw gateway config
- whether it can receive assigned Mission Control tasks
- whether it can spawn subagents
- whether it runs in a persistent session or one-shot execution

### 3. Specialisation

Add fields for specialist behaviour without needing a separate backend:

- Role/theme: short identity label.
- Specialised instructions: long-form role instructions, equivalent to agent.md / AGENTS.md / SOUL guidance depending runtime.
- Skills allowlist: choose skills such as `task-decomposition`, `github`, `weather`, `coding-agent`, etc.
- Tool profile: readonly, coding, orchestrator, research, custom.
- Suggested task types/tags: e.g. `frontend`, `astro`, `qa`, `docs`.
- Subagent policy: none, allowed, allow specific agents, allow all.

This is how to make a specialised agent without making a whole new dedicated backend. It is a specialised profile/persona that can run on OpenClaw, Hermes, Codex, etc.

### 4. Workspace, Model, and Review

Model/provider selection:

- For OpenClaw: group `/api/status?action=models` by provider and allow selecting any configured provider/model key.
- Also allow raw model input for advanced users.
- Keep tier quick-picks, but make them shortcuts, not the only model language.
- For Hermes/Claude/Codex: show runtime-specific supported model/provider options where applicable.

Workspace options:

- No workspace: record/profile only.
- Use default/global workspace.
- Create dedicated OpenClaw workspace.
- Use existing path.
- Runtime-managed workspace/profile, e.g. Hermes profile or CLI cwd.

Review screen should explicitly say what will be created:

- MC database record
- OpenClaw `agents.list[]` entry
- workspace path
- files to write: `identity.md`, `agent.md`, `SOUL.md`, `TOOLS.md`, etc.
- runtime profile, if any

## Backend/API Changes

1. Extend `createAgentSchema`:
   - include `opencode` if dispatch/support is implemented
   - add `specialization` object or flatten explicit fields:
     - `instructions`
     - `skills`
     - `tool_profile`
     - `task_tags`
     - `workspace_mode`
     - `model_provider`
     - `model_primary`
     - `model_fallbacks`
     - `subagent_policy`

2. Normalize runtime concepts:
   - `runtime_type` for Mission Control task dispatch
   - OpenClaw config `runtime` / `agentRuntime` for OpenClaw-native sessions
   - avoid overloading `template` for runtime decisions

3. Update `writeAgentToConfig` call to preserve/write:
   - `workspace`
   - `agentDir`
   - `skills`
   - `agentRuntime`
   - `runtime`
   - `thinkingDefault`
   - `reasoningDefault`
   - `params`

4. Add workspace file provisioning:
   - write `identity.md` from identity fields
   - write `agent.md` or `AGENTS.md` from specialised instructions
   - write `TOOLS.md` if tool notes/custom tools are supplied
   - write `SOUL.md` if persona content is supplied

5. Add OpenCode dispatch only after validating the CLI command shape and output parsing.

## UI Implementation Steps

1. Refactor `CreateAgentModal` state into typed sections:
   - `identity`
   - `archetype`
   - `runtime`
   - `specialization`
   - `model`
   - `workspace`
   - `gateway`

2. Replace hard-coded Claude model tiers with:
   - provider/model grouped select
   - optional tier presets
   - raw model override

3. Add backend/runtime cards.

4. Add "What gets created?" explainer panel that updates based on choices.

5. Add advanced JSON preview for generated config before submit.

6. Submit a richer payload to `POST /api/agents`.

7. Add/update tests:
   - create OpenClaw agent with configured provider model
   - create Mission Control-only profile
   - create Codex runtime worker
   - create Hermes runtime worker
   - create dedicated workspace and writes files
   - record-only agent does not write gateway config

## Suggested First Slice

Do this first because it unlocks most flexibility without huge risk:

1. Add runtime/backend selector to active Phase 3 create modal.
2. Add specialised instructions textarea.
3. Add skills allowlist text field or multi-select.
4. Pass `runtime_type`, `soul_content`/instructions, `skills`, and selected model to `/api/agents`.
5. Make review screen clearly display whether a workspace and gateway config entry will be created.

Then iterate on richer provider grouping, workspace-file writes, and OpenCode support.
