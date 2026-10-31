# Documentation section map

This map records where each section of the old READMEs went in the documentation reorganization on the `docs/reader-paths` branch. Line numbers refer to commit `66e38e9`, so `git show 66e38e9:<file>` prints the old text.

## Root README

| Old section                            | New home                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `redmine-ts` (intro and package table) | `README.md`, "Pick a package"                                                                                       |
| Built on redmine-openapi               | `README.md`, "Credits"                                                                                              |
| Set up                                 | `CONTRIBUTING.md`, "Set up the repository"                                                                          |
| Check, test, and build                 | `CONTRIBUTING.md`, "Run the checks", "Regenerate the SDK", "Write commits and changesets", and "Lint the workflows" |
| Run real Redmine servers               | `CONTRIBUTING.md`, "Run the contract tests", and `docker/README.md`                                                 |
| Add a Redmine version                  | `CONTRIBUTING.md`, "Add a Redmine version"                                                                          |
| Release and plan                       | `docs/README.md`, "Maintain the repository" and "Check what is supported"                                           |
| Where the design lives                 | `CONTRIBUTING.md`, "Find the design record", and `docs/README.md`, "Understand the design"                          |

## MCP README

`packages/mcp/README.md` now holds only the npm landing page. The rest moved as listed.

| Old section                        | Old lines                 | New page                                                                                                          |
| ---------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Intro, Quick start, and Why use it | 1-29                      | `packages/mcp/README.md`, rewritten for npm; the tested-client and runtime claims went to `docs/compatibility.md` |
| Add the server to a client         | 31-79                     | `docs/mcp/clients.md`                                                                                             |
| Connect claude.ai and ChatGPT      | 81-88                     | `docs/mcp/clients.md`                                                                                             |
| Serve over HTTP                    | 327-345, 298-305, 307-325 | `docs/mcp/clients.md`, `docs/mcp/http-and-oauth.md`, `docs/mcp/http-server.md`                                    |
| Workflow tools                     | 90-102, 104-118           | `docs/mcp/tools.md`, `docs/mcp/workflow-tools.md`                                                                 |
| Generated tools                    | 163-178                   | `docs/mcp/tools.md`                                                                                               |
| Access modes                       | 274-290                   | `docs/mcp/tools.md`                                                                                               |
| Version handling                   | 292-296                   | `docs/mcp/tools.md`                                                                                               |
| Tools that need an admin key       | 256-272                   | `docs/mcp/tools.md`                                                                                               |
| Filters                            | 180-199                   | `docs/mcp/tools.md`                                                                                               |
| Pages                              | 201-223                   | `docs/mcp/tools.md`                                                                                               |
| Results                            | 225-233                   | `docs/mcp/tools.md`                                                                                               |
| Result size                        | 235-245                   | `docs/mcp/tools.md`                                                                                               |
| Errors                             | 247-254                   | `docs/mcp/tools.md`                                                                                               |
| Find people                        | 120-149                   | `docs/mcp/workflow-tools.md`                                                                                      |
| Files                              | 151-157                   | `docs/mcp/workflow-tools.md`                                                                                      |
| The issue resource                 | 159-161                   | `docs/mcp/workflow-tools.md`                                                                                      |
| API keys                           | 730-736                   | `docs/mcp/security.md`                                                                                            |
| Safety                             | 738-745                   | `docs/mcp/security.md`                                                                                            |
| OAuth                              | 385-397, 399-407          | `docs/mcp/http-and-oauth.md`, `docs/mcp/authentication.md`                                                        |
| Set up Redmine                     | 446-455                   | `docs/mcp/http-and-oauth.md`                                                                                      |
| What a sign-in looks like          | 409-444                   | `docs/mcp/http-and-oauth.md`                                                                                      |
| Same-origin deployment             | 641-697                   | `docs/mcp/http-and-oauth.md`                                                                                      |
| Scopes and access modes            | 515-527                   | `docs/mcp/authentication.md`                                                                                      |
| Clients                            | 485-499                   | `docs/mcp/authentication.md`                                                                                      |
| Run the server                     | 468-483, 459-466          | `docs/mcp/authentication.md`, `docs/mcp/configuration.md`                                                         |
| Clients with keys                  | 501-513                   | `docs/mcp/authentication.md`                                                                                      |
| Sign out and revoke                | 529-538                   | `docs/mcp/authentication.md`                                                                                      |
| Change the secret                  | 540-544                   | `docs/mcp/authentication.md`                                                                                      |
| Grant store                        | 546-558, 590-597, 560-588 | `docs/mcp/authentication.md`, `docs/mcp/embedding.md`                                                             |
| What holds either way              | 599-605                   | `docs/mcp/authentication.md`                                                                                      |
| API key sign-in                    | 607-619                   | `docs/mcp/authentication.md`                                                                                      |
| Endpoints                          | 621-639                   | `docs/mcp/authentication.md`                                                                                      |
| Security defaults                  | 347-369                   | `docs/mcp/http-server.md`                                                                                         |
| Browser clients and CORS           | 371-383                   | `docs/mcp/http-server.md`                                                                                         |
| Settings                           | 701-728                   | `docs/mcp/configuration.md`                                                                                       |
| Embed the server                   | 749-838                   | `docs/mcp/embedding.md`                                                                                           |

## SDK README

`packages/sdk/README.md` now holds only the npm landing page. The rest moved as listed.

| Old section                                | Old lines                                       | New page                                                                                        |
| ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Intro, Install, Quickstart, and Why use it | 1-53                                            | `packages/sdk/README.md`, rewritten for npm; the auth forms went to `docs/sdk/configuration.md` |
| Runtime support                            | 495-501                                         | `docs/compatibility.md`, "Runtimes"; the browser advice went to `docs/sdk/configuration.md`     |
| Acknowledgements and License               | 567-575                                         | `packages/sdk/README.md`, unchanged                                                             |
| Narrow results with `include`              | 98-105, 107-107                                 | `docs/sdk/queries.md`                                                                           |
| Filter lists with `where`                  | 65-80, 82-82, 84-84, 86-88, 90-90, 92-92, 94-94 | `docs/sdk/queries.md`                                                                           |
| Paginate                                   | 206-239                                         | `docs/sdk/queries.md`                                                                           |
| Create, update, and attach files           | 243-262, 264-268, 270-298, 300-309, 311-321     | `docs/sdk/writes.md`                                                                            |
| Call an operation                          | 59-59, 57-57, 61-61                             | `docs/sdk/writes.md`, `docs/sdk/reference.md`                                                   |
| Declare the server version                 | 109-142, 143-143                                | `docs/sdk/configuration.md`                                                                     |
| Restrict the client to reads               | 352-360, 367-391, 362-363, 364-365, 393-393     | `docs/sdk/configuration.md`                                                                     |
| Act as another user                        | 323-344, 350-350, 346-348                       | `docs/sdk/configuration.md`                                                                     |
| Retries, timeouts, and concurrency         | 397-403, 407-422, 405-405, 424-424              | `docs/sdk/configuration.md`                                                                     |
| Bring your own fetch                       | 468-493                                         | `docs/sdk/configuration.md`                                                                     |
| Handle errors                              | 149-161, 163-178, 200-200, 180-198, 202-202     | `docs/sdk/errors.md`                                                                            |
| Namespaces                                 | 535-565                                         | `docs/sdk/reference.md`                                                                         |
| Call an endpoint the spec does not cover   | 426-466                                         | `docs/sdk/reference.md`                                                                         |
| Catalog for tool layers                    | 503-533                                         | `docs/sdk/reference.md`                                                                         |
