// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  JSON_ACCEPT,
  PHOTO_ACCEPT,
  createApiClient,
  parseProblemResponse
} from './support/api/client.js'
import { INTERNAL_PROBLEM_TYPES, ProblemError } from './support/errors/problem.js'
import { TEST_TRACE_ID, problem, problemResponse, response } from './fixtures/http.js'

describe('RFC 9457 API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves a complete domain and validation problem', async () => {
    const errors = { phone: ['Введите номер телефона'] }
    const result = await parseProblemResponse(problemResponse(400, 'validation-failed', {
      title: 'Некорректный запрос',
      detail: 'Исправьте указанные поля и повторите запрос',
      errors
    }))

    expect(result).toBeInstanceOf(ProblemError)
    expect(result).toMatchObject({
      type: 'https://sarafan.sw.consulting/problems/validation-failed',
      title: 'Некорректный запрос',
      status: 400,
      detail: 'Исправьте указанные поля и повторите запрос',
      instance: `urn:sarafan:problem:${TEST_TRACE_ID}`,
      code: 'validation_failed',
      errors,
      traceId: TEST_TRACE_ID
    })
  })

  it.each([
    ['missing body', null],
    ['missing type', { type: undefined }],
    ['foreign type', { type: 'https://example.test/problem' }],
    ['internal UI type', { type: 'https://sarafan.sw.consulting/problems/ui/protocol-error' }],
    ['invalid status', { status: 399 }],
    ['English title', { title: 'Bad request' }],
    ['missing detail', { detail: undefined }],
    ['invalid instance', { instance: '' }],
    ['invalid code', { code: 'Invalid-Code' }],
    ['invalid errors object', { errors: [] }],
    ['empty field messages', { errors: { phone: [] } }],
    ['English field message', { errors: { phone: ['Phone is required'] } }],
    ['invalid trace identifier', { traceId: '' }],
    ['mismatched trace instance', { instance: 'urn:sarafan:problem:ffffffffffffffffffffffffffffffff' }]
  ])('normalizes a malformed problem: %s', async (_label, overrides) => {
    const body = overrides === null ? null : problem(400, 'validation-failed', overrides)
    const invalid = response(400, body, 'application/problem+json')

    await expect(parseProblemResponse(invalid)).rejects.toMatchObject({
      type: INTERNAL_PROBLEM_TYPES.protocolError
    })
    await expect(parseProblemResponse(invalid)).rejects.not.toHaveProperty('status')
  })

  it('rejects status mismatches, wrong media types, and invalid JSON', async () => {
    const mismatch = problemResponse(400, 'validation-failed', { status: 422 })
    const wrongMedia = response(400, problem(400, 'validation-failed'), 'application/json')
    const invalidJson = response(400, null, 'application/problem+json')
    invalidJson.json.mockRejectedValue(new SyntaxError('invalid json'))

    for (const invalid of [mismatch, wrongMedia, invalidJson]) {
      await expect(parseProblemResponse(invalid)).rejects.toMatchObject({
        type: INTERNAL_PROBLEM_TYPES.protocolError
      })
    }
  })

  it('adds JSON negotiation, credentials, bearer auth, and retries once after refresh', async () => {
    let token = 'old-token'
    let client
    const refreshSession = vi.fn(async (operationTrace) => {
      await client.request('/refresh', { method: 'POST' }, { operationTrace })
      token = 'new-token'
    })
    const fetch = vi.fn()
      .mockResolvedValueOnce(problemResponse(401, 'invalid-access-token', {
        title: 'Недействительный токен доступа',
        detail: 'Обновите сеанс и повторите запрос'
      }))
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(200, { ok: true }))
    vi.stubGlobal('fetch', fetch)
    client = createApiClient({ getAccessToken: () => token, refreshSession })

    await expect(client.request('/resource', {}, { authorize: true })).resolves.toEqual({ ok: true })

    expect(refreshSession).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[0][1].headers.get('Accept')).toBe(JSON_ACCEPT)
    expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer old-token')
    expect(fetch.mock.calls[2][1].headers.get('Authorization')).toBe('Bearer new-token')
    expect(fetch.mock.calls[2][1].credentials).toBe('include')

    const traceparents = fetch.mock.calls.map(([, options]) => options.headers.get('traceparent'))
    expect(traceparents).toHaveLength(3)
    for (const traceparent of traceparents) {
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/u)
    }
    expect(new Set(traceparents.map(traceparent => traceparent.slice(3, 35))).size).toBe(1)
    expect(new Set(traceparents.map(traceparent => traceparent.slice(36, 52))).size).toBe(3)
  })

  it('negotiates photo responses and handles bodyless successes', async () => {
    const photo = new globalThis.Blob(['image'], { type: 'image/png' })
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(200, photo, 'image/png'))
      .mockResolvedValueOnce(response(204))
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({ getAccessToken: () => '', refreshSession: vi.fn() })

    await expect(client.request('/photo', {}, { responseType: 'blob' })).resolves.toBe(photo)
    expect(fetch.mock.calls[0][1].headers.get('Accept')).toBe(PHOTO_ACCEPT)
    await expect(client.request('/empty', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('normalizes rejected fetch and malformed success bodies', async () => {
    const malformed = response(200, null)
    malformed.json.mockRejectedValue(new SyntaxError('bad response'))
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(malformed)
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({ getAccessToken: () => '', refreshSession: vi.fn() })

    await expect(client.request('/offline')).rejects.toMatchObject({
      type: INTERNAL_PROBLEM_TYPES.networkUnavailable
    })
    await expect(client.request('/malformed')).rejects.toMatchObject({
      type: INTERNAL_PROBLEM_TYPES.protocolError
    })
  })

  it('logs one sanitized final API failure with server correlation', async () => {
    const logger = { log: vi.fn() }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(503, 'service-unavailable', {
      title: 'Сервис временно недоступен',
      detail: 'Повторите попытку позднее'
    })))
    const client = createApiClient({
      getAccessToken: () => 'never-log-this-token',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request(
      '/api/v1/customers/me?phone=%2B79991234567',
      { method: 'GET', headers: { 'X-Unsafe': 'secret' } },
      { authorize: true }
    )).rejects.toMatchObject({ code: 'service_unavailable' })

    expect(logger.log).toHaveBeenCalledOnce()
    const [definition, attributes, context] = logger.log.mock.calls[0]
    expect(definition.name).toBe('sarafan.ui.api.request.failed')
    expect(attributes).toEqual(expect.objectContaining({
      'http.request.method': 'GET',
      'http.route': '/api/v1/customers/me',
      'http.response.status_code': 503,
      'error.type': 'https://sarafan.sw.consulting/problems/service-unavailable',
      'sarafan.problem.code': 'service_unavailable',
      'sarafan.problem.instance': `urn:sarafan:problem:${TEST_TRACE_ID}`,
      'retry.count': 0
    }))
    expect(context).toEqual({ traceId: TEST_TRACE_ID })
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(/79991234567|never-log|X-Unsafe/u)
  })

  it('logs non-validation client failures', async () => {
    const logger = { log: vi.fn() }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(
      404,
      'customer-not-found'
    )))
    const client = createApiClient({
      getAccessToken: () => '',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request('/api/v1/customers/me')).rejects.toMatchObject({
      code: 'customer_not_found'
    })
    expect(logger.log).toHaveBeenCalledOnce()
  })

  it('logs an invalid access token only after its retry is exhausted', async () => {
    const logger = { log: vi.fn() }
    const fetch = vi.fn()
      .mockResolvedValueOnce(problemResponse(401, 'invalid-access-token'))
      .mockResolvedValueOnce(problemResponse(401, 'invalid-access-token'))
      .mockResolvedValueOnce(problemResponse(401, 'invalid-access-token'))
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({
      getAccessToken: () => 'token',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request(
      '/api/v1/customers/me',
      {},
      { authorize: true, retry: false }
    )).rejects.toBeInstanceOf(ProblemError)
    expect(logger.log).not.toHaveBeenCalled()

    await expect(client.request(
      '/api/v1/customers/me',
      {},
      { authorize: true }
    )).rejects.toBeInstanceOf(ProblemError)
    expect(logger.log).toHaveBeenCalledOnce()
    expect(logger.log.mock.calls[0][1]['retry.count']).toBe(1)
  })

  it('marks an already-reported refresh failure to prevent duplicate operation logs', async () => {
    const logger = { log: vi.fn() }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(401, 'invalid-access-token')))
    const client = createApiClient({
      getAccessToken: () => 'token',
      refreshSession: async () => {
        const refreshClient = createApiClient({
          getAccessToken: () => '',
          refreshSession: vi.fn(),
          logger
        })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problemResponse(
          503,
          'service-unavailable'
        )))
        await refreshClient.request('/api/v1/auth/refresh', { method: 'POST' })
      },
      logger
    })

    await expect(client.request('/api/v1/customers/me', {}, { authorize: true }))
      .rejects.toMatchObject({ code: 'service_unavailable' })
    expect(logger.log).toHaveBeenCalledOnce()
  })

  it('does not log expected validation, login, or session-expiry problems', async () => {
    const logger = { log: vi.fn() }
    const fetch = vi.fn()
      .mockResolvedValueOnce(problemResponse(400, 'validation-failed'))
      .mockResolvedValueOnce(problemResponse(401, 'login-failed'))
      .mockResolvedValueOnce(problemResponse(401, 'invalid-refresh-token'))
    vi.stubGlobal('fetch', fetch)
    const client = createApiClient({
      getAccessToken: () => '',
      refreshSession: vi.fn(),
      logger
    })

    await expect(client.request('/api/v1/auth/code/request', { method: 'POST' })).rejects.toBeInstanceOf(ProblemError)
    await expect(client.request('/api/v1/auth/code/verify', { method: 'POST' })).rejects.toBeInstanceOf(ProblemError)
    await expect(client.request('/api/v1/auth/refresh', { method: 'POST' })).rejects.toBeInstanceOf(ProblemError)
    expect(logger.log).not.toHaveBeenCalled()
  })
})
