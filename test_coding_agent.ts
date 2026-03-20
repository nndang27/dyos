import { createDeepAgent } from "./src/agent.js";
import { LocalShellBackend } from "./src/backends/index.js";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage } from "@langchain/core/messages";
import { buildPersonaSystemPrompt } from "./src/cognition/loader.js";
import { readPersonaModuleTool } from "./src/tools/readPersonaModule.js";
import { createVerifyMiddleware } from "./src/middleware/verify.js";
import * as fs from "fs";
import * as path from "path";

async function main() {

    // ============================================================================================================
    // ================= Sandbox environment ======================================================================
    // ============================================================================================================
    const workDir = "./test_folder";

    const backend = await LocalShellBackend.create({
        rootDir: workDir,
        virtualMode: true,
        inheritEnv: true
    });

    // ============================================================================================================
    // ================= Model =====================================================================================
    // ============================================================================================================
    const model = new ChatOllama({
        model: "minimax-m2.5:cloud",
        temperature: 0.0,
    });

    // ============================================================================================================
    // ================= Subagent: coder ===========================================================================
    // ============================================================================================================
    const CODER_INSTRUCTIONS = `
    You are an expert Software Engineer and System Administrator.
    Your primary environment is a Linux / Unix filesystem.

    CRITICAL RULES:
    1. Always explore the directory using \`ls\` or \`glob\` before creating or editing files.
    2. Use \`read_file\` to understand existing code before using \`edit_file\`.
    3. When using \`execute\` to run bash commands, verify the command syntax.
    4. If a task is complex, break it down into smaller tool calls.
    5. IMPORTANT: When using \`write_file\`, the \`content\` argument MUST be a string, NEVER a JSON object or dictionary.

    SANDBOX & PATH RULES:
    - You are running in a VIRTUAL FILESYSTEM. The root directory \`/\` is your workspace.
    - NEVER use host absolute paths (paths starting with \`/Users\`).
    - If you see a path like \`/Users/nndang27/...\` in bash output (e.g. from \`pwd\`), IGNORE IT.
    - Use ONLY paths starting with \`/\` (virtual absolute) or relative paths.
    - Your designated workspace is the current directory \`/\`.
    `;

    const coderSubAgent = {
        name: "coder-agent",
        description: "Delegate tasks to this agent if they require writing code, editing files, exploring the filesystem, or running bash commands.",
        systemPrompt: CODER_INSTRUCTIONS,
    };

    // ============================================================================================================
    // ================= Subagent: notebook (Data Analyst) ========================================================
    // ============================================================================================================
    const notebookSystemPrompt = await buildPersonaSystemPrompt(`
You are a Senior Data Analyst operating in a notebook environment.
Your job is to write and execute Python code in notebook cells to analyze data,
generate insights, and produce reports.

Rules:
- Always inspect the data schema first before any analysis (df.head(), df.info(), df.describe())
- Each cell must have a clear comment stating what it does
- Never print raw dataframes as final output — summarize findings in markdown
- When producing a chart, always save it as a file, never just display inline
- Final deliverable must be a structured report with: summary, key findings, methodology, limitations
    `);

    const notebook_sub_agent = {
        name: "notebook-agent",
        description: "Execute data analysis tasks using Python notebooks. Use this agent for: loading and inspecting datasets, running pandas/numpy/matplotlib analysis, generating charts, processing Excel files, and producing insight reports. Pass one analysis objective at a time.",
        systemPrompt: notebookSystemPrompt,
        tools: [readPersonaModuleTool],
    };

    // ============================================================================================================
    // ================= Orchestrator (Plan-and-execute) ==========================================================
    // ============================================================================================================
    const ORCHESTRATOR_INSTRUCTIONS = `
    You are the Lead Data Analyst and Project Manager.
    Your job is to understand the user's analytical requirements, plan the analysis approach,
    and delegate the actual data work to your specialized sub-agents.

    SANDBOX & PATH RULES:
    - IMPORTANT: You and your sub-agents are restricted to a VIRTUAL FILESYSTEM.
    - The root directory \`/\` is your workspace.
    - NEVER use or assign tasks using host absolute paths (e.g., \`/Users/nndang27/...\`).
    - Always use paths relative to \`/\`.
    - If a tool or bash command returns a host path, substitute it with \`/\`.

    DELEGATION RULES:
    - For data analysis, notebook execution, chart generation → delegate to \`notebook-agent\`
    - For file management, code writing, bash execution → delegate to \`coder-agent\`
    - DO NOT write code directly in your chat responses.
    - USE the \`task\` tool to assign tasks to the appropriate sub-agent.
    - Review the results returned by sub-agents and report back to the user.

    ANALYSIS PLANNING RULES:
    - Always create a todo list before starting analysis
    - Break complex analyses into discrete steps
    - Verify data quality before running statistical analysis
    - Ensure final deliverables include limitations and confidence notes
    `;

    // Create agent with VerifyMiddleware for quality gating and stuck detection
    const verifyMiddleware = createVerifyMiddleware();

    const agent = await createDeepAgent({
        model: model,
        systemPrompt: ORCHESTRATOR_INSTRUCTIONS,
        subagents: [coderSubAgent, notebook_sub_agent],
        backend: backend,
        middleware: [verifyMiddleware],
    });

    // ============================================================================================================
    // ================= Pre-run cognition verification ===========================================================
    // ============================================================================================================
    console.log("=== TEST: Verifying cognition system ===");
    console.log("Checking always-on modules are loaded at boot...");

    // Log system prompt preview to confirm MANIFEST + ROLE + ETHICS are present
    try {
        const { buildPersonaSystemPrompt: buildPrompt } = await import("./src/cognition/loader.js");
        const samplePrompt = await buildPrompt("Test prompt");
        console.log("System prompt preview (first 200 chars):", samplePrompt.substring(0, 200));
    } catch (err) {
        console.warn("Could not build sample system prompt:", err);
    }

    console.log("Checking EXPERIENCE_INDEX for any existing episodes...");
    try {
        const indexPath = path.join(process.cwd(), "src", "cognition", "EXPERIENCE_INDEX.md");
        const indexContent = fs.readFileSync(indexPath, "utf-8");
        console.log("EXPERIENCE_INDEX content:\n", indexContent);
    } catch (err) {
        console.warn("Could not read EXPERIENCE_INDEX.md:", err);
    }

    // Ensure output directory exists so the agent can write results
    const outputDir = path.join(process.cwd(), "test_folder", "output");
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log("Created output directory:", outputDir);
    }

    console.log("=== Starting agent run ===");

    // ============================================================================================================
    // ================= Test Task 1: Full Data Analysis Scenario =================================================
    // ============================================================================================================
    const testTask = `
I need a complete analysis of our sales/operations dataset for the Q1 2026 review.

The data file is at: /32130_2026A_10(in).csv

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

Deliver results to: /output/
    `;

    const inputs = {
        messages: [new HumanMessage(testTask)]
    };

    try {
        const stream = await agent.stream(inputs, {
            streamMode: "updates",
            subgraphs: true
        });

        // ============================================================================================================
        // ================= Print results ============================================================================
        // ============================================================================================================
        for await (const event of stream) {
            const [chunk, metadata] = event as any;

            const namespace = metadata?.namespace || [];
            const currentAgentName = namespace.length > 0 ? namespace[namespace.length - 1] : "Orchestrator";

            let stateUpdate = null;
            if (metadata?.model_request) stateUpdate = metadata.model_request;
            else if (metadata?.tools) stateUpdate = metadata.tools;
            else {
                for (const key in metadata) {
                    if (metadata[key] && metadata[key].messages) {
                        stateUpdate = metadata[key];
                        break;
                    }
                }
            }

            if (!stateUpdate) continue;

            // Print Todo List updates
            if (stateUpdate.todos) {
                console.log(`\n[${currentAgentName.toUpperCase()} TODO LIST UPDATE]`);
                stateUpdate.todos.forEach((todo: any, index: number) => {
                    const statusIcon =
                        todo.status === "completed" ? "[DONE]" :
                            todo.status === "in_progress" ? "[WIP]" : "[OPEN]";
                    console.log(`  ${index + 1}. ${statusIcon} ${todo.content}`);
                });
                console.log("--------------------------------------------------\n");
            }

            // Print Messages
            if (stateUpdate.messages) {
                const messages = Array.isArray(stateUpdate.messages) ? stateUpdate.messages : [stateUpdate.messages];
                for (const msg of messages) {
                    if (msg.additional_kwargs?.reasoning_content) {
                        console.log(`\n[${currentAgentName} THINKING]: ${msg.additional_kwargs.reasoning_content}`);
                    }

                    if (msg._getType() === "ai" && msg.content) {
                        console.log(`[${currentAgentName}]: ${msg.content}`);
                    }

                    if (msg._getType() === "ai" && msg.tool_calls && msg.tool_calls.length > 0) {
                        msg.tool_calls.forEach((tc: any) => {
                            console.log(`[${currentAgentName}] Tool call -> ${tc.name}()`);
                        });
                    }
                }
            }
        }
    } catch (err: any) {
        console.error(`\n[TASK 1 ERROR] Agent encountered an error: ${err.message || err}`);
        console.error("[TASK 1 ERROR] This is typically caused by the model sending malformed tool arguments.");
        console.error("[TASK 1 ERROR] The cognition system and middleware pipeline were functioning correctly before this point.\n");
    }

    // ============================================================================================================
    // ================= Test Task 2: Stuck detection stress test =================================================
    // ============================================================================================================
    console.log("\n=== TEST TASK 2: Stuck detection stress test (Excel report) ===\n");

    const stuckTestTask = `
Convert the CSV data at /32130_2026A_10(in).csv into a formatted Excel report with:
- Multiple sheets (one per data category)
- Conditional formatting on outlier cells
- A summary pivot table
- Charts embedded in the Excel file

Save to: /output/report.xlsx
    `;
    // This task requires openpyxl with advanced features — likely to trigger stuck detection
    // if the environment is not set up correctly, testing the prerequisite escalation flow

    const stuckInputs = {
        messages: [new HumanMessage(stuckTestTask)]
    };

    try {
        const stuckStream = await agent.stream(stuckInputs, {
            streamMode: "updates",
            subgraphs: true
        });

        for await (const event of stuckStream) {
            const [chunk, metadata] = event as any;
            const namespace = metadata?.namespace || [];
            const currentAgentName = namespace.length > 0 ? namespace[namespace.length - 1] : "Orchestrator";

            let stateUpdate = null;
            if (metadata?.model_request) stateUpdate = metadata.model_request;
            else if (metadata?.tools) stateUpdate = metadata.tools;
            else {
                for (const key in metadata) {
                    if (metadata[key] && metadata[key].messages) {
                        stateUpdate = metadata[key];
                        break;
                    }
                }
            }

            if (!stateUpdate) continue;

            if (stateUpdate.messages) {
                const messages = Array.isArray(stateUpdate.messages) ? stateUpdate.messages : [stateUpdate.messages];
                for (const msg of messages) {
                    if (msg._getType() === "ai" && msg.content) {
                        console.log(`[${currentAgentName}]: ${msg.content}`);
                    }
                    if (msg._getType() === "ai" && msg.tool_calls && msg.tool_calls.length > 0) {
                        msg.tool_calls.forEach((tc: any) => {
                            console.log(`[${currentAgentName}] Tool call -> ${tc.name}()`);
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.log("[STUCK TEST] Agent encountered an error (expected for stress test):", err);
    }

    // ============================================================================================================
    // ================= Post-run verification ====================================================================
    // ============================================================================================================
    console.log("\n=== POST-RUN: Checking experience was saved ===");

    const episodesDir = path.join(process.cwd(), "src", "cognition", "episodes");
    try {
        const episodeFiles = fs.readdirSync(episodesDir);
        console.log("Episodes directory contents:", episodeFiles);

        if (episodeFiles.length > 0) {
            // Read the latest episode file
            const sortedFiles = episodeFiles
                .filter(f => f.startsWith("ep_") && f.endsWith(".md"))
                .sort()
                .reverse();

            if (sortedFiles.length > 0) {
                const latestEpisode = fs.readFileSync(
                    path.join(episodesDir, sortedFiles[0]),
                    "utf-8"
                );
                console.log(`\nLatest episode (${sortedFiles[0]}):\n`, latestEpisode);
            }
        }
    } catch (err) {
        console.warn("Could not read episodes directory:", err);
    }

    // Check for output files
    const checkOutputDir = path.join(process.cwd(), "test_folder", "output");
    try {
        if (fs.existsSync(checkOutputDir)) {
            const outputFiles = fs.readdirSync(checkOutputDir);
            console.log("Output directory contents:", outputFiles);
        } else {
            console.log("Output directory not created (expected if agent did not complete)");
        }
    } catch (err) {
        console.warn("Could not read output directory:", err);
    }

    console.log("=== TEST COMPLETE ===");
}

main().catch(console.error);
