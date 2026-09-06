// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createHttpTools } from '../../../src/http.js'
import { CORE_PROBLEM_TYPES, createInternalProblem, normalizeProblem } from '../errors/problem.js'
import { EVENTS } from '../observability/catalogue.js'
import { uiLogger } from '../observability/logger.js'
import { isHandled, markHandled } from '../observability/deduplication.js'
export { JSON_ACCEPT } from '../../../src/http.js'
export const PHOTO_ACCEPT = 'image/avif, image/webp, image/png, image/jpeg, application/problem+json'

const API_ROUTE_TEMPLATES = new Set([
  '/api/v1/auth/code/request',
  '/api/v1/auth/code/verify',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
  '/api/v1/customers/me',
  '/api/v1/customers/me/photo',
  '/api/v1/status/status'
])

function routeTemplate(path) {
  try {
    const pathname = new globalThis.URL(path, 'https://sarafan.invalid').pathname
    return API_ROUTE_TEMPLATES.has(pathname) ? pathname : undefined
  } catch {
    return undefined
  }
}

function shouldReportFailure(problem, retryCount) {
  if (problem.type === CORE_PROBLEM_TYPES.validationFailed
    || problem.type === CORE_PROBLEM_TYPES.loginFailed
    || problem.type === CORE_PROBLEM_TYPES.invalidRefreshToken) return false
  if (problem.type === CORE_PROBLEM_TYPES.invalidAccessToken) return retryCount > 0
  return true
}

export const { createApiClient, parseProblemResponse } = createHttpTools({ createInternalProblem, normalizeProblem, isHandled, markHandled, logger: uiLogger, failedEvent: EVENTS.apiRequestFailed, routeTemplate, shouldReportFailure, invalidAccessTokenType: CORE_PROBLEM_TYPES.invalidAccessToken, binaryAccept: PHOTO_ACCEPT })
