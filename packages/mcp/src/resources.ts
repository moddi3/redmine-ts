// redmine://issues/{id}: the issue_context data as Markdown, for clients that attach resources to a
// conversation instead of calling a tool.

import {
  ProtocolError,
  ProtocolErrorCode,
  ResourceNotFoundError,
} from "@modelcontextprotocol/server";
import type { ReadResourceResult, ResourceTemplateType } from "@modelcontextprotocol/server";
import { RedmineError } from "@redmine-ts/sdk";
import type { Redact } from "./api-keys.ts";
import type { Client } from "./tools.ts";
import { DEFAULT_JOURNALS, issueMarkdown } from "./workflow/issue-context.ts";
import type { Lookups } from "./workflow/lookups.ts";

export const ISSUE_TEMPLATE: ResourceTemplateType = {
  uriTemplate: "redmine://issues/{id}",
  name: "issue",
  title: "Redmine issue",
  description: `One issue as Markdown: its fields, description, allowed statuses, relations, subtasks, attachments, watchers and the newest ${DEFAULT_JOURNALS} journals with names resolved. The same data as the issue_context tool.`,
  mimeType: "text/markdown",
};

const ISSUE_URI = /^redmine:\/\/issues\/([1-9]\d*)$/;

export async function readIssue(
  rm: Client,
  lookups: Lookups,
  uri: string,
  redact: Redact,
): Promise<ReadResourceResult> {
  const id = ISSUE_URI.exec(uri)?.[1];
  if (id === undefined) {
    throw new ResourceNotFoundError(
      uri,
      `Unknown resource ${uri}: this server serves redmine://issues/<id>, such as redmine://issues/123`,
    );
  }
  try {
    const text = await issueMarkdown(rm, lookups, Number(id));
    return { contents: [{ uri, mimeType: "text/markdown", text: redact(text) }] };
  } catch (error) {
    if (RedmineError.is(error, "not_found") || RedmineError.is(error, "forbidden")) {
      throw new ResourceNotFoundError(
        uri,
        `Issue ${id} does not exist or this API key cannot see it`,
      );
    }
    if (error instanceof RedmineError) {
      throw new ProtocolError(
        ProtocolErrorCode.InternalError,
        redact(error.message),
        redact(error),
      );
    }
    throw error;
  }
}
