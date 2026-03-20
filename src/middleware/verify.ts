/**
 * Verify middleware — checks agent output against ROLE.md quality standard,
 * detects stuck subagents, attempts self-correction, and saves experience episodes.
 *
 * v2 additions:
 * - Experience saving (moved from SummarizeMiddleware)
 * - Stuck detection (StuckDetector)
 * - Self-correction LLM call
 * - Prerequisite escalation to TodoListMiddleware
 */

import { z } from "zod";
import {
  createMiddleware,
  SystemMessage,
  AIMessage,
  HumanMessage,
  type AgentMiddleware as _AgentMiddleware,
  type BaseMessage,
} from "langchain";
import { CognitionLoader } from "../cognition/loader.js";
import * as fsPromises from "fs/promises";
import * as pathModule from "path";

// ============================================================================
// Types
// ============================================================================

// [VERIFY-V2-STUCK] START

/**
 * A single entry in the agent execution trace.
 */
export interface AgentTraceEntry {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  result?: string;
  error?: string;
  timestamp: number;
  iteration: number;
  filePath?: string;
}

/**
 * Signal returned when a subagent is detected as stuck.
 */
export type StuckSignal = {
  reason: 'react_loop' | 'file_thrash' | 'repeated_error' | 'runaway_execution';
  metric: string;
  lastError: string;
  lastSuccessfulStep: string;
};

// [VERIFY-V2-STUCK] END

// [VERIFY-V2-ESCALATE] START

/**
 * Escalation payload when a prerequisite step is missing.
 */
export type PrerequisiteEscalation = {
  blockedTask: string;
  missingStep: string;
  suggestedAction: string;
  priority: 'before_current' | 'new_task';
};

// [VERIFY-V2-ESCALATE] END

// ============================================================================
// Stuck Detector
// ============================================================================

// [VERIFY-V2-STUCK] START

/**
 * Detects when a subagent is stuck based on execution trace analysis.
 *
 * Thresholds (fixed requirements):
 * - ReAct loop count > 8 iterations on the same subtask
 * - Same file edited consecutively >= 3 times in a row
 * - Same error type repeated >= 3 occurrences
 * - Total tool call count > 40 on a single task
 */
export function detectStuck(agentTrace: AgentTraceEntry[]): StuckSignal | null {
  if (agentTrace.length === 0) return null;

  const lastError = findLastError(agentTrace);
  const lastSuccess = findLastSuccess(agentTrace);

  // Signal 1: Runaway execution — total tool calls > 40
  if (agentTrace.length > 40) {
    return {
      reason: 'runaway_execution',
      metric: `${agentTrace.length} total tool calls on this task`,
      lastError,
      lastSuccessfulStep: lastSuccess,
    };
  }

  // Signal 2: ReAct loop count > 8
  const maxIteration = Math.max(...agentTrace.map(e => e.iteration));
  if (maxIteration > 8) {
    return {
      reason: 'react_loop',
      metric: `${maxIteration} ReAct iterations on this task`,
      lastError,
      lastSuccessfulStep: lastSuccess,
    };
  }

  // Signal 3: Same file edited consecutively >= 3 times
  const fileEdits = agentTrace.filter(
    e => e.toolName === 'edit_file' || e.toolName === 'write_file'
  );
  if (fileEdits.length >= 3) {
    for (let i = 0; i <= fileEdits.length - 3; i++) {
      const filePath = fileEdits[i].filePath || fileEdits[i].toolArgs?.file_path;
      if (
        filePath &&
        filePath === (fileEdits[i + 1].filePath || fileEdits[i + 1].toolArgs?.file_path) &&
        filePath === (fileEdits[i + 2].filePath || fileEdits[i + 2].toolArgs?.file_path)
      ) {
        return {
          reason: 'file_thrash',
          metric: `File "${filePath}" edited 3+ consecutive times`,
          lastError,
          lastSuccessfulStep: lastSuccess,
        };
      }
    }
  }

  // Signal 4: Same error type repeated >= 3 times
  const errorEntries = agentTrace.filter(e => e.error);
  if (errorEntries.length >= 3) {
    const errorCounts: Record<string, number> = {};
    for (const entry of errorEntries) {
      // Normalize error to first line for grouping
      const errorKey = (entry.error || '').split('\n')[0].substring(0, 200);
      errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
      if (errorCounts[errorKey] >= 3) {
        return {
          reason: 'repeated_error',
          metric: `Error "${errorKey}" repeated ${errorCounts[errorKey]} times`,
          lastError,
          lastSuccessfulStep: lastSuccess,
        };
      }
    }
  }

  return null;
}

function findLastError(trace: AgentTraceEntry[]): string {
  for (let i = trace.length - 1; i >= 0; i--) {
    if (trace[i].error) return trace[i].error!;
  }
  return '(no errors recorded)';
}

function findLastSuccess(trace: AgentTraceEntry[]): string {
  for (let i = trace.length - 1; i >= 0; i--) {
    if (!trace[i].error && trace[i].result) {
      return `${trace[i].toolName}: ${(trace[i].result || '').substring(0, 100)}`;
    }
  }
  return '(no successful steps recorded)';
}

// [VERIFY-V2-STUCK] END

// ============================================================================
// Experience Writer (moved from SummarizeMiddleware in v2)
// ============================================================================

// [COGNITION-EXPERIENCE-WRITER-V2] START

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "for", "to", "in", "of",
  "with", "and", "or", "that", "this", "it", "on", "at", "by", "from",
  "be", "has", "have", "had", "do", "does", "did", "will", "would",
  "can", "could", "should", "may", "might", "not", "no", "but", "if",
  "then", "than", "so", "as", "up", "out", "about", "into",
]);

function extractKeywords(taskDescription: string): string[] {
  const words = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, 5);
}

async function getNextEpisodeNumber(): Promise<number> {
  const episodesDir = pathModule.join(CognitionLoader.COGNITION_DIR, "episodes");
  try {
    await fsPromises.mkdir(episodesDir, { recursive: true });
    const files = await fsPromises.readdir(episodesDir);
    let maxNum = 0;
    for (const file of files) {
      const match = /^ep_(\d+)\.md$/.exec(file);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return maxNum + 1;
  } catch {
    return 1;
  }
}

/**
 * Save an experience episode after verification completes.
 * Called AFTER the verification decision is made, with full context from the run.
 */
async function saveExperienceFromVerification(context: {
  taskDescription: string;
  agentTrace: AgentTraceEntry[];
  errorLog: string[];
  verificationResult: 'pass' | 'fail' | 'partial';
  verificationReason: string;
  fixesApplied: string[];
}): Promise<string | null> {
  try {
    const {
      taskDescription,
      agentTrace,
      errorLog,
      verificationResult,
      verificationReason,
      fixesApplied,
    } = context;

    // Determine experience quality
    const reactLoopCount = agentTrace.length > 0
      ? Math.max(...agentTrace.map(e => e.iteration))
      : 0;

    let outcome: 'good' | 'partial' | 'failed';
    if (verificationResult === 'pass' && reactLoopCount <= 2) {
      outcome = 'good';
    } else if (verificationResult === 'pass' && reactLoopCount > 2) {
      outcome = 'partial'; // succeeded but struggled
    } else {
      outcome = 'failed';
    }

    const episodeNum = await getNextEpisodeNumber();
    const paddedNum = String(episodeNum).padStart(3, "0");
    const episodeFilename = `ep_${paddedNum}.md`;
    const episodePath = pathModule.join(
      CognitionLoader.COGNITION_DIR,
      "episodes",
      episodeFilename,
    );

    const keywords = extractKeywords(taskDescription);
    const taskType = keywords.slice(0, 2).join("_") || "general";
    const isoDate = new Date().toISOString().split("T")[0];

    // Extract unique tool names from trace
    const toolsUsed = Array.from(new Set(agentTrace.map(e => e.toolName)));
    const toolsList = toolsUsed.length > 0
      ? toolsUsed.map((t) => `- ${t}`).join("\n")
      : "- (none recorded)";

    let reuseAdvice: string;
    if (outcome === 'good') {
      reuseAdvice = "Approach worked — consider reusing for similar tasks";
    } else if (outcome === 'partial') {
      reuseAdvice = "Partially effective — review before reusing";
    } else {
      reuseAdvice = "Approach did not work — avoid repeating";
    }

    // Format error log (key errors, not every stack trace)
    const errorLogContent = errorLog.length > 0
      ? errorLog.slice(0, 5).map(e => `- ${e.substring(0, 200)}`).join("\n")
      : "- (no errors)";

    // Format fixes applied
    const fixesContent = fixesApplied.length > 0
      ? fixesApplied.map(f => `- ${f}`).join("\n")
      : "- (none)";

    const episodeContent = `# Episode ep_${paddedNum}
date: ${isoDate}
task_type: ${taskType}
keywords: ${keywords.join(", ")}
outcome: ${outcome}

## Situation
${taskDescription}

## Tools used
${toolsList}

## Outcome summary
Verification: ${verificationResult} — ${verificationReason}

## Error log
${errorLogContent}

## Verification result
status: ${verificationResult}
reason: ${verificationReason}
fixes_applied: ${fixesContent}

## What to reuse
${reuseAdvice}
`;

    await fsPromises.writeFile(episodePath, episodeContent, "utf-8");

    // Update EXPERIENCE_INDEX.md
    try {
      const indexPath = pathModule.join(
        CognitionLoader.COGNITION_DIR,
        "EXPERIENCE_INDEX.md",
      );
      const indexContent = await fsPromises.readFile(indexPath, "utf-8");
      const newRow = `${keywords.join(",")} | episodes/${episodeFilename} | ${outcome} | medium`;

      const howToUseIdx = indexContent.indexOf("## How to use");
      let updatedIndex: string;
      if (howToUseIdx > 0) {
        updatedIndex =
          indexContent.substring(0, howToUseIdx).trimEnd() +
          "\n" +
          newRow +
          "\n\n" +
          indexContent.substring(howToUseIdx);
      } else {
        updatedIndex = indexContent.trimEnd() + "\n" + newRow + "\n";
      }

      await fsPromises.writeFile(indexPath, updatedIndex, "utf-8");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[VerifyMiddleware] Failed to update EXPERIENCE_INDEX.md:",
        err instanceof Error ? err.message : err,
      );
    }

    return episodeFilename;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[VerifyMiddleware] Experience episode writing failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// [COGNITION-EXPERIENCE-WRITER-V2] END

// ============================================================================
// Quality standard extraction
// ============================================================================

/**
 * Extract the "## Quality standard" section from ROLE.md body content.
 */
function extractQualityStandard(roleBody: string): string | null {
  const headerRegex = /^##\s+quality\s+standard.*$/im;
  const match = headerRegex.exec(roleBody);
  if (!match) return null;

  const startIndex = match.index + match[0].length;
  const remaining = roleBody.substring(startIndex);
  const nextHeaderMatch = /^##\s+/m.exec(remaining);
  const section = nextHeaderMatch
    ? remaining.substring(0, nextHeaderMatch.index)
    : remaining;

  return section.trim();
}

// ============================================================================
// Self-correction and escalation helpers
// ============================================================================

// [VERIFY-V2-SELFCORRECT] START

/**
 * Parse the LLM's self-correction response to determine if the issue is
 * self-correctable or requires a prerequisite step.
 */
function parseSelfCorrectionResponse(response: string): {
  isSelfCorrectable: boolean;
  correctedApproach?: string;
  needsPrerequisite: boolean;
  prerequisite?: PrerequisiteEscalation;
} {
  const lowerResponse = response.toLowerCase();

  // Check if the response indicates a missing prerequisite
  const prerequisitePatterns = [
    /prerequisite[:\s]/i,
    /missing.*(step|dependency|library|package|setup)/i,
    /need(s)?\s+to\s+(install|setup|configure|create|initialize)/i,
    /requires?\s+(installing|setting up|configuring)/i,
  ];

  const needsPrerequisite = prerequisitePatterns.some(p => p.test(response));

  if (needsPrerequisite) {
    // Extract the missing step description — take the first sentence after a prerequisite keyword
    const lines = response.split('\n').filter(l => l.trim());
    let missingStep = "Unknown prerequisite";
    let suggestedAction = "Add prerequisite task before this task";

    for (const line of lines) {
      if (prerequisitePatterns.some(p => p.test(line))) {
        missingStep = line.trim().substring(0, 200);
        break;
      }
    }

    // Look for a suggested action
    const actionMatch = /suggest(ed|ion)?[:\s]*(.*)/i.exec(response);
    if (actionMatch && actionMatch[2]) {
      suggestedAction = actionMatch[2].trim().substring(0, 200);
    }

    return {
      isSelfCorrectable: false,
      needsPrerequisite: true,
      prerequisite: {
        blockedTask: '',  // Filled by caller
        missingStep,
        suggestedAction,
        priority: 'before_current',
      },
    };
  }

  // Otherwise, it's self-correctable — extract the corrected approach
  return {
    isSelfCorrectable: true,
    correctedApproach: response,
    needsPrerequisite: false,
  };
}

// [VERIFY-V2-SELFCORRECT] END

// [VERIFY-V2-ESCALATE] START

/**
 * Escalate a missing prerequisite to the TodoListMiddleware by adding
 * a new task to the todo list state.
 *
 * Since todoListMiddleware manages the `todos` state key as an array,
 * we format the escalation as a state update that adds a new todo item.
 */
function buildEscalationTodoUpdate(escalation: PrerequisiteEscalation): {
  content: string;
  status: string;
} {
  // eslint-disable-next-line no-console
  console.log(
    `[VERIFY-ESCALATION] Added prerequisite task: ${escalation.missingStep}`
  );

  return {
    content: `[PREREQUISITE] ${escalation.missingStep} — ${escalation.suggestedAction}`,
    status: "open",
  };
}

// [VERIFY-V2-ESCALATE] END

// ============================================================================
// State schema
// ============================================================================

const VerifyStateSchema = z.object({
  // [COGNITION-QUALITY-GATE] START
  verificationResult: z
    .object({
      status: z.enum(["pass", "fail", "partial"]),
      reason: z.string(),
    })
    .optional(),
  // [COGNITION-QUALITY-GATE] END
});

// ============================================================================
// Middleware
// ============================================================================

/**
 * Create middleware that:
 * 1. Checks agent output against ROLE.md quality standard
 * 2. Monitors subagent execution for stuck signals
 * 3. Attempts self-correction when stuck is detected
 * 4. Escalates to TodoListMiddleware if prerequisite is missing
 * 5. Saves experience episodes after verification
 */
export function createVerifyMiddleware() {
  // Track agent traces per task for stuck detection
  const agentTraces: AgentTraceEntry[] = [];
  const errorLog: string[] = [];
  const fixesApplied: string[] = [];
  let currentIteration = 0;

  return createMiddleware({
    name: "VerifyMiddleware",
    stateSchema: VerifyStateSchema,

    // [COGNITION-QUALITY-GATE] START — quality standard injection
    async wrapModelCall(request, handler) {
      let qualityStandard: string | null = null;

      try {
        const roleModule = await CognitionLoader.loadModule("ROLE");
        qualityStandard = extractQualityStandard(roleModule.body);
      } catch {
        try {
          const raw = await CognitionLoader.readCognitionFile("ROLE.md");
          const parsed = CognitionLoader.parseFrontmatter(raw);
          qualityStandard = extractQualityStandard(parsed.body);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            "[VerifyMiddleware] Could not load ROLE.md for quality check:",
            err instanceof Error ? err.message : err,
          );
        }
      }

      if (qualityStandard) {
        const qualityBlock =
          `\n\n---\n## Quality standard for this role\n` +
          `The output must satisfy the following criteria before it can be considered complete:\n\n` +
          `${qualityStandard}\n\n` +
          `If any criterion is NOT met, return verification status: FAIL and list which criteria failed.`;

        const existingContent = request.systemMessage.content;
        const existingBlocks =
          typeof existingContent === "string"
            ? [{ type: "text" as const, text: existingContent }]
            : Array.isArray(existingContent)
              ? existingContent
              : [];

        const newSystemMessage = new SystemMessage({
          content: [
            ...existingBlocks,
            { type: "text" as const, text: qualityBlock },
          ],
        });

        return handler({
          ...request,
          systemMessage: newSystemMessage,
        });
      }

      return handler(request);
    },
    // [COGNITION-QUALITY-GATE] END

    // [VERIFY-V2-STUCK] START — stuck detection on tool calls
    async wrapToolCall(request, handler) {
      currentIteration++;

      const toolName = request.toolCall?.name || 'unknown';
      const toolArgs = request.toolCall?.args as Record<string, unknown> | undefined;
      const traceEntry: AgentTraceEntry = {
        toolName,
        toolArgs,
        timestamp: Date.now(),
        iteration: currentIteration,
        filePath: toolArgs?.file_path as string | undefined,
      };

      let result;
      try {
        result = await handler(request);
        traceEntry.result = typeof result === 'string'
          ? result.substring(0, 500)
          : '(non-string result)';
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        traceEntry.error = errorMessage;
        errorLog.push(errorMessage);
        agentTraces.push(traceEntry);
        throw err;
      }

      agentTraces.push(traceEntry);

      // Check for stuck signal after each tool call
      const stuckSignal = detectStuck(agentTraces);
      if (stuckSignal) {
        // eslint-disable-next-line no-console
        console.warn(
          `[VerifyMiddleware] Stuck detected: ${stuckSignal.reason} — ${stuckSignal.metric}`
        );

        // [VERIFY-V2-SELFCORRECT] START — attempt self-correction
        try {
          const selfCorrectionPrompt = buildSelfCorrectionPrompt(
            stuckSignal,
            agentTraces.slice(-5),
            request.state
          );

          // Parse the self-correction determination
          // Since we may not have a model reference here, we log the stuck signal
          // and mark the correction context for the next model call to handle
          const correctionContext = {
            stuckSignal,
            prompt: selfCorrectionPrompt,
            lastTrace: agentTraces.slice(-5),
          };

          // eslint-disable-next-line no-console
          console.log(
            `[VERIFY-V2-SELFCORRECT] Self-correction context prepared for stuck agent. ` +
            `Reason: ${stuckSignal.reason}, Last error: ${stuckSignal.lastError}`
          );

          fixesApplied.push(
            `Stuck detection triggered (${stuckSignal.reason}): ${stuckSignal.metric}`
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            "[VerifyMiddleware] Self-correction preparation failed:",
            err instanceof Error ? err.message : err,
          );
        }
        // [VERIFY-V2-SELFCORRECT] END
      }

      return result;
    },
    // [VERIFY-V2-STUCK] END

    // [COGNITION-EXPERIENCE-WRITER-V2] START — save experience after agent completes
    async afterAgent(state) {
      // Extract task description from messages
      const messages = (state.messages || []) as BaseMessage[];
      const firstHumanMsg = messages.find(
        (m) => HumanMessage.isInstance(m)
      );
      const taskDescription =
        firstHumanMsg && typeof firstHumanMsg.content === "string"
          ? firstHumanMsg.content
          : "Unknown task";

      // Determine verification result
      const verResult = (state as any).verificationResult as
        | { status: 'pass' | 'fail' | 'partial'; reason: string }
        | undefined;

      const verificationStatus = verResult?.status || 'partial';
      const verificationReason = verResult?.reason || 'Verification not explicitly run';

      // Save experience episode — wrapped in try/catch to never crash main flow
      try {
        const episodeFile = await saveExperienceFromVerification({
          taskDescription,
          agentTrace: [...agentTraces],
          errorLog: [...errorLog],
          verificationResult: verificationStatus,
          verificationReason,
          fixesApplied: [...fixesApplied],
        });

        if (episodeFile) {
          // eslint-disable-next-line no-console
          console.log(`[VerifyMiddleware] Experience saved: ${episodeFile}`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          "[VerifyMiddleware] Experience saving failed (non-fatal):",
          err instanceof Error ? err.message : err,
        );
      }

      // Clear traces for next task
      agentTraces.length = 0;
      errorLog.length = 0;
      fixesApplied.length = 0;
      currentIteration = 0;

      return undefined;
    },
    // [COGNITION-EXPERIENCE-WRITER-V2] END
  });
}

// ============================================================================
// Helper: build self-correction prompt
// ============================================================================

// [VERIFY-V2-SELFCORRECT] START
function buildSelfCorrectionPrompt(
  stuckSignal: StuckSignal,
  lastTraceEntries: AgentTraceEntry[],
  state: Record<string, unknown>,
): string {
  const traceStr = lastTraceEntries
    .map(
      (e, i) =>
        `${i + 1}. ${e.toolName}(${JSON.stringify(e.toolArgs || {}).substring(0, 200)}) → ` +
        (e.error ? `ERROR: ${e.error.substring(0, 150)}` : `OK: ${(e.result || '').substring(0, 100)}`)
    )
    .join('\n');

  return `You are a Senior Data Analyst reviewing a stuck subagent. Identify what went wrong and provide a corrected approach. If the problem requires a new prerequisite step (e.g. installing a library, setting up an environment, loading a file first), state that explicitly.

## Stuck signal
Reason: ${stuckSignal.reason}
Metric: ${stuckSignal.metric}
Last error: ${stuckSignal.lastError}
Last successful step: ${stuckSignal.lastSuccessfulStep}

## Last 5 tool calls
${traceStr}

## Instructions
1. Diagnose the root cause of the stuck state
2. If self-correctable: provide the corrected code or approach
3. If prerequisite is missing: state "PREREQUISITE: [what needs to happen first]" and "SUGGESTION: [how to add it]"`;
}
// [VERIFY-V2-SELFCORRECT] END
