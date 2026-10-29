// target: packages/mcp/src/workflow
// expect: import(no-nodejs-modules)
// From packages/mcp/src/workflow/attachments.ts:4 before d4a061d, which moved file access behind LocalFiles
// because the Workers handler imported this module.
import { readFile } from "node:fs/promises";

export const read = (path: string): Promise<Uint8Array> => readFile(path);
