import { spawn } from "child_process";
import axios from "axios";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { OutputParser } from "./OutputParser.js";
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export class KernelManager {
    port;
    baseUrl;
    wsUrl;
    childProcess = null;
    kernelId = null;
    ws = null;
    workspace;
    // Map between msg_id and a Promise resolver
    executionCallbacks = new Map();
    constructor(port = 8888, workspace = "/Users/nndang27/Documents/nano_claw/notebook_mode/test_notebooks") {
        this.port = port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        this.wsUrl = `ws://127.0.0.1:${this.port}`;
        this.workspace = workspace;
    }
    async start() {
        console.log(`Starting Jupyter Kernel Gateway on port ${this.port}...`);
        // Ensure python/jupyter kernelgateway is installed or spawn standard jupyter server
        this.childProcess = spawn("jupyter", [
            "kernelgateway",
            "--KernelGatewayApp.api=kernel_gateway.jupyter_websocket",
            `--port=${this.port}`
        ]);
        this.childProcess.stdout?.on("data", (data) => console.log(`[Jupyter] ${data}`));
        this.childProcess.stderr?.on("data", (data) => console.log(`[Jupyter] ${data}`));
        // Wait for it to become ready
        let ready = false;
        for (let i = 0; i < 20; i++) {
            try {
                await axios.get(`${this.baseUrl}/api`);
                ready = true;
                break;
            }
            catch (e) {
                await sleep(500);
            }
        }
        if (!ready) {
            throw new Error("Failed to start Jupyter Kernel Gateway. Ensure 'pip install jupyter_kernel_gateway' is installed.");
        }
        // Create a new kernel (default python3)
        const res = await axios.post(`${this.baseUrl}/api/kernels`, {});
        this.kernelId = res.data.id;
        console.log(`Kernel created: ${this.kernelId}`);
        // Connect WebSocket
        await this.connectWebSocket();
    }
    connectWebSocket() {
        return new Promise((resolve, reject) => {
            if (!this.kernelId)
                return reject("No kernel ID");
            this.ws = new WebSocket(`${this.wsUrl}/api/kernels/${this.kernelId}/channels`);
            this.ws.on("open", () => {
                console.log("WebSocket connected to IPython kernel.");
                resolve();
            });
            this.ws.on("message", (dataStr) => {
                const msg = JSON.parse(dataStr.toString());
                const parentId = msg.parent_header?.msg_id;
                if (parentId && this.executionCallbacks.has(parentId)) {
                    const ctx = this.executionCallbacks.get(parentId);
                    if (msg.msg_type === "status" && msg.content.execution_state === "idle") {
                        // Execution finished
                        ctx.resolve(ctx.outputs);
                        this.executionCallbacks.delete(parentId);
                    }
                    else if (msg.channel === "iopub") {
                        OutputParser.parseMessage(msg, ctx.outputs, this.workspace);
                    }
                }
            });
            this.ws.on("error", (err) => {
                console.error("Kernel WebSocket Error:", err);
            });
        });
    }
    async executeCode(code, timeoutMs = 60000) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return reject(new Error("WebSocket is not connected to kernel."));
            }
            const msgId = uuidv4();
            const message = {
                header: {
                    msg_id: msgId,
                    username: "nanoclaw",
                    session: uuidv4(),
                    msg_type: "execute_request",
                    version: "5.2"
                },
                parent_header: {},
                metadata: {},
                content: {
                    code,
                    silent: false,
                    store_history: true,
                    user_expressions: {},
                    allow_stdin: false,
                    stop_on_error: true
                }
            };
            const timeout = setTimeout(() => {
                if (this.executionCallbacks.has(msgId)) {
                    this.executionCallbacks.delete(msgId);
                    this.interruptKernel();
                    reject(new Error(`Cell execution exceeded timeout of ${timeoutMs}ms.`));
                }
            }, timeoutMs);
            this.executionCallbacks.set(msgId, {
                resolve: (outputs) => {
                    clearTimeout(timeout);
                    resolve(outputs);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                },
                outputs: []
            });
            this.ws.send(JSON.stringify(message));
        });
    }
    async interruptKernel() {
        if (!this.kernelId)
            return;
        await axios.post(`${this.baseUrl}/api/kernels/${this.kernelId}/interrupt`);
    }
    async restartKernel() {
        if (!this.kernelId)
            return;
        await axios.post(`${this.baseUrl}/api/kernels/${this.kernelId}/restart`);
        this.executionCallbacks.clear();
    }
    stop() {
        this.ws?.close();
        if (this.childProcess) {
            this.childProcess.kill();
        }
    }
}
