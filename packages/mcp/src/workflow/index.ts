// The hand-written tools, built once per access mode and files setting. Servers of the same kind share
// the schema objects, so the validators compiled for them are reused when HTTP builds a server per request.

import type { Access } from "@redmine-ts/sdk";
import type { ToolSpec } from "../tools.ts";
import { downloadTool, saveTool, uploadTool } from "./attachments.ts";
import { issueContextTool } from "./issue-context.ts";
import { peopleFindTool } from "./people.ts";
import { rawRequestTool } from "./raw-request.ts";
import { referenceDataTool } from "./reference-data.ts";
import { transitionTool } from "./transition.ts";

const built = new Map<string, readonly ToolSpec[]>();

export function workflowTools(access: Access, dir: string | undefined): readonly ToolSpec[] {
  const key = `${access} ${dir}`;
  let tools = built.get(key);
  if (tools === undefined) {
    tools = [
      issueContextTool,
      referenceDataTool,
      peopleFindTool,
      transitionTool(access),
      uploadTool(dir),
      downloadTool(dir !== undefined),
      ...(dir === undefined ? [] : [saveTool]),
      rawRequestTool(access),
    ];
    built.set(key, tools);
  }
  return tools;
}
