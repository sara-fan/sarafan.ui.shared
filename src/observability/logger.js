// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createConsoleSink } from './console-sink.js'
import { sanitizeAttributes, sanitizeTraceContext } from './sanitize.js'

const DEFAULT_RATE_LIMIT = Object.freeze({ maximum: 5, windowMilliseconds: 60_000 })
const FAIL_CLOSED_RATE_LIMIT = Object.freeze({
  maximum: 1,
  windowMilliseconds: Number.POSITIVE_INFINITY
})

function normalizeRateLimit(rateLimit) {
  return Number.isSafeInteger(rateLimit?.maximum)
    && rateLimit.maximum > 0
    && Number.isSafeInteger(rateLimit.windowMilliseconds)
    && rateLimit.windowMilliseconds > 0
    ? rateLimit
    : FAIL_CLOSED_RATE_LIMIT
}

function createRecord(definition, attributes, context, now, environment, serviceName, version) {
  const trace = sanitizeTraceContext(context)
  const body = definition.body(attributes).replace(/[\r\n]+/gu, ' ')
  return Object.freeze({
    timestamp: now().toISOString(),
    severityText: definition.severity.text,
    severityNumber: definition.severity.number,
    eventName: definition.name,
    body,
    ...trace,
    resource: Object.freeze({
      'service.name': serviceName,
      'service.version': version,
      'deployment.environment.name': environment
    }),
    instrumentationScope: `${serviceName}.observability`,
    attributes
  })
}

export function createLogger({
  enabled = false,
  serviceName, version, events: EVENTS, severity: SEVERITY, isCatalogueEvent,
  minimumSeverity = 'WARN',
  sink = createConsoleSink(),
  now = () => new Date(),
  environment = 'unknown',
  rateLimit = DEFAULT_RATE_LIMIT
} = {}) {
  const minimumNumber = SEVERITY[minimumSeverity]?.number ?? SEVERITY.WARN.number
  const effectiveRateLimit = normalizeRateLimit(rateLimit)
  const limits = new Map()

  function emit(definition, attributes = {}, context = {}) {
    try {
      if (!enabled || !isCatalogueEvent(definition) || definition.severity.number < minimumNumber) {
        return false
      }
      const sanitized = sanitizeAttributes(definition, attributes)
      sink.emit(createRecord(definition, sanitized, context, now, environment, serviceName, version))
      return true
    } catch {
      return false
    }
  }

  function emitDropped(eventName, count) {
    if (count > 0) {
      emit(EVENTS.eventsDropped, {
        'event.name': eventName,
        'event.dropped_count': count
      })
    }
  }

  function log(definition, attributes = {}, context = {}) {
    try {
      if (!enabled || !isCatalogueEvent(definition) || definition.severity.number < minimumNumber) {
        return false
      }
      if (!definition.rateLimited) return emit(definition, attributes, context)

      const currentTime = now().getTime()
      const current = limits.get(definition.name)
      if (!current || currentTime - current.startedAt >= effectiveRateLimit.windowMilliseconds) {
        if (current) emitDropped(definition.name, current.dropped)
        limits.set(definition.name, { startedAt: currentTime, emitted: 1, dropped: 0 })
        return emit(definition, attributes, context)
      }
      if (current.emitted >= effectiveRateLimit.maximum) {
        current.dropped += 1
        return false
      }
      current.emitted += 1
      return emit(definition, attributes, context)
    } catch {
      return false
    }
  }

  function flushDropped() {
    for (const [eventName, limit] of limits) {
      emitDropped(eventName, limit.dropped)
      limit.dropped = 0
    }
  }

  return Object.freeze({ log, flushDropped })
}

