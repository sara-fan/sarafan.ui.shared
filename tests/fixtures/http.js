// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { vi } from 'vitest'

const PROBLEM_ROOT = 'https://sarafan.sw.consulting/problems/'
export const TEST_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'

export function response(status, body = null, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new globalThis.Headers({ 'Content-Type': contentType }),
    json: vi.fn().mockResolvedValue(body),
    blob: vi.fn().mockResolvedValue(body)
  }
}

export function problem(status, suffix, overrides = {}) {
  return {
    type: `${PROBLEM_ROOT}${suffix}`,
    title: 'Не удалось выполнить запрос',
    status,
    detail: 'Исправьте запрос и повторите попытку',
    instance: `urn:sarafan:problem:${TEST_TRACE_ID}`,
    code: suffix.replaceAll('-', '_'),
    traceId: TEST_TRACE_ID,
    ...overrides
  }
}

export function problemResponse(status, suffix, overrides = {}) {
  return response(status, problem(status, suffix, overrides), 'application/problem+json; charset=utf-8')
}
