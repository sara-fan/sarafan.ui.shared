// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { safeErrorType, validTraceId } from './sanitize.js'

function safely(callback) {
  try { return callback() }
  catch { return undefined }
}

export function createErrorBoundaries({ normalizeProblem, events: EVENTS, logger: uiLogger, isHandled, markHandled }) {
  function reportBoundaryFailure(value, definition, logger = uiLogger) {
    if (safely(() => isHandled?.(value))) return false

    let problem
    try {
      problem = normalizeProblem(value)
      return logger?.log?.(
        definition,
        { 'error.type': safeErrorType(problem) },
        validTraceId(problem.traceId) ? { traceId: problem.traceId } : {}
      ) === true
    } catch {
      return false
    } finally {
      safely(() => markHandled?.(value))
      if (problem) safely(() => markHandled?.(problem))
    }
  }

  function installErrorBoundaries(app, target = globalThis, logger = uiLogger) {
    const previousHandler = app.config.errorHandler
    const handler = error => reportBoundaryFailure(error, EVENTS?.applicationError, logger)
    app.config.errorHandler = handler

    const onError = event => reportBoundaryFailure(event.error, EVENTS?.applicationError, logger)
    const onUnhandledRejection = event => reportBoundaryFailure(
      event.reason,
      EVENTS?.promiseUnhandled,
      logger
    )
    target.addEventListener('error', onError)
    target.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      target.removeEventListener('error', onError)
      target.removeEventListener('unhandledrejection', onUnhandledRejection)
      if (app.config.errorHandler === handler) app.config.errorHandler = previousHandler
    }
  }

  return Object.freeze({ reportBoundaryFailure, installErrorBoundaries })
}
