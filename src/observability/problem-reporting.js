// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { safeErrorType, validTraceId } from './sanitize.js'

export function problemAttributes(problem) {
  return {
    'error.type': safeErrorType(problem),
    'sarafan.problem.code': problem?.code,
    'sarafan.problem.instance': problem?.instance
  }
}

export function problemContext(problem, fallback = {}) {
  return validTraceId(problem?.traceId) ? { traceId: problem.traceId } : fallback
}
