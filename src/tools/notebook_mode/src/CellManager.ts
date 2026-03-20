import { v4 as uuidv4 } from "uuid";

export type CellType = "code" | "markdown";

export interface CellOutput {
    type: "stream" | "display_data" | "execute_result" | "error";
    name?: string;
    text?: string;
    traceback?: string[];
    data?: Record<string, string>; // Mime-type to base64/text
}

export interface NotebookCell {
    id: string;
    cell_type: CellType;
    source: string;
    outputs: CellOutput[];
    execution_count: number | null;
}

export class CellManager {
    private cells: NotebookCell[] = [];

    constructor() { }

    public createCell(type: CellType = "code", source: string = "", id: string = uuidv4()): NotebookCell {
        const cell: NotebookCell = {
            id,
            cell_type: type,
            source,
            outputs: [],
            execution_count: null
        };
        this.cells.push(cell);
        return cell;
    }

    public getCell(id: string): NotebookCell | undefined {
        return this.cells.find(c => c.id === id);
    }

    public updateCellSource(id: string, source: string): boolean {
        const cell = this.getCell(id);
        if (cell) {
            cell.source = source;
            return true;
        }
        return false;
    }

    public deleteCell(id: string): boolean {
        const index = this.cells.findIndex(c => c.id === id);
        if (index !== -1) {
            this.cells.splice(index, 1);
            return true;
        }
        return false;
    }

    public clearAllOutputs(): void {
        for (const cell of this.cells) {
            cell.outputs = [];
            cell.execution_count = null;
        }
    }

    public clearCellOutput(id: string): void {
        const cell = this.getCell(id);
        if (cell) {
            cell.outputs = [];
        }
    }

    public addCellOutput(id: string, output: CellOutput): void {
        const cell = this.getCell(id);
        if (cell) {
            cell.outputs.push(output);
        }
    }

    public setExecutionCount(id: string, count: number): void {
        const cell = this.getCell(id);
        if (cell) {
            cell.execution_count = count;
        }
    }

    public getAllCells(): NotebookCell[] {
        return this.cells;
    }
}
