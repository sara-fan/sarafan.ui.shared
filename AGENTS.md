<!--
Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
All rights reserved.
This file is a part of the Sarafan application
-->

# Shared browser infrastructure instructions

## Specification and repository guidance

- Follow the current specification identified in the [specification README](https://github.com/sara-fan/sarafan.spec#source-of-truth). If an implementation issue conflicts with it, flag the discrepancy before implementing the affected behavior.
- In implementation PR descriptions, cite the governing specification version and section, and link the planning issue. Use any suitable format; the PR template is optional.
- When a change introduces or changes a lasting convention, API contract, domain invariant, security/privacy rule, workflow, or test pattern, update the nearest relevant `AGENTS.md` in the same PR. Keep entries concise and reusable.
- Otherwise, include `AGENTS.md: no durable change` in the PR description.
- Before editing documentation, read its current revision and preserve user-authored changes. Keep product requirements in the specification and task-specific discussion in the issue.

## Copyright headers

- Add the Sarafan copyright header to every file you create or modify whenever the file format safely supports comments.
- Use the comment syntax appropriate for the file type. Keep shebangs, encoding declarations, XML declarations, and other required first-line directives before the header.
- Do not add a header where comments are unsupported or would alter behavior, and do not modify generated files, dependency files, build output, coverage output, lockfiles, or binary files solely to add a header.
- Preserve an existing copyright or license header instead of adding a duplicate.

For JavaScript and other files that support `//` comments, use:

```js
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
```

For other comment-capable formats, use the same three lines with that format's native comment syntax.

## Error handling

- Treat RFC 9457 `type` as the canonical machine-readable identifier for Core API failures. Never branch on localized `title`, `detail`, raw exception text, or HTTP status alone.
- Accept a Core error as structured only when its media type is `application/problem+json` and it contains a valid Sarafan `type`, matching HTTP/body `status`, Russian `title` and `detail`, `instance`, and `code`. Preserve optional `errors` and `traceId` without flattening them.
- Do not add compatibility parsing for partial Problem Details, arbitrary JSON, `msg`, legacy envelopes, or bodyless error responses. Normalize malformed or inconsistent server responses to the internal UI protocol problem.
- Negotiate JSON and Problem Details for JSON endpoints; the consuming application supplies explicit accepted media types for binary endpoints.
- Use the shared `ProblemError` abstraction for API and internal failures. Components must retain the structured problem, use the shared presentation and field-error helpers, and must not render an unknown `Error.message`.
- Model browser-originated and local failures with RFC 9457 field semantics under `https://sarafan.sw.consulting/problems/ui/`, but omit `status` when no HTTP response exists and never claim the `application/problem+json` media type for an internal failure.
- Create internal problems through the centralized catalogue. Their type, code, Russian title, and safe Russian default detail are stable UI contracts; generate a unique `instance` for each occurrence.
- Keep an internal problem's original JavaScript `cause` non-enumerable and diagnostic-only. Never render, serialize, persist, or log the cause or raw payload, especially when it may contain personal data, tokens, or browser/native error text.
- Represent local and remote validation with structured `errors` collections and expose field messages through the shared helper instead of flattening them into a generic string.
- Preserve single-flight token refresh and retry an authorized request at most once. Treat only the canonical invalid-refresh-token problem type as expected session expiry; distinguish network/protocol restore failures and offer an explicit retry state.
- Route intentional suppression through a named shared policy. Version lookup and server logout failures may be suppressed after normalization.
- Add tests for every new problem type, parser validation and retry branch, structured field errors, non-serialization of causes, and intentional recovery/suppression policy. New and modified code must satisfy the repository's 95% coverage thresholds.

## Observability and logging

- Emit UI logs only through the stable catalogue and facade in `src/observability/`. Direct `console.*` calls are forbidden outside the console sink, and call sites must not construct free-form events, messages, or attribute objects outside the catalogue contract.
- Every event must have a stable dotted name, OpenTelemetry severity number/text, fixed English human-readable message template, RFC 3339 UTC timestamp, application-supplied resource identity, and typed allowlisted attributes. Keep console output single-line readable text, never raw JSON or a code-only record.
- Treat the consuming application’s runtime logging setting as the authoritative runtime master switch. Missing/invalid values disable logging. The value must come from the startup-generated `runtime-config.js`, load before the application bundle, use `Cache-Control: no-store`, and require at most a same-image container restart—never a bundle/image rebuild.
- Keep W3C `traceparent` generation and propagation independent of the logging switch. One logical API operation retains its 32-hex trace ID across refresh/retry and uses a new 16-hex span ID for each network attempt. Prefer the validated RFC 9457 server `traceId` when reporting a Core failure.
- Log API failures only after retry/refresh policy finishes, using method, a catalogue-approved route template, status, stable problem identity, correlation IDs, and retry count. Never log raw URLs/query strings, headers, bodies, tokens/cookies/codes, personal data, DOM/storage/history/device data, localized Problem Details text, arbitrary rejected values, Error messages/stacks, or `ProblemError.cause`.
- Normalize and mark handled failures at their ownership boundary so the API client, session store, Vue handler, `window.error`, and `unhandledrejection` cannot report the same failure repeatedly. Intentional suppression must use a stable operation code.
- Keep the logger and every sink non-throwing. Apply bounded rate limiting to repeated global failures and emit only an aggregate dropped count without retaining payloads.
- Production logging defaults to Warning and Development may use Debug, both beneath the runtime master switch. Thresholds and switches must never bypass sanitization or change the allowed fields.
- Extend tests for record shape/readability, catalogue enforcement, redaction, runtime control, W3C generation/retry propagation, RFC 9457 correlation, deduplication, rate limiting, global boundaries, and sink failure. Preserve at least 95% coverage for new and modified code.

## Package boundary and releases

- This plain ESM package has no Vue dependency, app singleton, Vite environment access, or consumer package.json import. Inject app identity, fixed event catalogue, logging controls, route templates and authentication callbacks. Keep customer/staff session stores and business UI in consumers.
- Preserve public problem identifiers, privacy rules, log event contracts and single-retry semantics when extracting or changing code. Give each constructed runtime its own mutable diagnostics state.
- Logger construction and suppression must tolerate missing diagnostic configuration. Logging requires an explicit boolean enable switch and nonempty application identity; incomplete identity fails closed. Suppression preserves the normalized problem even if its optional logging hook is absent or throws.
- Export only documented module entry points; internal source paths are not public API.
- Preserve valid RFC 9457 instance URI references in structured errors. Diagnostics independently allowlist correlation URNs and must omit arbitrary URLs/paths. An absent refresh hook disables retry and preserves the original authentication problem.
- Isolate injected diagnostic failures from HTTP results and still mark failures handled. Capture response status separately for protocol-error logging without assigning HTTP semantics to internal problem objects or reusing status from a previous retry attempt.
- Release npm-pack artifacts and checksums under immutable semantic-version GitHub releases. Never replace published assets. Both consumers pin exact URLs and integrity. Test the actual packed artifact and both consuming applications before final release.
- Maintain at least 95% statements, branches, functions and lines coverage. Test rejection paths, isolation, parser failure, retry exhaustion, redaction and sink failure.
