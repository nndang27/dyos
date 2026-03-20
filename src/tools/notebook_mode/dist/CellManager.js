import { v4 as uuidv4 } from "uuid";
export class CellManager {
    cells = [];
    constructor() { }
    createCell(type = "code", source = "", id = uuidv4()) {
        const cell = {
            id,
            cell_type: type,
            source,
            outputs: [],
            execution_count: null
        };
        this.cells.push(cell);
        return cell;
    }
    getCell(id) {
        return this.cells.find(c => c.id === id);
    }
    updateCellSource(id, source) {
        const cell = this.getCell(id);
        if (cell) {
            cell.source = source;
            return true;
        }
        return false;
    }
    deleteCell(id) {
        const index = this.cells.findIndex(c => c.id === id);
        if (index !== -1) {
            this.cells.splice(index, 1);
            return true;
        }
        return false;
    }
    clearAllOutputs() {
        for (const cell of this.cells) {
            cell.outputs = [];
            cell.execution_count = null;
        }
    }
    clearCellOutput(id) {
        const cell = this.getCell(id);
        if (cell) {
            cell.outputs = [];
        }
    }
    addCellOutput(id, output) {
        const cell = this.getCell(id);
        if (cell) {
            cell.outputs.push(output);
        }
    }
    setExecutionCount(id, count) {
        const cell = this.getCell(id);
        if (cell) {
            cell.execution_count = count;
        }
    }
    getAllCells() {
        return this.cells;
    }
}
