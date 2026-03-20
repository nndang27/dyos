export type CellType = "code" | "markdown";
export interface CellOutput {
    type: "stream" | "display_data" | "execute_result" | "error";
    name?: string;
    text?: string;
    traceback?: string[];
    data?: Record<string, string>;
}
export interface NotebookCell {
    id: string;
    cell_type: CellType;
    source: string;
    outputs: CellOutput[];
    execution_count: number | null;
}
export declare class CellManager {
    private cells;
    constructor();
    createCell(type?: CellType, source?: string, id?: string): NotebookCell;
    getCell(id: string): NotebookCell | undefined;
    updateCellSource(id: string, source: string): boolean;
    deleteCell(id: string): boolean;
    clearAllOutputs(): void;
    clearCellOutput(id: string): void;
    addCellOutput(id: string, output: CellOutput): void;
    setExecutionCount(id: string, count: number): void;
    getAllCells(): NotebookCell[];
}
