<!-- Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
All rights reserved.
This file is a part of the Sarafan application -->

# Sarafan shared browser infrastructure
[![ci](https://github.com/sara-fan/sarafan.ui.shared/actions/workflows/ci.yml/badge.svg)](https://github.com/sara-fan/sarafan.ui.shared/actions/workflows/ci.yml)


`@sara-fan/ui-shared` version **0.0.1** provides plain ESM browser infrastructure for Sarafan UI and Back Office. It has no Vue dependency or application-level state. See [the implementation issue](https://github.com/sara-fan/sarafan.back.office/issues/1).

## Public API

- `@sara-fan/ui-shared/problems`: `ProblemError`, `PROBLEM_TYPE_ROOT`, `COMMON_INTERNAL_CATALOGUE`, `createProblemTools({ additions, logger, suppressedEvent })`. Returns the internal problem catalogue, factory, normalization/presentation, field errors and named suppression functions. Application-specific problems extend the common catalogue; diagnostic causes never serialize.
- `@sara-fan/ui-shared/http`: `JSON_ACCEPT`, `createHttpTools({ createInternalProblem, normalizeProblem, isHandled, markHandled, logger, failedEvent, routeTemplate, shouldReportFailure, invalidAccessTokenType, binaryAccept })`. Returns `parseProblemResponse` and `createApiClient({ getAccessToken, refreshSession, logger })`. Requests accept fetch options and `{ authorize, operationTrace, retry, responseType }`; authorized requests refresh only for the configured canonical invalid-access-token type, at most once. A malformed 401 is a protocol error, never a signal to refresh.
- `@sara-fan/ui-shared/observability/logger`: `createLogger({ serviceName, version, events, severity, isCatalogueEvent, enabled, minimumSeverity, sink, now, environment, rateLimit })`. Supply a fixed application catalogue and identity. Logging is non-throwing and disabled by default.
- `@sara-fan/ui-shared/observability/deduplication`: `createDeduplication()` creates isolated `isHandled`, `markHandled` and test-reset functions. Construct one per application runtime and pass it to HTTP and error boundaries.
- `@sara-fan/ui-shared/observability/boundaries`: `createErrorBoundaries({ normalizeProblem, events, logger, isHandled, markHandled })` returns reporting and installation functions. Installation returns a browser-listener cleanup function.
- `@sara-fan/ui-shared/observability/trace-context`, `/sanitize`, `/problem-reporting`, `/console-sink`: W3C identifiers, allowlist sanitization, safe problem attributes and human-readable output.

Applications own event definitions, route-template allowlists, resource/version/runtime configuration, authentication/session stores, roles, routes and components. Never pass raw URLs, credentials, user data, free-form error messages or unknown attributes into logging. Existing customer problem and event identifiers remain stable.

The browser runtime must provide Web Crypto `getRandomValues`. Problem occurrences use `randomUUID` when available and fresh random identifiers otherwise; separate consumers never share an instance counter.

## Development and distribution

Use Node 22.23+ or Node 24.15+, then `npm ci`, `npm run lint`, `npm run coverage`, and `npm run build`. Coverage requires 95% statements, branches, functions and lines.

`npm pack` produces `sara-fan-ui-shared-0.0.1.tgz`. Install this exact candidate in both consumer applications to run their contract, component and production-build checks. Temporary local dependencies must not be committed.

Tagged releases validate the package version, run checks, and attach the npm-pack artifact plus SHA-256 checksum to GitHub Releases. Tags/assets are immutable. Review prereleases may use a suffix after the matching package version; the package version remains the requested release version. Consumers pin an exact release artifact URL and commit lockfile integrity. There is no npm registry authentication or sibling-checkout requirement for released packages. Do not publish registry packages or replace existing release assets.
