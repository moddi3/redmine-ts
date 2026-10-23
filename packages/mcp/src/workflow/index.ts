// The hand-written tools, built once per access mode and files setting. Servers of the same kind share
// the schema objects, so the validators compiled for them are reused when HTTP builds a server per request.

import type { Access } from "@redmine-ts/sdk";
import type { ToolSpec } from "../tools.ts";
import { downloadTool, saveTool, uploadTool } from "./attachments.ts";
import { issueContextTool } from "./issue-context.ts";
import { rawRequestTool } from "./raw-request.ts";
import { referenceDataTool } from "./reference-data.ts";
import { transitionTool } from "./transition.ts";

const built = new Map<string, readonly ToolSpec[]>();

/** `files`: whether a files directory is configured, which adds `path` uploads and attachments_save. */
export function workflowTools(access: Access, files: boolean): readonly ToolSpec[] {
  const key = `${access} ${files}`;
  let tools = built.get(key);
  if (tools === undefined) {
    tools = [
      issueContextTool,
      referenceDataTool,
      transitionTool(access),
      uploadTool(files),
      downloadTool(files),
      ...(files ? [saveTool] : []),
      rawRequestTool(access),
    ];
    built.set(key, tools);
  }
  return tools;
}
