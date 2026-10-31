# Documentation style guide

This guide is for anyone who changes the documentation in this repository. It records the choices the pages already follow, so a new page reads like the others.

## Write for one reader

Each page serves one of three readers:

| Reader                                | Starts at                | Needs                                                     |
| ------------------------------------- | ------------------------ | --------------------------------------------------------- |
| A developer who calls Redmine in code | `packages/sdk/README.md` | The install, a first call, then the guides in `docs/sdk/` |
| A person who connects an MCP client   | `packages/mcp/README.md` | A working client config, then the pages in `docs/mcp/`    |
| A contributor                         | `CONTRIBUTING.md`        | The setup, the checks, and code generation                |

Write each page for one of them. Link to the other readers' pages instead of repeating them.

## Pick the page type

| Type        | Use it for                                                  | Shape                                                     |
| ----------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| How-to      | A task with an end state, such as running the shared server | Prerequisites, numbered steps, and a check that it worked |
| Guide       | A topic with several tasks, such as filtering lists         | One section per task, each with an example                |
| Reference   | Lookup, such as flags, error kinds, or namespaces           | Tables with exact names, defaults, and limits             |
| Explanation | Why something works the way it does                         | Prose, linked from the pages that need it                 |

## Keep one home for each fact

- Each fact lives on one page, and other pages link to it.
- Supported Redmine versions, runtimes, and MCP clients live in [compatibility.md](compatibility.md).
- The HTTP server's limits and their measurements live in [limits.md](../packages/mcp/docs/limits.md).
- Planned work lives in [roadmap.md](roadmap.md), labeled as planned. Other pages describe only what ships.

## Write the text

- Use English, the active voice, and short sentences.
- Name a heading after the task it covers: "Filter lists with `where`", not "Filters".
- Use a table to compare options.
- Give each claim its evidence. Say what CI checks, and what someone checked by hand and on which date.
- Leave out words such as "production-ready" or "robust" unless a measurement backs them.
- Use no long dashes. Use no colon to join two clauses in the middle of a sentence. A colon before a list or a code block is fine.

## Write the examples

- Each section that shows new API syntax gets its own example.
- Code on a page is an excerpt of an example file, which `vp check` typechecks. SDK code comes from `packages/sdk/examples/`, and MCP code from `packages/mcp/examples/`. `packages/sdk/tests/unit/readme.test.ts` and `packages/mcp/tests/unit/docs.test.ts` fail when a `ts` block is not an exact excerpt. Change the example file first, then copy the lines into the page.
- Put TypeScript in `ts` fences, the label the tests read. `vp run docs:check` fails on a `js` or `typescript` fence, and on a fence without a language.
- The test also builds the namespace table from the client and compares it with the table in [reference.md](sdk/reference.md).

## Link between pages

- npm ships a package without the `docs/` folder, so links in a package README are absolute, such as `https://github.com/moddi3/redmine-ts/blob/main/docs/sdk/queries.md`.
- Pages in the repository link to each other with relative paths.
- `vp run docs:check` fails on a link to a missing file or heading, and on a relative link in a package README. Run it after you rename a heading or move a page.

## Format

`vp check --fix` formats Markdown, tables included. Run it before you commit.
