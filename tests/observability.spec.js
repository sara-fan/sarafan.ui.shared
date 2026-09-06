// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it, vi } from 'vitest'

import { installErrorBoundaries, reportBoundaryFailure } from './support/observability/boundaries.js'
import { EVENTS, SEVERITY, isCatalogueEvent } from './support/observability/catalogue.js'
import { createConsoleSink, formatConsoleRecord } from './support/observability/console-sink.js'
import {
  isHandled,
  markHandled,
  resetHandledForTests
} from './support/observability/deduplication.js'
import { createLogger } from './support/observability/logger.js'
import { problemAttributes, problemContext } from './support/observability/problem-reporting.js'
import {
  safeErrorType,
  sanitizeAttributes,
  sanitizeTraceContext,
  validTraceId
} from './support/observability/sanitize.js'
import {
  createOperationTrace,
  createSpanId,
  createTraceId,
  problemTraceContext
} from './support/observability/trace-context.js'
import { ProblemError } from './support/errors/problem.js'

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const SPAN_ID = '00f067aa0ba902b7'

function memoryLogger(options = {}) {
  const records = []
  const logger = createLogger({
    enabled: true,
    minimumSeverity: 'DEBUG',
    sink: { emit: record => records.push(record) },
    now: () => new Date('2026-09-03T10:20:30.456Z'),
    environment: 'test',
    ...options
  })
  return { logger, records }
}

describe('UI observability', () => {
  it('defines immutable OpenTelemetry severities and stable catalogue events', () => {
    expect(SEVERITY).toMatchObject({
      DEBUG: { number: 5 },
      INFO: { number: 9 },
      WARN: { number: 13 },
      ERROR: { number: 17 },
      FATAL: { number: 21 }
    })
    expect(Object.values(EVENTS).map(event => event.name)).toEqual([
      'sarafan.ui.application.started',
      'sarafan.ui.application.error',
      'sarafan.ui.promise.unhandled',
      'sarafan.ui.api.request.failed',
      'sarafan.ui.session.restore.failed',
      'sarafan.ui.operation.suppressed',
      'sarafan.ui.events.dropped'
    ])
    expect(Object.values(EVENTS).every(isCatalogueEvent)).toBe(true)
    expect(isCatalogueEvent({ ...EVENTS.applicationStarted })).toBe(false)
    expect(Object.isFrozen(EVENTS.apiRequestFailed.allowedAttributes)).toBe(true)
  })

  it('keeps only typed allowlisted attributes and valid W3C correlation', () => {
    const attributes = sanitizeAttributes(EVENTS.apiRequestFailed, {
      'http.request.method': 'POST',
      'http.route': '/api/v1/auth/refresh',
      'http.response.status_code': 401,
      'error.type': 'https://sarafan.sw.consulting/problems/invalid-refresh-token',
      'sarafan.problem.code': 'invalid_refresh_token',
      'sarafan.problem.instance': `urn:sarafan:problem:${TRACE_ID}`,
      'retry.count': 1,
      Authorization: 'Bearer secret',
      body: { phone: '+79991234567' }
    })

    expect(attributes).toEqual({
      'http.request.method': 'POST',
      'http.route': '/api/v1/auth/refresh',
      'http.response.status_code': 401,
      'error.type': 'https://sarafan.sw.consulting/problems/invalid-refresh-token',
      'sarafan.problem.code': 'invalid_refresh_token',
      'sarafan.problem.instance': `urn:sarafan:problem:${TRACE_ID}`,
      'retry.count': 1
    })
    expect(sanitizeAttributes(EVENTS.apiRequestFailed, null)).toEqual({})
    expect(sanitizeAttributes(EVENTS.apiRequestFailed, ['unsafe'])).toEqual({})
    expect(sanitizeAttributes(EVENTS.apiRequestFailed, {
      'http.request.method': 'CONNECT',
      'http.route': '/api/v1/customers/me?token=secret',
      'http.response.status_code': 999,
      'error.type': 'SecretDatabaseFailure',
      'sarafan.problem.code': 'Invalid-Code',
      'sarafan.problem.instance': 'https://customer.example',
      'retry.count': 4
    })).toEqual({})
    expect(sanitizeTraceContext({ traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: '01' }))
      .toEqual({ traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: '01' })
    expect(sanitizeTraceContext({ traceId: 'bad', spanId: SPAN_ID, traceFlags: 'ff' })).toEqual({})
    expect(sanitizeTraceContext(null)).toEqual({})
  })

  it('emits frozen human-readable records without retaining rejected fields', () => {
    const { logger, records } = memoryLogger()
    expect(logger.log(EVENTS.apiRequestFailed, {
      'http.request.method': 'POST',
      'http.route': '/api/v1/auth/refresh',
      'http.response.status_code': 401,
      'retry.count': 0,
      token: 'secret-token'
    }, { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: '00' })).toBe(true)

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      timestamp: '2026-09-03T10:20:30.456Z',
      severityText: 'WARN',
      severityNumber: 13,
      eventName: 'sarafan.ui.api.request.failed',
      body: 'API request failed: POST /api/v1/auth/refresh -> 401.',
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      resource: {
        'service.name': 'sarafan.ui',
        'service.version': '0.0.1',
        'deployment.environment.name': 'test'
      },
      instrumentationScope: 'sarafan.ui.observability'
    })
    expect(JSON.stringify(records[0])).not.toContain('secret-token')
    expect(Object.isFrozen(records[0])).toBe(true)
    expect(formatConsoleRecord(records[0])).toBe(
      `2026-09-03T10:20:30.456Z WARN sarafan.ui.api.request.failed trace_id=${TRACE_ID} span_id=${SPAN_ID} API request failed: POST /api/v1/auth/refresh -> 401.`
    )
  })

  it('renders every catalogue body from sanitized low-cardinality fields', () => {
    const { logger, records } = memoryLogger()
    logger.log(EVENTS.applicationStarted)
    logger.log(EVENTS.sessionRestoreFailed, { 'error.type': 'TypeError' })
    logger.log(EVENTS.operationSuppressed, { 'operation.name': 'status.version.load' })
    logger.log(EVENTS.apiRequestFailed)

    expect(records.map(record => record.body)).toEqual([
      'Sarafan UI started.',
      'The customer session could not be restored.',
      'An expected failure was suppressed for status.version.load.',
      'API request failed: UNKNOWN <unknown> -> no response.'
    ])
    expect(sanitizeAttributes(EVENTS.operationSuppressed, {
      'operation.name': 'status.version.load'
    })).toEqual({ 'operation.name': 'status.version.load' })
  })

  it('obeys master control and thresholds and contains sink failures', () => {
    const sink = { emit: vi.fn() }
    expect(createLogger({ enabled: false, sink }).log(EVENTS.applicationError)).toBe(false)
    expect(createLogger({ enabled: true, minimumSeverity: 'WARN', sink })
      .log(EVENTS.applicationStarted)).toBe(false)
    expect(createLogger({ enabled: true, minimumSeverity: 'invalid', sink })
      .log(EVENTS.applicationStarted)).toBe(false)
    expect(createLogger({ enabled: true, sink }).log({ name: 'unsafe' })).toBe(false)
    expect(createLogger({ enabled: true, sink: { emit: () => { throw new Error('sink secret') } } })
      .log(EVENTS.applicationError)).toBe(false)
    expect(sink.emit).not.toHaveBeenCalled()
  })

  it('rate limits global failures and emits aggregate dropped counts', () => {
    let clock = Date.parse('2026-09-03T10:00:00Z')
    const records = []
    const logger = createLogger({
      enabled: true,
      minimumSeverity: 'DEBUG',
      sink: { emit: record => records.push(record) },
      now: () => new Date(clock),
      rateLimit: { maximum: 1, windowMilliseconds: 1000 }
    })

    expect(logger.log(EVENTS.applicationError, { 'error.type': 'TypeError' })).toBe(true)
    expect(logger.log(EVENTS.applicationError, { 'error.type': 'TypeError' })).toBe(false)
    logger.flushDropped()
    expect(records.map(record => record.eventName)).toEqual([
      EVENTS.applicationError.name,
      EVENTS.eventsDropped.name
    ])
    expect(records[1].attributes['event.dropped_count']).toBe(1)

    expect(logger.log(EVENTS.applicationError)).toBe(false)
    clock += 1001
    expect(logger.log(EVENTS.applicationError)).toBe(true)
    expect(records.slice(-2).map(record => record.eventName)).toEqual([
      EVENTS.eventsDropped.name,
      EVENTS.applicationError.name
    ])
    expect(logger.log(EVENTS.promiseUnhandled)).toBe(true)

    const twoRecords = []
    const twoPerWindow = createLogger({
      enabled: true,
      minimumSeverity: 'DEBUG',
      sink: { emit: record => twoRecords.push(record) },
      now: () => new Date(clock),
      rateLimit: { maximum: 2, windowMilliseconds: 1000 }
    })
    expect(twoPerWindow.log(EVENTS.applicationError)).toBe(true)
    expect(twoPerWindow.log(EVENTS.applicationError)).toBe(true)
    expect(twoRecords).toHaveLength(2)
    for (const rateLimit of [
      null,
      {},
      { maximum: 0, windowMilliseconds: 1000 },
      { maximum: 1, windowMilliseconds: 0 },
      { maximum: 1.5, windowMilliseconds: 1000 },
      { maximum: 1, windowMilliseconds: Number.POSITIVE_INFINITY }
    ]) {
      const invalidRateLimit = createLogger({
        enabled: true,
        sink: { emit: vi.fn() },
        rateLimit
      })
      expect(invalidRateLimit.log(EVENTS.applicationError)).toBe(true)
      expect(invalidRateLimit.log(EVENTS.applicationError)).toBe(false)
    }

    const errorOnlyRecords = []
    const errorOnly = createLogger({
      enabled: true,
      minimumSeverity: 'ERROR',
      sink: { emit: record => errorOnlyRecords.push(record) },
      now: () => new Date(clock),
      rateLimit: { maximum: 1, windowMilliseconds: 1000 }
    })
    errorOnly.log(EVENTS.applicationError)
    errorOnly.log(EVENTS.applicationError)
    errorOnly.flushDropped()
    expect(errorOnlyRecords).toHaveLength(1)
  })

  it('routes readable lines to console methods by severity', () => {
    const target = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    }
    const sink = createConsoleSink(target)
    for (const [severityNumber, method] of [[21, 'error'], [13, 'warn'], [9, 'info'], [5, 'debug']]) {
      sink.emit({
        timestamp: '2026-09-03T10:00:00.000Z',
        severityText: 'TEST',
        severityNumber,
        eventName: 'sarafan.ui.test',
        body: 'Readable message.'
      })
      expect(target[method]).toHaveBeenCalledOnce()
    }
  })

  it('keeps the console sink non-throwing with partial, absent, or failing targets', () => {
    const record = {
      timestamp: '2026-09-03T10:00:00.000Z',
      severityText: 'TEST',
      severityNumber: 5,
      eventName: 'sarafan.ui.test',
      body: 'Readable message.'
    }
    const fallbackTarget = { log: vi.fn() }
    const fallbackSink = createConsoleSink(fallbackTarget)

    for (const severityNumber of [21, 13, 9, 5]) {
      expect(() => fallbackSink.emit({ ...record, severityNumber })).not.toThrow()
    }
    expect(fallbackTarget.log).toHaveBeenCalledTimes(4)
    expect(fallbackTarget.log).toHaveBeenLastCalledWith(formatConsoleRecord(record))

    const partialTarget = { info: vi.fn() }
    createConsoleSink(partialTarget).emit(record)
    expect(partialTarget.info).toHaveBeenCalledWith(formatConsoleRecord(record))

    expect(() => createConsoleSink(null).emit(record)).not.toThrow()
    expect(() => createConsoleSink(new Proxy({}, {
      get: () => { throw new Error('console inaccessible') }
    })).emit(record)).not.toThrow()
    expect(() => createConsoleSink({
      debug: () => { throw new Error('console unavailable') }
    }).emit(record)).not.toThrow()
    expect(() => fallbackSink.emit(null)).not.toThrow()
  })

  it('generates valid non-zero W3C identifiers and retains a trace across attempts', () => {
    let seed = 0
    const cryptoTarget = {
      getRandomValues(bytes) {
        seed += 1
        bytes.fill(seed)
        return bytes
      }
    }
    expect(createTraceId(cryptoTarget)).toMatch(/^[0-9a-f]{32}$/u)
    expect(createSpanId(cryptoTarget)).toMatch(/^[0-9a-f]{16}$/u)
    const operation = createOperationTrace(cryptoTarget)
    expect(operation.lastContext()).toEqual({ traceId: operation.traceId })
    const first = operation.nextAttempt()
    const second = operation.nextAttempt()
    expect(first.traceId).toBe(second.traceId)
    expect(first.spanId).not.toBe(second.spanId)
    expect(first.traceparent).toBe(`00-${first.traceId}-${first.spanId}-00`)
    expect(operation.lastContext()).toEqual({
      traceId: second.traceId,
      spanId: second.spanId,
      traceFlags: '00'
    })

    let calls = 0
    const zeroThenOne = {
      getRandomValues(bytes) {
        calls += 1
        bytes.fill(calls === 1 ? 0 : 1)
        return bytes
      }
    }
    expect(createSpanId(zeroThenOne)).toBe('0101010101010101')
    expect(() => createTraceId({})).toThrow(TypeError)
  })

  it('uses a validated server problem trace as the authoritative correlation', () => {
    const operation = { traceId: '11111111111111111111111111111111', spanId: SPAN_ID, traceFlags: '00' }
    expect(problemTraceContext({ traceId: TRACE_ID }, operation)).toEqual({ traceId: TRACE_ID })
    expect(problemTraceContext({ traceId: operation.traceId }, operation)).toEqual(operation)
    expect(problemTraceContext({ traceId: 'bad' }, operation)).toBe(operation)
    expect(validTraceId(TRACE_ID)).toBe(true)
    expect(validTraceId('BAD')).toBe(false)
  })

  it('deduplicates Vue, window, and promise boundaries without logging raw errors', () => {
    resetHandledForTests()
    const raw = new TypeError('customer phone +79991234567')
    const logger = { log: vi.fn().mockReturnValue(true) }
    const listeners = new Map()
    const target = {
      addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
      removeEventListener: vi.fn((name) => listeners.delete(name))
    }
    const app = { config: {} }
    const dispose = installErrorBoundaries(app, target, logger)

    expect(app.config.errorHandler(raw)).toBe(true)
    expect(listeners.get('error')({ error: raw })).toBe(false)
    expect(listeners.get('unhandledrejection')({ reason: new Error('secret') })).toBe(true)
    expect(logger.log).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('+79991234567')
    dispose()
    expect(target.removeEventListener).toHaveBeenCalledTimes(2)

    const tracked = {}
    expect(isHandled(tracked)).toBe(false)
    expect(markHandled(tracked)).toBe(tracked)
    expect(isHandled(tracked)).toBe(true)
    expect(markHandled('primitive')).toBe('primitive')
    expect(isHandled('primitive')).toBe(false)
  })

  it('reports only safe problem identity and never localized or native messages', () => {
    resetHandledForTests()
    const problem = new ProblemError({
      type: 'https://sarafan.sw.consulting/problems/invalid-access-token',
      code: 'invalid_access_token',
      instance: `urn:sarafan:problem:${TRACE_ID}`,
      traceId: TRACE_ID,
      title: 'Секретный заголовок',
      detail: 'Телефон +79991234567'
    }, { cause: new Error('database password') })

    expect(problemAttributes(problem)).toEqual({
      'error.type': problem.type,
      'sarafan.problem.code': problem.code,
      'sarafan.problem.instance': problem.instance
    })
    expect(problemContext(problem)).toEqual({ traceId: TRACE_ID })
    expect(problemContext({}, { traceId: TRACE_ID })).toEqual({ traceId: TRACE_ID })
    expect(safeErrorType(new TypeError())).toBe('TypeError')
    expect(safeErrorType({ name: 'DatabasePasswordError' })).toBe('unknown')

    const { logger, records } = memoryLogger()
    expect(reportBoundaryFailure(problem, EVENTS.applicationError, logger)).toBe(true)
    expect(reportBoundaryFailure(problem, EVENTS.applicationError, logger)).toBe(false)
    expect(JSON.stringify(records)).not.toMatch(/Секретный|Телефон|database password|79991234567/u)
  })
})
