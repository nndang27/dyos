# change_v2.md — Data Analyst Agent OS, Version 2

## Summary

Version 2 refactors the Agent OS to be purpose-built for a Senior Data Analyst working in a notebook environment. It moves experience episode saving from SummarizeMiddleware (which runs mid-flow) to VerifyMiddleware (which runs last and has full context including errors, retry counts, and verification results). It adds stuck-agent detection with four configurable signals, a self-correction flow, and prerequisite escalation to TodoListMiddleware. SKILLS.md is scoped to only real tools (filesystem + notebook), GOAL.md external goals are replaced with a dynamic pointer to TodoListMiddleware, and the test file now exercises a realistic Data Analyst scenario using real CSV data.

## Files modified

### src/cognition/SKILLS.md
- Removed: `sql_query_tool`, `python_sandbox`, `dashboard_read`, `jira_read`, `think_tool`, `dashboard_write`, `experiment_read`, `data_catalog_write`, `experiment_design`, `alert_configure`, `production_data_write` (all placeholder tools that don't exist in the codebase)
- Added: Filesystem tools (`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `execute`, `read_persona_module`) and notebook tools (`notebook_create_cell`, `notebook_fill_code`, `notebook_run_cell`, `notebook_get_cell_output`, `notebook_variable_explorer`, `notebook_get_memory_usage`, `notebook_set_cell_name`, `notebook_delete_cell`, `notebook_restart_kernel`, `notebook_interrupt_kernel`, `notebook_export_ipynb`)
- Added: `## Data Analyst toolkit philosophy` section
- Why: Scoped to only tools that actually exist in the codebase, gated by experience level, with DA-specific philosophy

### src/cognition/GOAL.md
- Removed: Hardcoded external KPI section (`current_sprint_goal`, `my_kpis`)
- Added: Dynamic pointer to TodoListMiddleware for external goals
- Updated: Internal drives retuned for Data Analyst (correctness → impact → reproducibility → communication)
- Updated: Professional stance and stance triggers for data-analysis-specific contexts
- Why: External goals were duplicating what TodoListMiddleware already provides, creating a stale two-source-of-truth problem

### src/middleware/summarization.ts
- Removed: All experience writing logic — imports (`fs/promises`, `path`, `CognitionLoader`), helper functions (`extractKeywords`, `getNextEpisodeNumber`, `writeExperienceEpisode`), and the episode writing call in `performSummarization()`
- Tag: `[COGNITION-EXPERIENCE-WRITER] REMOVED in v2 — experience saving moved to VerifyMiddleware`

### src/middleware/verify.ts
- Added: `saveExperienceFromVerification()` — full experience episode writer with v2 fields (error log, verification result, fixes applied)
- Added: `StuckDetector` — `detectStuck(agentTrace)` function with 4 metrics for detecting stuck subagents
- Added: `parseSelfCorrectionResponse()` — parses LLM self-correction output for correctable vs prerequisite outcomes
- Added: `buildSelfCorrectionPrompt()` — constructs the prompt for the self-correction LLM call
- Added: `buildEscalationTodoUpdate()` — formats prerequisite escalation as a TodoListMiddleware state update
- Added: `wrapToolCall` hook — tracks agent traces, runs stuck detection after each tool call
- Added: `afterAgent` hook — triggers experience saving after agent completes
- Added: `AgentTraceEntry`, `StuckSignal`, `PrerequisiteEscalation` types
- Tags: `[VERIFY-V2-STUCK]`, `[VERIFY-V2-SELFCORRECT]`, `[VERIFY-V2-ESCALATE]`, `[COGNITION-EXPERIENCE-WRITER-V2]`

### test_coding_agent.ts
- Added: `notebook_sub_agent` definition with persona system prompt built via `buildPersonaSystemPrompt()`
- Added: Full Data Analyst test scenario using real CSV data at `test_folder/32130_2026A_10(in).csv`
- Added: Stuck-detection stress test (Excel report with advanced formatting to trigger prerequisite escalation)
- Added: Pre-run cognition system verification logging (system prompt preview, EXPERIENCE_INDEX content)
- Added: Post-run verification logging (episodes directory listing, latest episode content, output files)
- Added: `createVerifyMiddleware()` wired into the agent pipeline

## Architecture decisions

### Why experience moves to VerifyMiddleware
SummarizeMiddleware runs mid-flow when the conversation gets too long — it doesn't have access to the final outcome, the full error history, or the verification pass/fail result. VerifyMiddleware runs last and has the complete execution trace: all tool calls, all errors, all retries, and the quality assessment. Only Verify has enough signal to determine whether an experience is worth saving and to accurately classify the outcome as good (succeeded cleanly), partial (succeeded but struggled with >2 retries), or failed.

### Stuck detection thresholds — rationale
- **react_loop=8**: Most well-functioning tasks complete in 3-5 iterations. At 8, the agent is clearly looping without progress. Low enough to catch problems early, high enough to avoid false positives on legitimately complex tasks.
- **file_thrash=3**: Editing the same file 3 times in a row means the agent is making a change, seeing it fail, and trying again without changing approach. This is the textbook "not learning from the error" pattern.
- **repeated_error=3**: The same error type 3 times means the agent's approach is fundamentally wrong, not just slightly off. The error class (first line) is used for grouping to catch semantic repetition.
- **runaway_execution=40**: Generous limit for complex multi-step tasks, but prevents truly runaway execution that would burn tokens without progress. Most successful tasks complete in 10-20 tool calls.

### GOAL.md external section removal — rationale
TodoListMiddleware already owns the live task list and dynamically injects it into the agent's context. When GOAL.md also contained static KPIs and sprint goals, there were two sources of truth that could (and would) diverge. By removing the external goals from GOAL.md and adding a pointer to TodoListMiddleware, GOAL.md owns only the internal drives and professional stance — things that change with the role, not with each sprint — while external priorities flow in dynamically from the task management system.

## How to run the test
```bash
cd /Users/nndang27/Documents/nano_claw/plan_react_system/deepagents
npx ts-node test_coding_agent.ts
```

Expected outputs after a successful run:
- test_folder/output/*.png — at least one chart
- test_folder/output/report.md — markdown analysis report
- src/cognition/episodes/ep_NNN.md — new episode from this run
- Console logs showing stuck detection triggered on Excel task (if env not set up)

## Known limitations

- **Self-correction LLM call is not yet fully wired**: The `wrapToolCall` hook prepares self-correction context and logs it, but does not invoke a separate LLM call within the tool wrapper (the middleware architecture makes it non-trivial to call the model from within `wrapToolCall`). Full LLM-based self-correction would require either a model reference passed into the middleware or a callback pattern. Deferred to v3.
- **Prerequisite escalation is logged but not state-injected**: The `buildEscalationTodoUpdate()` function formats the prerequisite as a todo item, but actually injecting it into the `todos` state requires a `Command` return from `wrapToolCall`, which would disrupt the normal tool result flow. The escalation is currently logged for observability. Deferred to v3.
- **Notebook tools not directly passed as LangChain tools**: The `NOTEBOOK_TOOLS` array uses a custom format (`{type, function, execute}`) rather than LangChain `tool()` instances. The test file imports them but the subagent integration requires wrapping them in LangChain-compatible tool wrappers to be fully functional. This is a pre-existing gap in notebook_mode integration.
- **No episode pruning**: Episodes still accumulate indefinitely (carried over from v1).
- **Keyword extraction remains naive**: Still uses stop-word removal (carried over from v1).
