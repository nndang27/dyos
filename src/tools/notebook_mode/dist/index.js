import { exec } from "child_process";
import { promisify } from "util";
import { KernelManager } from "./KernelManager.js";
import { CellManager } from "./CellManager.js";
import { Exporter } from "./Exporter.js";
import path from "path";
const execAsync = promisify(exec);
// Global state for the session
const localWorkspace = path.join(process.cwd(), "notebook_workspace");
export const kernelManager = new KernelManager(8888, localWorkspace);
export const cellManager = new CellManager();
let kernelStarted = false;
async function ensureKernel() {
    if (!kernelStarted) {
        await kernelManager.start();
        kernelStarted = true;
    }
}
export const NOTEBOOK_TOOLS = [
    // ==========================================
    // GROUP 1: CELL MANAGEMENT
    // ==========================================
    {
        type: "function",
        function: {
            name: "notebook_create_cell",
            description: "Create a new cell in the Notebook.",
            parameters: {
                type: "object",
                properties: {
                    type: { type: "string", enum: ["code", "markdown"] },
                    source: { type: "string" },
                    id: { type: "string", description: "Optional custom cell ID. Auto-generated if omitted." }
                },
                required: ["type"]
            }
        },
        execute: async (args) => {
            const cell = cellManager.createCell(args.type, args.source, args.id);
            return `Cell created with ID: ${cell.id}`;
        }
    },
    {
        type: "function",
        function: {
            name: "notebook_set_cell_name",
            description: "Change the internal ID to a custom logical name for easier targeting later.",
            parameters: {
                type: "object",
                properties: {
                    old_id: { type: "string" },
                    new_id: { type: "string" }
                },
                required: ["old_id", "new_id"]
            }
        },
        execute: async (args) => {
            const cell = cellManager.getCell(args.old_id);
            if (!cell)
                return `Error: Cell ${args.old_id} not found.`;
            cell.id = args.new_id;
            return `Cell ID changed to ${args.new_id}`;
        }
    },
    {
        type: "function",
        function: {
            name: "notebook_delete_cell",
            description: "Delete a cell by ID.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string" }
                },
                required: ["id"]
            }
        },
        execute: async (args) => {
            const success = cellManager.deleteCell(args.id);
            return success ? `Cell ${args.id} deleted.` : `Error: Cell ${args.id} not found.`;
        }
    },
    {
        type: "function",
        function: {
            name: "notebook_fill_code",
            description: "Replace the entire code/source of a cell.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    source: { type: "string" }
                },
                required: ["id", "source"]
            }
        },
        execute: async (args) => {
            const success = cellManager.updateCellSource(args.id, args.source);
            return success ? `Cell ${args.id} updated.` : `Error: Cell ${args.id} not found.`;
        }
    },
    // ==========================================
    // GROUP 2: EXECUTION & LIFECYCLE
    // ==========================================
    {
        type: "function",
        function: {
            name: "notebook_run_cell",
            description: "Execute a specific cell and wait for output. Rich media like Dataframes and Plots are automatically saved to disk by the Output Parser.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    timeoutMs: { type: "number", description: "Default is 60000ms (1 minute)" }
                },
                required: ["id"]
            }
        },
        execute: async (args) => {
            await ensureKernel();
            const cell = cellManager.getCell(args.id);
            if (!cell)
                return `Error: Cell ${args.id} not found.`;
            if (cell.cell_type !== "code")
                return "Cell is not a code cell.";
            try {
                // Clear previous outputs before run
                cellManager.clearCellOutput(cell.id);
                const outputs = await kernelManager.executeCode(cell.source, args.timeoutMs || 60000);
                // Save outputs to cell state
                // Note: The execution_count is hard to track locally without parsing the 'execute_reply' headers, 
                // so we just increment a simple global counter or leave it null.
                cell.outputs = outputs;
                return `Execution Finished.\nOutputs:\n${JSON.stringify(outputs, null, 2).substring(0, 1500)}`;
            }
            catch (err) {
                return `Error during execution: ${err.message}`;
            }
        }
    },
    {
        type: "function",
        function: {
            name: "notebook_interrupt_kernel",
            description: "Send SIGINT to interrupt a stuck infinite loop cell.",
            parameters: { type: "object", properties: {}, required: [] }
        },
        execute: async () => {
            await ensureKernel();
            await kernelManager.interruptKernel();
            return "Kernel interrupted.";
        }
    },
    {
        type: "function",
        function: {
            name: "notebook_get_cell_output",
            description: "Fetch the output JSON of a specific cell if it was cut off.",
            parameters: {
                type: "object",
                properties: { id: { type: "string" } },
                required: ["id"]
            }
        },
        execute: async (args) => {
            const cell = cellManager.getCell(args.id);
            if (!cell)
                return `Cell ${args.id} not found.`;
            return JSON.stringify(cell.outputs, null, 2);
        }
    },
    // ==========================================
    // GROUP 3: KERNEL MEMORY
    // ==========================================
    {
        type: "function",
        function: {
            name: "notebook_restart_kernel",
            description: "Restart the Python backend, erasing all variables in memory. Does not delete UI cells.",
            parameters: { type: "object", properties: {}, required: [] }
        },
        execute: async () => {
            await ensureKernel();
            await kernelManager.restartKernel();
            cellManager.clearAllOutputs();
            return "Kernel restarted and all outputs cleared.";
        }
    },
    {
        type: "function",
        function: {
            name: "notebook_get_memory_usage",
            description: "Check RAM usage of the Python kernel Process.",
            parameters: { type: "object", properties: {}, required: [] }
        },
        execute: async () => {
            try {
                const { stdout } = await execAsync(`ps aux | grep "kernel" | grep -v grep | head -n 1`);
                return stdout || "Kernel process not found.";
            }
            catch (err) {
                return `Error: ${err.message}`;
            }
        }
    },
    {
        type: "function",
        function: {
            name: "notebook_variable_explorer",
            description: "Returns a list of active Python variables in state (whos).",
            parameters: { type: "object", properties: {}, required: [] }
        },
        execute: async () => {
            await ensureKernel();
            try {
                const outputs = await kernelManager.executeCode("%whos", 5000);
                return JSON.stringify(outputs, null, 2);
            }
            catch (e) {
                return `Error fetching variables: ${e.message}`;
            }
        }
    },
    // ==========================================
    // GROUP 4: EXPORT
    // ==========================================
    {
        type: "function",
        function: {
            name: "notebook_export_ipynb",
            description: "Export the entire cell states to a valid `.ipynb` file.",
            parameters: {
                type: "object",
                properties: {
                    filepath: { type: "string", description: "Absolute path like /workspace/analysis.ipynb" }
                },
                required: ["filepath"]
            }
        },
        execute: async (args) => {
            try {
                Exporter.exportToIpynb(cellManager, args.filepath);
                return `Successfully exported Notebook to: ${args.filepath}`;
            }
            catch (e) {
                return `Failed to export: ${e.message}`;
            }
        }
    }
];
