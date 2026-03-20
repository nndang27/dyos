# Claude Code Prompt — Data Analyst Agent OS v2
# Paste this entire prompt into Claude Code in one shot.

---

You are implementing version 2 of the Agent OS for a Senior Data Analyst.
Work through every section below in order. Do not skip sections.
After all code changes, write a full audit to `change_v2.md`.

---

## STEP 1 — Read and understand the current state

Read ALL of the following before writing a single line of code:

1. Every file inside `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/src/` (full recursive read)
2. `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/change.md` — understand what was added in v1
3. `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/src/cognition/SKILLS.md`
4. `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/src/middleware/fs.ts` — understand every tool exposed for filesystem operations
5. Every file inside `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/src/tools/notebook_mode/` — read each file fully, understand the API for executing notebook cells and retrieving results
6. `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/test_coding_agent.ts`
7. `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/test_folder/32130_2026A_10(in).csv` — read the first 20 rows to understand the data schema

After reading, produce a brief internal summary (as a code comment block) covering:
- What middleware pipeline currently exists and the order
- What v1 added (from change.md)
- What tools notebook_mode exposes and their function signatures
- What columns and shape the CSV dataset has

Do not proceed to Step 2 until this read is complete.

---

## STEP 2 — Rewrite SKILLS.md for Data Analyst scope

File: `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/src/cognition/SKILLS.md`

Replace the entire content. The new SKILLS.md must:

1. **Remove all pending/placeholder tools** that do not yet exist in the codebase. We will add domain-specific tools later.

2. **Keep only tools that actually exist right now**, drawn from two sources:
   - Filesystem tools from `fs.ts` (read_file, write_file, edit_file, ls, etc. — use the exact names exposed by that middleware)
   - Notebook tools from `tools/notebook_mode/` (use the exact function/tool names you found when reading those files)

3. **Scope the description** to: a Data Analyst who works by writing and executing code in a notebook environment to generate insights, create reports, and process Excel/CSV data via code.

4. **Gate tools by experience level** using this structure:
   ```
   ## Available tools — all levels
   [filesystem tools all agents can use]

   ## Available tools — level >= 3 (mid+)
   [notebook execution tools]

   ## Available tools — level >= 4 (senior+)
   [notebook tools that write outputs to filesystem or modify data]

   ## Skill notes
   [constraints: max file sizes, preferred patterns, what NOT to do]
   ```

5. Add a `## Data Analyst toolkit philosophy` section:
   - Always work in notebook cells, not raw bash
   - Prefer pandas/openpyxl for Excel; never open files with GUI tools
   - Every insight must have a source cell reference
   - Output formats: markdown report, HTML chart, or CSV — never raw print statements as final deliverable

Mark all changes with: `# [SKILLS-V2] updated`

---

## STEP 3 — Rewrite GOAL.md for flexible external goals

File: `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/src/cognition/GOAL.md`

The problem with v1: GOAL.md hardcoded specific KPIs and sprint goals as static text. This is wrong because `TodoListMiddleware` already injects the live task list and priorities from Jira/backlog into the agent's context. Duplicating that in GOAL.md creates stale, conflicting information.

Rewrite GOAL.md so that:

1. **External goals section is removed** — replace it with a pointer instruction:
   ```
   ## External goals
   External goals, current tasks, and KPIs are provided dynamically by the
   task management system (TodoListMiddleware). Do not look for them here.
   Refer to your active todo list for what to work on next.
   ```

2. **Internal drives remain** — keep the priority-ordered internal drives (correctness > impact > reputation > efficiency), but tune them for a Data Analyst:
   - correctness: data accuracy and statistical validity above all
   - impact: prefer analyses that directly answer a decision, not vanity metrics
   - reproducibility: every result must be re-runnable from the notebook
   - communication: insight is only valuable when understood by the stakeholder

3. **Professional stance section** — rewrite for DA context:
   - Push back when asked for a metric that is technically answerable but strategically misleading
   - Always state the confidence level and data quality limitations of any result
   - If the task is underspecified, ask one clarifying question before starting (not during)
   - Prefer showing the "so what" over showing the "what"

4. **Stance triggers** — keep but update examples to be data-analysis-specific (not generic)

Mark all changes: `# [GOAL-V2] updated`

---

## STEP 4 — Fix experience saving: move from SummarizeMiddleware to VerifyMiddleware

### 4a — Remove experience writing from SummarizeMiddleware

File: find the summarize middleware file from your Step 1 read.

Locate all code blocks tagged `// [COGNITION-EXPERIENCE-WRITER]` from v1.
Remove the experience-writing logic entirely from SummarizeMiddleware.
Leave a comment: `// [COGNITION-EXPERIENCE-WRITER] REMOVED in v2 — experience saving moved to VerifyMiddleware`

Do not remove the summarization logic itself — only the episode writing.

### 4b — Add experience saving to VerifyMiddleware

File: find the verify middleware file from your Step 1 read.

VerifyMiddleware runs last and has access to:
- The full subagent execution trace (all ReAct loops, tool calls, errors)
- The final output
- The verification result (pass/fail + reason)

Add a `saveExperienceFromVerification()` function inside VerifyMiddleware, called AFTER the verification decision is made. It must:

1. **Collect context** from the full run:
   - `taskDescription`: original task
   - `agentTrace`: array of tool calls and intermediate results
   - `errorLog`: all errors encountered during the run
   - `verificationResult`: pass | fail | partial
   - `verificationReason`: the specific quality criteria that passed or failed
   - `fixesApplied`: any corrections VerifyMiddleware made itself

2. **Determine experience quality**:
   - If `verificationResult === 'pass'` AND no more than 2 ReAct retry loops → `outcome: 'good'`
   - If `verificationResult === 'pass'` BUT more than 2 retry loops → `outcome: 'partial'` (succeeded but struggled)
   - If `verificationResult === 'fail'` → `outcome: 'failed'`

3. **Write episode file**: call `CognitionLoader` to write `episodes/ep_NNN.md` using the same template from v1, but add two new fields:
   ```
   ## Error log
   [errorLog content — key errors, not every stack trace]

   ## Verification result
   status: [pass|partial|fail]
   reason: [verificationReason]
   fixes_applied: [fixesApplied]
   ```

4. **Update EXPERIENCE_INDEX.md**: append the new episode row as in v1.

5. **Wrap everything in try/catch** — episode saving must never crash the main flow.

Mark new code: `// [COGNITION-EXPERIENCE-WRITER-V2] START` / `END`

---

## STEP 5 — Redesign VerifyMiddleware: stuck-agent detection + escalation

This is the most complex change. Read the current VerifyMiddleware carefully before modifying.

VerifyMiddleware must now do three things:
1. Monitor subagent execution for "stuck" signals
2. Attempt self-correction when stuck is detected
3. Escalate to TodoListMiddleware if the problem is a missing prerequisite step

### 5a — Stuck detection metrics

Add a `StuckDetector` class or module (can be in the same file or a separate `src/utils/stuckDetector.ts`).

A subagent is considered **stuck** when ANY of the following thresholds are crossed:

| Signal | Threshold | Why |
|--------|-----------|-----|
| ReAct loop count | > 8 iterations on the same subtask | Infinite retry loop |
| Same file edited consecutively | >= 3 times in a row | Thrashing on a broken fix |
| Same error type repeated | >= 3 occurrences | Not learning from the error |
| Total tool call count | > 40 on a single task | Runaway execution |

Expose a function: `detectStuck(agentTrace: AgentTraceEntry[]): StuckSignal | null`

Where `StuckSignal` is:
```typescript
type StuckSignal = {
  reason: 'react_loop' | 'file_thrash' | 'repeated_error' | 'runaway_execution';
  metric: string;        // e.g. "8 ReAct iterations on task: create_chart"
  lastError: string;     // the most recent error message
  lastSuccessfulStep: string; // last thing that actually worked
}
```

### 5b — Interrupt and self-correction flow

When `detectStuck()` returns a signal, VerifyMiddleware must:

1. **Interrupt the subagent** (stop its execution loop)
2. **Attempt self-correction**: VerifyMiddleware calls the LLM itself with:
   - The stuck signal details
   - The last 5 tool calls from the trace
   - The current error
   - The original task goal
   - Prompt: "You are a Senior Data Analyst reviewing a stuck subagent. Identify what went wrong and provide a corrected approach. If the problem requires a new prerequisite step (e.g. installing a library, setting up an environment, loading a file first), state that explicitly."

3. **Parse the LLM response** for two outcomes:
   - **Self-correctable**: VerifyMiddleware provides the corrected code/approach back to the subagent to retry (max 1 retry after VerifyMiddleware intervention)
   - **Needs prerequisite**: VerifyMiddleware identifies that the plan is missing a setup step

### 5c — Escalation to TodoListMiddleware

If the self-correction LLM response indicates a prerequisite is missing:

1. Format an escalation payload:
   ```typescript
   type PrerequisiteEscalation = {
     blockedTask: string;
     missingStep: string;       // e.g. "Install openpyxl before reading .xlsx files"
     suggestedAction: string;   // e.g. "Add setup_notebook_environment task before this task"
     priority: 'before_current' | 'new_task';
   }
   ```

2. Call TodoListMiddleware's `addTask()` or equivalent function (check the actual API from your Step 1 read) to inject the prerequisite task at the correct position in the todo list.

3. Log the escalation clearly: `[VERIFY-ESCALATION] Added prerequisite task: [missingStep]`

### 5d — Wire stuck detection into the middleware loop

Find where VerifyMiddleware currently monitors or receives the subagent trace. Add stuck detection checks at:
- After each subagent tool call completes (incremental check)
- OR at the end of each ReAct iteration (batch check — use whichever matches the current architecture)

Mark all new code: `// [VERIFY-V2-STUCK]`, `// [VERIFY-V2-SELFCORRECT]`, `// [VERIFY-V2-ESCALATE]`

---

## STEP 6 — Rewrite the test file for a real Data Analyst scenario

File: `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/test_coding_agent.ts`

### 6a — Add notebook subagent

Using the same pattern as existing subagents (e.g. research_sub_agent), define a new subagent:

```typescript
const notebook_sub_agent = {
  name: "notebook-agent",
  description: "Execute data analysis tasks using Python notebooks. Use this agent for: loading and inspecting datasets, running pandas/numpy/matplotlib analysis, generating charts, processing Excel files, and producing insight reports. Pass one analysis objective at a time.",
  system_prompt: await buildPersonaSystemPrompt(`
You are a Senior Data Analyst operating in a notebook environment.
Your job is to write and execute Python code in notebook cells to analyze data,
generate insights, and produce reports.

Rules:
- Always inspect the data schema first before any analysis (df.head(), df.info(), df.describe())
- Each cell must have a clear comment stating what it does
- Never print raw dataframes as final output — summarize findings in markdown
- When producing a chart, always save it as a file, never just display inline
- Final deliverable must be a structured report with: summary, key findings, methodology, limitations
  `),
  tools: [readPersonaModuleTool, ...notebookTools, ...filesystemTools],
  // replace notebookTools and filesystemTools with actual imported tool arrays from your Step 1 read
}
```

### 6b — Design the test scenario

Replace or extend the current test task with this multi-part scenario that will stress-test:
- The cognition files (GOAL, ROLE, ETHICS, EXPERIENCE)
- The stuck detection in VerifyMiddleware
- The notebook tool integration
- The experience saving in VerifyMiddleware

Use the CSV file at:
`/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/test_folder/32130_2026A_10(in).csv`

The test task should be passed as the user message to the agent. Write it as a realistic stakeholder request:

```typescript
const testTask = `
I need a complete analysis of our sales/operations dataset for the Q1 2026 review.

The data file is at: /Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/test_folder/32130_2026A_10(in).csv

Please deliver:
1. A data quality report — missing values, outliers, inconsistencies
2. Key descriptive statistics across all numerical columns
3. Identify the top 3 most significant patterns or trends in the data
4. A visualization of the most important finding (saved as a PNG file)
5. A summary report in markdown format saved to the test_folder

Important constraints:
- All work must be done via notebook cells — no direct file manipulation
- The report must include data limitations and confidence notes
- If the data has any privacy or quality concerns, flag them explicitly

Deliver results to: /Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/test_folder/output/
`
```

### 6c — Add a deliberately difficult sub-task to trigger stuck detection

After the main task, add a second test that will likely trigger the stuck detector:

```typescript
const stuckTestTask = `
Convert the CSV data into a formatted Excel report with:
- Multiple sheets (one per data category)
- Conditional formatting on outlier cells
- A summary pivot table
- Charts embedded in the Excel file

Save to: /Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/test_folder/output/report.xlsx
`
// This task requires openpyxl with advanced features — likely to trigger stuck detection
// if the environment is not set up correctly, testing the prerequisite escalation flow
```

### 6d — Add logging to observe cognition file loading

Before running the agent, add console logging to verify the lazy-loading system is working:

```typescript
console.log("=== TEST: Verifying cognition system ===");
console.log("Checking always-on modules are loaded at boot...");
// Log the first 200 chars of the system prompt to confirm MANIFEST + ROLE + ETHICS are present
console.log("Checking EXPERIENCE_INDEX for any existing episodes...");
// Read and log EXPERIENCE_INDEX.md content
console.log("=== Starting agent run ===");
```

After the run, add:
```typescript
console.log("=== POST-RUN: Checking experience was saved ===");
// List files in cognition/episodes/ to confirm new episode was written
// Read the latest episode file and print its content
console.log("=== TEST COMPLETE ===");
```

---

## STEP 7 — Write change_v2.md

File: `/Users/nndang27/Documents/nano_claw/plan_react_system/deepagents/change_v2.md`

Use this structure:

```markdown
# change_v2.md — Data Analyst Agent OS, Version 2

## Summary
[One paragraph: what v2 adds on top of v1]

## Files modified

### src/cognition/SKILLS.md
- Removed: [list removed tools]
- Added: [list of actual tools now referenced]
- Why: [scoped to real available tools + DA notebook philosophy]

### src/cognition/GOAL.md
- Removed: [hardcoded external KPI section]
- Added: [dynamic pointer to TodoListMiddleware + updated internal drives]
- Why: [avoid stale/duplicate goal data]

### src/middleware/summarize.ts
- Removed: experience writing logic (moved to VerifyMiddleware)
- Tag: [COGNITION-EXPERIENCE-WRITER] REMOVED

### src/middleware/verify.ts
- Added: saveExperienceFromVerification() — experience saved here now
- Added: StuckDetector — 4 metrics for detecting stuck subagents
- Added: self-correction LLM call when stuck detected
- Added: prerequisite escalation to TodoListMiddleware
- Tags: [VERIFY-V2-STUCK], [VERIFY-V2-SELFCORRECT], [VERIFY-V2-ESCALATE], [COGNITION-EXPERIENCE-WRITER-V2]

### test_coding_agent.ts
- Added: notebook_sub_agent definition
- Added: full DA test scenario using real CSV data
- Added: stuck-detection stress test (Excel with formatting)
- Added: pre/post run cognition system verification logging

## Architecture decisions

### Why experience moves to VerifyMiddleware
[Explain: Summarize runs mid-flow; Verify runs after the full journey including
error logs, retry count, and quality assessment. Only Verify has enough signal
to determine if something is worth saving as an experience.]

### Stuck detection thresholds — rationale
[Explain why each threshold was chosen: react_loop=8, file_thrash=3, etc.]

### GOAL.md external section removal — rationale
[Explain: TodoListMiddleware already owns the live task list. Duplicating it in
GOAL.md creates a two-source-of-truth problem. GOAL.md should own internal
drives only; external priorities flow in from the task system.]

## How to run the test
\`\`\`bash
cd /Users/nndang27/Documents/nano_claw/plan_react_system/deepagents
npx ts-node test_coding_agent.ts
\`\`\`

Expected outputs after a successful run:
- test_folder/output/*.png — at least one chart
- test_folder/output/report.md — markdown analysis report
- src/cognition/episodes/ep_NNN.md — new episode from this run
- Console logs showing stuck detection triggered on Excel task (if env not set up)

## Known limitations
[List any shortcuts taken, things deferred to v3, etc.]
```

---

## STEP 8 — Final validation

Run these checks in order:

```bash
# 1. Type check
npx tsc --noEmit

# 2. Find all change markers to confirm nothing was missed
grep -rn "COGNITION-\|VERIFY-V2-\|SKILLS-V2\|GOAL-V2" src/

# 3. Confirm experience writer was removed from summarize
grep -n "EXPERIENCE-WRITER" src/middleware/summarize.ts
# Should only show the REMOVED comment, not active code

# 4. Confirm experience writer exists in verify
grep -n "EXPERIENCE-WRITER-V2" src/middleware/verify.ts
# Should show active START/END blocks

# 5. Run the test
npx ts-node test_coding_agent.ts 2>&1 | tee test_run_v2.log

# 6. Confirm episode was saved
ls -la src/cognition/episodes/
cat src/cognition/episodes/$(ls -t src/cognition/episodes/ | head -1)
```

Report the output of each check at the end.
If any check fails, fix the issue before finishing.

---

## Critical rules for this entire session

- Never modify files inside `src/cognition/` except SKILLS.md and GOAL.md
- Never delete episodes/ directory or EXPERIENCE_INDEX.md
- Every code change must be wrapped in the appropriate `// [TAG] START` / `END` comment
- If you are unsure about a function signature from an existing middleware, read the file again — do not guess
- The stuck detection thresholds (8 loops, 3 consecutive edits, 3 repeated errors, 40 total calls) are fixed requirements — do not change them without noting the deviation in change_v2.md
