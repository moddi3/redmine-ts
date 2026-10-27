---
"@redmine-ts/mcp": minor
---

With a files directory, the description of `attachments_upload`'s `path` now names the directory, and so do the errors for a path that does not exist in it or resolves outside it. Before, an agent could not tell where the directory was, so it passed a file from its own working directory and got an error that did not say where to put it. The server names the directory with its symlinks resolved, as in the paths `attachments_save` returns. The description also says that `path` takes an absolute path inside the directory, which the server already accepted. A path must still resolve inside the directory after symlinks are followed.

`LocalFiles` has a new `dir` property with that path. `localFiles` now resolves the directory when it is called, so it throws when the directory does not exist.
