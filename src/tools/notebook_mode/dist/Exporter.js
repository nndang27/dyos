import fs from "fs";
import path from "path";
function formatOutput(output) {
    if (output.type === "stream") {
        return {
            output_type: "stream",
            name: output.name || "stdout",
            text: [output.text]
        };
    }
    else if (output.type === "error") {
        return {
            output_type: "error",
            ename: output.name || "Error",
            evalue: output.text || "",
            traceback: output.traceback || []
        };
    }
    else if (output.type === "execute_result" || output.type === "display_data") {
        return {
            output_type: output.type,
            data: output.data || {},
            metadata: {},
            execution_count: null // execute_result normally has this, simplified here
        };
    }
    return null;
}
export class Exporter {
    static exportToIpynb(cellManager, fullPath) {
        const cells = cellManager.getAllCells();
        const ipynbCells = cells.map(cell => {
            return {
                cell_type: cell.cell_type,
                metadata: {},
                id: cell.id,
                source: cell.source.split('\n').map(line => line + '\n'),
                ...(cell.cell_type === "code" ? {
                    execution_count: cell.execution_count,
                    outputs: cell.outputs.map(formatOutput).filter(o => o !== null)
                } : {})
            };
        });
        const notebook = {
            cells: ipynbCells,
            metadata: {
                kernelspec: {
                    display_name: "Python 3",
                    language: "python",
                    name: "python3"
                },
                language_info: {
                    codemirror_mode: {
                        name: "ipython",
                        version: 3
                    },
                    file_extension: ".py",
                    mimetype: "text/x-python",
                    name: "python",
                    nbconvert_exporter: "python",
                    pygments_lexer: "ipython3",
                    version: "3.10.0"
                }
            },
            nbformat: 4,
            nbformat_minor: 5
        };
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, JSON.stringify(notebook, null, 2), "utf8");
        return fullPath;
    }
}
