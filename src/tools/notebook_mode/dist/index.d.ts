import { KernelManager } from "./KernelManager.js";
import { CellManager } from "./CellManager.js";
export declare const kernelManager: KernelManager;
export declare const cellManager: CellManager;
export declare const NOTEBOOK_TOOLS: ({
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                type: {
                    type: string;
                    enum: string[];
                };
                source: {
                    type: string;
                };
                id: {
                    type: string;
                    description: string;
                };
                old_id?: undefined;
                new_id?: undefined;
                timeoutMs?: undefined;
                filepath?: undefined;
            };
            required: string[];
        };
    };
    execute: (args: any) => Promise<string>;
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                old_id: {
                    type: string;
                };
                new_id: {
                    type: string;
                };
                type?: undefined;
                source?: undefined;
                id?: undefined;
                timeoutMs?: undefined;
                filepath?: undefined;
            };
            required: string[];
        };
    };
    execute: (args: any) => Promise<string>;
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                id: {
                    type: string;
                    description?: undefined;
                };
                type?: undefined;
                source?: undefined;
                old_id?: undefined;
                new_id?: undefined;
                timeoutMs?: undefined;
                filepath?: undefined;
            };
            required: string[];
        };
    };
    execute: (args: any) => Promise<string>;
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                id: {
                    type: string;
                    description?: undefined;
                };
                source: {
                    type: string;
                };
                type?: undefined;
                old_id?: undefined;
                new_id?: undefined;
                timeoutMs?: undefined;
                filepath?: undefined;
            };
            required: string[];
        };
    };
    execute: (args: any) => Promise<string>;
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                id: {
                    type: string;
                    description?: undefined;
                };
                timeoutMs: {
                    type: string;
                    description: string;
                };
                type?: undefined;
                source?: undefined;
                old_id?: undefined;
                new_id?: undefined;
                filepath?: undefined;
            };
            required: string[];
        };
    };
    execute: (args: any) => Promise<string>;
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                type?: undefined;
                source?: undefined;
                id?: undefined;
                old_id?: undefined;
                new_id?: undefined;
                timeoutMs?: undefined;
                filepath?: undefined;
            };
            required: never[];
        };
    };
    execute: () => Promise<string>;
} | {
    type: string;
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                filepath: {
                    type: string;
                    description: string;
                };
                type?: undefined;
                source?: undefined;
                id?: undefined;
                old_id?: undefined;
                new_id?: undefined;
                timeoutMs?: undefined;
            };
            required: string[];
        };
    };
    execute: (args: any) => Promise<string>;
})[];
