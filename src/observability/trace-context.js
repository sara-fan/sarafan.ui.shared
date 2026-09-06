// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { validTraceId } from './sanitize.js'

function randomIdentifier(byteLength, cryptoTarget) {
  if (!cryptoTarget?.getRandomValues) throw new TypeError('Web Crypto is required')

  let bytes
  do {
    bytes = cryptoTarget.getRandomValues(new Uint8Array(byteLength))
  } while (bytes.every(byte => byte === 0))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function createTraceId(cryptoTarget = globalThis.crypto) {
  return randomIdentifier(16, cryptoTarget)
}

export function createSpanId(cryptoTarget = globalThis.crypto) {
  return randomIdentifier(8, cryptoTarget)
}

export function createOperationTrace(cryptoTarget = globalThis.crypto) {
  const traceId = createTraceId(cryptoTarget)
  let lastSpanId

  return Object.freeze({
    traceId,
    nextAttempt() {
      lastSpanId = createSpanId(cryptoTarget)
      return Object.freeze({
        traceId,
        spanId: lastSpanId,
        traceFlags: '00',
        traceparent: `00-${traceId}-${lastSpanId}-00`
      })
    },
    lastContext() {
      return Object.freeze({
        traceId,
        ...(lastSpanId ? { spanId: lastSpanId, traceFlags: '00' } : {})
      })
    }
  })
}

export function problemTraceContext(problem, operationContext) {
  if (!validTraceId(problem?.traceId)) return operationContext
  return Object.freeze({
    traceId: problem.traceId,
    ...(problem.traceId === operationContext.traceId && operationContext.spanId
      ? { spanId: operationContext.spanId, traceFlags: operationContext.traceFlags }
      : {})
  })
}
