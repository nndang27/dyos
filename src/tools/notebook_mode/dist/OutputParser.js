import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
export class OutputParser {
    static parseMessage(msg, outputAccumulator, workspace) {
        const msgType = msg.msg_type;
        const content = msg.content;
        if (msgType === "stream") {
            const name = content.name; // stdout or stderr
            let text = content.text;
            // Check if we already have a stream output of the same type. If so, append to it.
            const lastOutput = outputAccumulator.length > 0 ? outputAccumulator[outputAccumulator.length - 1] : null;
            if (lastOutput && lastOutput.type === "stream" && lastOutput.name === name) {
                lastOutput.text += text;
            }
            else {
                outputAccumulator.push({
                    type: "stream",
                    text,
                    ...(name ? { name } : {}) // Keep name for exporter
                });
            }
        }
        else if (msgType === "error") {
            outputAccumulator.push({
                type: "error",
                traceback: content.traceback,
                name: content.ename,
                text: content.evalue
            });
        }
        else if (msgType === "execute_result" || msgType === "display_data") {
            const data = content.data || {};
            const formattedData = {};
            for (const [mime, value] of Object.entries(data)) {
                if (mime.startsWith("image/png")) {
                    // Extract Base64 from the execute result
                    const base64Data = value.replace(/^data:image\/png;base64,/, "");
                    const filename = `plot_${uuidv4().substring(0, 8)}.png`;
                    const filepath = path.join(workspace, filename);
                    fs.mkdirSync(workspace, { recursive: true });
                    fs.writeFileSync(filepath, base64Data, "base64");
                    formattedData["image/png"] = `file://${filepath}`;
                }
                else if (mime === "text/html" && value.includes("<table") && value.includes("dataframe")) {
                    // This is a Pandas dataframe rendered as HTML.
                    // Optionally, we could try to extract it from 'text/csv' if pandas set it, or just return the text/plain summary.
                    formattedData[mime] = value;
                }
                else {
                    formattedData[mime] = Array.isArray(value) ? value.join("") : value;
                }
            }
            outputAccumulator.push({
                type: msgType,
                data: formattedData
            });
        }
    }
}
