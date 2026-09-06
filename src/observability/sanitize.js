// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

const PROBLEM_TYPE = /^https:\/\/sarafan\.sw\.consulting\/problems\/[a-z0-9/-]+$/u
const ERROR_TYPE = /^(?:Error|TypeError|RangeError|ReferenceError|SyntaxError|URIError|AggregateError|ProblemError|unknown)$/u
const PROBLEM_CODE = /^[a-z][a-z0-9_]*$/u
const PROBLEM_INSTANCE = /^urn:sarafan:(?:problem|ui):[a-zA-Z0-9:._-]+$/u
const OPERATION_NAME = /^[a-z][a-z0-9.]*$/u
const EVENT_NAME = /^sarafan\.(?:ui|back\.office)\.[a-z.]+$/u
const HTTP_METHOD = /^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)$/u
const ROUTE = /^\/api\/v1\/[a-z/{}/-]+$/u
const TRACE_ID = /^[0-9a-f]{32}$/u
const SPAN_ID = /^[0-9a-f]{16}$/u
const TRACE_FLAGS = /^(?:00|01)$/u

const validators = Object.freeze({
  'http.request.method': value => typeof value === 'string' && HTTP_METHOD.test(value),
  'http.route': value => typeof value === 'string' && ROUTE.test(value),
  'http.response.status_code': value => Number.isInteger(value) && value >= 100 && value <= 599,
  'error.type': value => typeof value === 'string' && (PROBLEM_TYPE.test(value) || ERROR_TYPE.test(value)),
  'sarafan.problem.code': value => typeof value === 'string' && PROBLEM_CODE.test(value),
  'sarafan.problem.instance': value => typeof value === 'string' && PROBLEM_INSTANCE.test(value),
  'retry.count': value => Number.isInteger(value) && value >= 0 && value <= 1,
  'operation.name': value => typeof value === 'string' && OPERATION_NAME.test(value),
  'event.name': value => typeof value === 'string' && EVENT_NAME.test(value),
  'event.dropped_count': value => Number.isInteger(value) && value > 0
})

export function sanitizeAttributes(definition, attributes) {
  if (attributes === null || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return Object.freeze({})
  }

  const sanitized = {}
  for (const key of definition.allowedAttributes) {
    const value = attributes[key]
    if (value !== undefined && validators[key]?.(value)) sanitized[key] = value
  }
  return Object.freeze(sanitized)
}

export function sanitizeTraceContext(context) {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) {
    return Object.freeze({})
  }

  const traceId = TRACE_ID.test(context.traceId) ? context.traceId : undefined
  const spanId = SPAN_ID.test(context.spanId) ? context.spanId : undefined
  const traceFlags = TRACE_FLAGS.test(context.traceFlags) ? context.traceFlags : undefined
  return Object.freeze({
    ...(traceId ? { traceId } : {}),
    ...(traceId && spanId ? { spanId } : {}),
    ...(traceId && traceFlags ? { traceFlags } : {})
  })
}

export function safeErrorType(value) {
  if (typeof value?.type === 'string' && PROBLEM_TYPE.test(value.type)) return value.type
  const name = value?.name
  return typeof name === 'string' && ERROR_TYPE.test(name) ? name : 'unknown'
}

export function validTraceId(value) {
  return typeof value === 'string' && TRACE_ID.test(value)
}
