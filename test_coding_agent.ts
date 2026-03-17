import { createDeepAgent } from "./src/agent.js";
import { LocalShellBackend } from "./src/backends/index.js";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage } from "@langchain/core/messages";

async function main() {

    // ============================================================================================================
    // ================= Tạo môi trường sandbox giới hạn agent thực hiện code trong folder workDir =================
    // ============================================================================================================
    const workDir = "./test_parity_workspace";

    // LocalShellBackend supports command execution (bash)
    // virtualMode: true restricts the agent to the workDir (sandboxed)
    const backend = await LocalShellBackend.create({
        rootDir: workDir,
        virtualMode: true,
        inheritEnv: true
    });

    // ============================================================================================================
    // ================= Model ollama free ========================================================================
    // ============================================================================================================
    const model = new ChatOllama({
        model: "minimax-m2.5:cloud",
        temperature: 0.0,
    });

    // ============================================================================================================
    // ================= Tạo subagent coder =======================================================================
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
    // ================= Tích hợp mô hình chính Plan-end-execute ==================================================
    // ============================================================================================================
    const ORCHESTRATOR_INSTRUCTIONS = `
    You are the Lead System Architect.
    Your job is to understand the user's technical requirements, plan the architecture, and delegate the actual implementation to your 'coder-agent'.

    SANDBOX & PATH RULES:
    - IMPORTANT: You and your sub-agents are restricted to a VIRTUAL FILESYSTEM.
    - The root directory \`/\` is your workspace.
    - NEVER use or assign tasks using host absolute paths (e.g., \`/Users/nndang27/...\`).
    - Always use paths relative to \`/\`.
    - If a tool or bash command returns a host path, substitute it with \`/\`.

    DELEGATION RULES:
    - DO NOT write code directly in your chat responses.
    - USE the \`task\` tool to assign coding, debugging, or bash execution tasks to the \`coder-agent\`.
    - Review the results returned by the \`coder-agent\` and report back to the user.
    `;

    const agent = await createDeepAgent({
        model: model,
        systemPrompt: ORCHESTRATOR_INSTRUCTIONS,
        subagents: [coderSubAgent],
        backend: backend,
    });

    console.log(`Running in folder: ${workDir}`);
    // ============================================================================================================
    // ================================= Prompt Input ============================================================
    // ============================================================================================================
    const inputs = {
        messages: [new HumanMessage(`
        Hãy đóng vai một Kỹ sư Dữ liệu 3D và thực hiện một dự án hoàn chỉnh. Đây là một quy trình gồm nhiều bước phức tạp, do đó bạn **BẮT BUỘC phải tạo một danh sách Todo List để lên kế hoạch chi tiết trước khi gọi công cụ viết code**.

        Hãy thực hiện tuần tự các yêu cầu sau:
        1. Tạo một file requirements.txt chứa các thư viện cần thiết (numpy, open3d).
        2. Viết một script Python chính tên là create_bowl.py. Script này phải dùng toán học sinh ra một tập point cloud gồm đúng 10,000 điểm có hình dáng của một cái bát (3D paraboloid: z = x^2 + y^2), sau đó dùng open3d để lưu ra file bowl_sample.ply.
        3. Viết thêm một script thứ hai tên là verify_cloud.py. Script này có nhiệm vụ đọc lại file bowl_sample.ply vừa tạo và in ra Terminal số lượng điểm để kiểm chứng xem có khớp 10,000 điểm không.
        4. Đảm bảo bạn cập nhật trạng thái của Todo list (từ in_progress sang completed) sau mỗi lần hoàn thành một file. 
        5. Với bước cuối để chạy và kiểm thử hay tạo plan cho subagent
        `)]
    };

    const stream = await agent.stream(inputs, {
        streamMode: "updates",
        subgraphs: true
    });
    // ==========================================================================================
    // ================ Print out results =======================================================
    // ==========================================================================================
    for await (const event of stream) {
        // Lấy data và metadata
        const [chunk, metadata] = event as any;

        // Xác định tên Agent
        const namespace = metadata?.namespace || [];
        const currentAgentName = namespace.length > 0 ? namespace[namespace.length - 1] : "Orchestrator";

        // Tìm object chứa messages trong metadata
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

        // 1. In Todo List (Nếu có)
        if (stateUpdate.todos) {
            console.log(`\n✅ [${currentAgentName.toUpperCase()} VỪA CẬP NHẬT TODO LIST]`);
            stateUpdate.todos.forEach((todo: any, index: number) => {
                const statusIcon =
                    todo.status === "completed" ? "🟢" :
                        todo.status === "in_progress" ? "🟡" : "⚪️";

                console.log(`  ${index + 1}. ${statusIcon} [${todo.status.toUpperCase()}] ${todo.content}`);
            });
            console.log("--------------------------------------------------\n");
        }

        // 2. In Messages
        if (stateUpdate.messages) {
            const messages = Array.isArray(stateUpdate.messages) ? stateUpdate.messages : [stateUpdate.messages];
            for (const msg of messages) {
                if (msg.additional_kwargs?.reasoning_content) {
                    console.log(`\n🤔 [${currentAgentName} Đang nghĩ]: ${msg.additional_kwargs.reasoning_content}`);
                }

                if (msg._getType() === "ai" && msg.content) {
                    console.log(`🤖 [${currentAgentName}]: ${msg.content}`);
                }

                if (msg._getType() === "ai" && msg.tool_calls && msg.tool_calls.length > 0) {
                    msg.tool_calls.forEach((tc: any) => {
                        console.log(`🛠  [${currentAgentName}] Gọi tool -> ${tc.name}()`);
                    });
                }
            }
        }
    }
    // ==========================================================================================
    // ==========================================================================================
}

main().catch(console.error);
