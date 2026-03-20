import assert from "assert";
import fs from "fs";
import path from "path";
import { NOTEBOOK_TOOLS, kernelManager } from "./src/index.js";

function getTool(name: string) {
    const tool = NOTEBOOK_TOOLS.find(t => t.function.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return async (args: any) => await tool.execute(args, {} as any);
}

const create_cell = getTool("notebook_create_cell");
const set_cell_name = getTool("notebook_set_cell_name");
const delete_cell = getTool("notebook_delete_cell");
const fill_code = getTool("notebook_fill_code");
const run_cell = getTool("notebook_run_cell");
const interrupt_kernel = getTool("notebook_interrupt_kernel");
const get_cell_output = getTool("notebook_get_cell_output");
const restart_kernel = getTool("notebook_restart_kernel");
const get_memory_usage = getTool("notebook_get_memory_usage");
const variable_explorer = getTool("notebook_variable_explorer");
const export_ipynb = getTool("notebook_export_ipynb");

async function main() {
    console.log("=== Starting Notebook Mode Integration Tests ===");

    // ==========================================
    // 1. SETUP PHASE
    // ==========================================
    console.log("\n--- Setup Phase: Starting Jupyter Kernel explicitly ---");
    // Explicitly start the server using the exposed spawned kernel manager
    await kernelManager.start();

    // We now have the actual python child process PID because KernelManager was refactored to use spawn() natively
    const kernelPid = kernelManager.childProcess?.pid;
    console.log(`[Setup] Kernel Gateway successfully booted on port 8888 with PID: ${kernelPid}`);
    if (!kernelPid) throw new Error("Failed to get kernel PID. Did spawn fail?");

    // ==========================================
    // 2. TEST EXECUTION PHASE
    // ==========================================
    try {
        // Phase 1: Cell Lifecycle (CRUD)
        console.log("\n--- Phase 1: Cell Lifecycle (CRUD) ---");

        // 2. create_cell: Add 3 different cells.
        const createRes1 = await create_cell({ type: "code", source: "# Cell 1" });
        const createRes2 = await create_cell({ type: "code", source: "# Cell 2" });
        const createRes3 = await create_cell({ type: "code", source: "# Cell 3" });

        const id1 = createRes1.split(": ")[1];
        const id2 = createRes2.split(": ")[1];
        const id3 = createRes3.split(": ")[1];

        // console.log(`Created 3 cells: ${id1}, ${id2}, ${id3}`);

        // 3. set_cell_name
        await set_cell_name({ old_id: id1, new_id: "init_cell" });
        await set_cell_name({ old_id: id2, new_id: "data_cell" });
        await set_cell_name({ old_id: id3, new_id: "plot_cell" });
        // console.log("Renamed cells to init_cell, data_cell, plot_cell");

        // 4. fill_code: Fill init_cell
        await fill_code({ id: "init_cell", source: "x = 10\ny = 20\nprint(f'x+y={x+y}')" });
        // console.log("Filled init_cell with variables");

        // 5. edit_code: Modify to syntax error, then correct
        await fill_code({ id: "init_cell", source: "1 + / 2\n" });
        await fill_code({ id: "init_cell", source: "x = 10\ny = 20\nname = 'AI'\nprint(f'x+y={x+y}')" });
        // console.log("Edited code to verify fill_code rewrites correctly");

        // 6. delete_cell: Delete a dummy cell
        const dummyCreate = await create_cell({ type: "code", source: "dummy" });
        const dummyId = dummyCreate.split(": ")[1];
        await set_cell_name({ old_id: dummyId, new_id: "dummy_cell" });
        await delete_cell({ id: "dummy_cell" });
        // console.log("Deleted dummy_cell");

        // Phase 2: Execution, State & Kernel Management
        // console.log("\n--- Phase 2: Execution, State & Kernel Management ---");

        // 7. run_cell: Run init_cell
        const runRes1 = await run_cell({ id: "init_cell" });
        assert(runRes1.includes("x+y=30"), "Output should contain x+y=30");
        // console.log("run_cell (init_cell) executed correctly");

        // 8. Error capturing
        await create_cell({ type: "code", source: "1/0", id: "error_cell" });
        const errRes = await run_cell({ id: "error_cell" });
        assert(errRes.includes("ZeroDivisionError"), "Should capture ZeroDivisionError");
        // console.log("Error capturing works correctly (ZeroDivisionError)");

        // 9. variable_explorer
        const varRes = await variable_explorer({});
        console.log("Variable Explorer Raw:", varRes);
        assert(varRes.includes("AI"), "Variable 'AI' should be present");
        assert(varRes.includes("10"), "Variable 10 should be present");
        // console.log("Variable explorer confirmed active variables");

        // 10. get_memory_usage
        const memRes = await get_memory_usage({});
        console.log("Memory usage:", memRes.trim());

        // 11. clear_state - indirectly tested
        // 12. restart_kernel
        await restart_kernel({});
        const varRes2 = await variable_explorer({});
        assert(!varRes2.includes("AI"), "Variables should be cleared after restart");
        // console.log("Kernel restart successfully cleared state");

        // Re-run init_cell to restore variables
        await run_cell({ id: "init_cell" });

        // 13. interrupt_cell
        await create_cell({ type: "code", source: "import time\nwhile True:\n    time.sleep(0.1)", id: "loop_cell" });

        const runPromise = run_cell({ id: "loop_cell", timeoutMs: 5000 });
        setTimeout(async () => {
            // console.log("Sending interrupt signal...");
            await interrupt_kernel({});
        }, 1500);

        try {
            const loopRes = await runPromise;
            // console.log("Loop stopped with result:", loopRes);
        } catch (e: any) {
            console.log("Loop stopped via timeout/interrupt:", e.message);
        }

        // Phase 3: Rich Media & Export
        // console.log("\n--- Phase 3: Rich Media & Export (Data Science Workflow) ---");

        // 14. DataFrame Saver
        await fill_code({ id: "data_cell", source: "import pandas as pd\nimport numpy as np\ndf = pd.DataFrame(np.random.randn(1000, 4), columns=list('ABCD'))\ndf.head()" });
        const dfRes = await run_cell({ id: "data_cell" });
        assert(dfRes.includes("text/html") || dfRes.includes("text/plain"), "Output should contain dataframe markup/text");
        // console.log("DataFrame generated");

        // 15. Plot Image Saver
        await fill_code({ id: "plot_cell", source: "%matplotlib inline\nimport matplotlib.pyplot as plt\nimport numpy as np\nplt.plot(np.random.randn(50))\nplt.show()" });
        const plotRes = await run_cell({ id: "plot_cell" });
        assert(plotRes.includes("image/png") || plotRes.includes("file://"), "Output should contain image/png base64 or file path");
        // console.log("Plot generated successfully");

        // 16. ipynb_saver
        const exportPath = path.join(process.cwd(), "test_notebook_export.ipynb");
        const exportRes = await export_ipynb({ filepath: exportPath });
        assert(fs.existsSync(exportPath), "IPYNB file must be created on disk");
        // console.log(`Exported IPYNB successfully to ${exportPath}`);

        console.log("\n=== All Tests Passed Successfully ===");

    } catch (err) {
        console.error("\n[!] Test execution failed!");
        console.error(err);
        process.exitCode = 1;
    } finally {
        // ==========================================
        // 3. TEARDOWN PHASE
        // ==========================================
        console.log("\n--- Teardown Phase: Gracefully killing background process ---");
        if (kernelManager.childProcess && kernelManager.childProcess.pid) {
            const pid = kernelManager.childProcess.pid;
            console.log(`Terminating Jupyter Kernel process (PID: ${pid})...`);

            // Because we used `spawn` directly instead of `exec`, this is the REAL python process PID
            kernelManager.childProcess.kill("SIGKILL");
            console.log(`PID ${pid} successfully terminated.`);
        } else {
            console.log("Warning: No kernel process found to kill.");
        }

        // Ensure WebSocket is closed so script can end
        kernelManager.stop();
    }
}

main();
