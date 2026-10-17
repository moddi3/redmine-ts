# Cross-judge verdict (GPT-6.1-Sol, high effort, read-only)

Scores (1 to 5):

| Criterion | A | B | C |
| --- | --- | --- | --- |
| Consumer experience | 4 | 4 | 4 |
| Version handling | 3 | 3 | 4 |
| Depth and boundary hygiene | 4 | 3 | 2 |
| MCP/toolkit extensibility | 4 | 4 | 4 |
| Implementability | 3 | 3 | 3 |
| Maintainer load | 4 | 3 | 4 |
| Total | 22 | 20 | 21 |

Recommended base: A. Its reasoning: one shared compatibility surface fits the measured drift and the unknowable server version. A also has one generated method convention, private transport metadata, and tool arguments that match method arguments. B's public `ops` exposes method/path descriptors, and `call`, namespaces and files overlap. C's mandatory version selection and its CommonRedmine/AnyRedmine machinery cost callers from day one.

Grafts it recommended from B: explicit pagination errors and caps instead of silently yielding and stopping; no automatic retries for PUT/PATCH/POST, with replayability tracked separately (including during bearer refresh); include-sensitive signatures and a narrowing error guard, verified against real servers.

Grafts it recommended from C: derive the version list and contract matrix from spec discovery; reviewed overlays that separate spec-precision corrections from server differences; per-version conformance schemas kept internally.

Claim checks against the specs:

- Confirmed: 93 vs 94 operations, 39 schemas each, only `removeUsersFromGroup` added, 3 schemas changed.
- Confirmed: zero path/query/body name collisions, including flattened envelope fields.
- Confirmed: 144 query-param occurrences document operators. The 4 `Format:` params without operators are `from`/`to` on the two time-entry list operations.
- Correction: of the 27 single-key JSON bodies, 3 carry scalars, not object envelopes: `addWatcher.user_id`, `addUserToGroup.user_id` and `addRelatedIssue.issue_id`.
- Correction: 37 operations return bodyless 2xx responses, not 39. The two downloads are binary.
- Correction: the schema additions total 4 properties, and `is_for_all` is required in 7.0.
- Bug in A and B: `removeUsersFromGroup` takes repeated `user_ids[]` query params, not a JSON body.
- Overstated: awaiting a non-thenable Listing is legal and returns the Listing itself.

Top risks of the base: generator correctness (scalar bodies, siblings, requiredness, exploded arrays, binary responses); A's retry rule that treats a DELETE answering 404 on retry as success, which is unsafe because `removeUsersFromGroup` returns 404 legitimately; pagination promises (dedup cannot recover rows that offset drift skipped, and keyset is not a snapshot); request-side compatibility (superset request fields and enums may be rejected by older servers).

Missed by all three: a JSON-safe tool contract for blobs, streams, downloads and paging; the lifecycle of streamed downloads (cancellation, timeout ownership, slot release); snapshot semantics for exports; version knowledge stated too strongly (spec presence does not prove the introduction version).
