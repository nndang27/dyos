import { ChildProcess } from "child_process";
import { CellOutput } from "./CellManager.js";
export declare class KernelManager {
    private port;
    private baseUrl;
    private wsUrl;
    childProcess: ChildProcess | null;
    private kernelId;
    private ws;
    private workspace;
    private executionCallbacks;
    constructor(port?: number, workspace?: string);
    start(): Promise<void>;
    private connectWebSocket;
    executeCode(code: string, timeoutMs?: number): Promise<CellOutput[]>;
    interruptKernel(): Promise<void>;
    restartKernel(): Promise<void>;
    stop(): void;
}
