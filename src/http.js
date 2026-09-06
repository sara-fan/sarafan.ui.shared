// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { ProblemError, PROBLEM_TYPE_ROOT } from './problems.js'
import { problemAttributes } from './observability/problem-reporting.js'
import { createOperationTrace, problemTraceContext } from './observability/trace-context.js'

export const JSON_ACCEPT = 'application/json, application/problem+json'
const PHOTO_ACCEPT = 'image/avif, image/webp, image/png, image/jpeg, application/problem+json'

const RUSSIAN_TEXT = /[А-ЯЁа-яё]/u
const CODE_PATTERN = /^[a-z][a-z0-9_]*$/u
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/u
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isRussianText(value) {
  return isNonEmptyString(value) && RUSSIAN_TEXT.test(value)
}

function isUriReference(value) {
  if (!isNonEmptyString(value)) return false
  return !/\s/u.test(value) && (/^[a-z][a-z0-9+.-]*:/iu.test(value) || value.startsWith('/'))
}

function validErrors(errors) {
  return isPlainObject(errors) && Object.entries(errors).every(([field, messages]) =>
    isNonEmptyString(field)
    && Array.isArray(messages)
    && messages.length > 0
    && messages.every(isRussianText)
  )
}

export function createHttpTools({ createInternalProblem, normalizeProblem, isHandled, markHandled, logger, failedEvent, routeTemplate, shouldReportFailure, invalidAccessTokenType, binaryAccept = PHOTO_ACCEPT }) {
  function protocolProblem(cause) {
    return createInternalProblem('protocolError', { cause })
  }

  function invalidProblemReason(document, responseStatus) {
    if (!isPlainObject(document)) return 'Problem document is not an object'
    if (!isNonEmptyString(document.type)
      || !document.type.startsWith(PROBLEM_TYPE_ROOT)
      || document.type.startsWith(`${PROBLEM_TYPE_ROOT}ui/`)
      || !isUriReference(document.type)) return 'Problem type is invalid'
    if (!Number.isInteger(document.status)
      || document.status < 400
      || document.status > 599
      || document.status !== responseStatus) return 'Problem status is invalid'
    if (!isRussianText(document.title)) return 'Problem title is invalid'
    if (!isRussianText(document.detail)) return 'Problem detail is invalid'
    if (!isUriReference(document.instance)) return 'Problem instance is invalid'
    if (!isNonEmptyString(document.code) || !CODE_PATTERN.test(document.code)) {
      return 'Problem code is invalid'
    }
    if (document.errors !== undefined && !validErrors(document.errors)) {
      return 'Problem errors extension is invalid'
    }
    if (document.traceId !== undefined
      && (typeof document.traceId !== 'string' || !TRACE_ID_PATTERN.test(document.traceId))) {
      return 'Problem trace identifier is invalid'
    }
    if (document.traceId !== undefined
      && document.instance !== `urn:sarafan:problem:${document.traceId}`) {
      return 'Problem trace correlation is inconsistent'
    }
    return ''
  }

  async function parseProblemResponse(response) {
    const contentType = response.headers?.get?.('Content-Type')
    if (contentType?.split(';', 1)[0].trim().toLowerCase() !== 'application/problem+json') {
      throw protocolProblem(new TypeError('Unexpected problem media type'))
    }

    let document
    try {
      document = await response.json()
    } catch (cause) {
      throw protocolProblem(cause)
    }

    const invalidReason = invalidProblemReason(document, response.status)
    if (invalidReason) throw protocolProblem(new TypeError(invalidReason))
    return new ProblemError(document)
  }

  async function parseSuccess(response, responseType) {
    if (response.status === 204) return null
    try {
      return responseType === 'blob' ? await response.blob() : await response.json()
    } catch (cause) {
      throw protocolProblem(cause)
    }
  }

  function requestMethod(options) {
    return typeof options.method === 'string' ? options.method.toUpperCase() : 'GET'
  }

  function createApiClient({ getAccessToken, refreshSession, logger: requestLogger = logger }) {
    async function request(path, options = {}, policy = {}) {
      const {
        authorize = false,
        operationTrace = createOperationTrace(),
        retry = true,
        responseType = 'json'
      } = policy
      const trace = operationTrace
      let finalAttempt = 0

      async function attempt(retryCount) {
        finalAttempt = retryCount
        const attemptTrace = trace.nextAttempt()
        const headers = new globalThis.Headers(options.headers)
        headers.set('Accept', responseType === 'blob' ? binaryAccept : JSON_ACCEPT)
        headers.set('traceparent', attemptTrace.traceparent)

        const token = getAccessToken()
        if (authorize && token) headers.set('Authorization', `Bearer ${token}`)

        let response
        try {
          response = await globalThis.fetch(path, {
            ...options,
            headers,
            credentials: 'include'
          })
        } catch (cause) {
          throw createInternalProblem('networkUnavailable', { cause })
        }

        if (!response.ok) {
          const problem = await parseProblemResponse(response)
          if (problem.type === invalidAccessTokenType && authorize && retryCount === 0 && retry && typeof refreshSession === 'function') {
            await refreshSession(trace)
            return attempt(1)
          }
          throw problem
        }
        return parseSuccess(response, responseType)
      }

      try {
        return await attempt(0)
      } catch (value) {
        const problem = value instanceof ProblemError ? value : normalizeProblem(value)
        if (!isHandled(problem)) {
          if (shouldReportFailure(problem, finalAttempt)) {
            const attributes = {
              ...problemAttributes(problem),
              'http.request.method': requestMethod(options),
              'http.route': routeTemplate(path),
              'http.response.status_code': problem.status,
              'retry.count': finalAttempt
            }
            requestLogger.log(
              failedEvent,
              attributes,
              problemTraceContext(problem, trace.lastContext())
            )
          }
          markHandled(problem)
        }
        throw problem
      }
    }

    return Object.freeze({ request })
  }

  return Object.freeze({ createApiClient, parseProblemResponse })
}
