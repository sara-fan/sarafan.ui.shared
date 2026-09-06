// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export function formatConsoleRecord(record) {
  const correlation = [
    record.traceId ? `trace_id=${record.traceId}` : '',
    record.spanId ? `span_id=${record.spanId}` : ''
  ].filter(Boolean).join(' ')
  return [
    record.timestamp,
    record.severityText,
    record.eventName,
    correlation,
    record.body
  ].filter(Boolean).join(' ')
}

const NOOP = () => {}
const CONSOLE_METHODS = Object.freeze(['log', 'error', 'warn', 'info', 'debug'])

function bindConsoleMethod(consoleTarget, methodName) {
  for (const candidateName of [methodName, ...CONSOLE_METHODS]) {
    try {
      const method = consoleTarget?.[candidateName]
      if (typeof method === 'function') return method.bind(consoleTarget)
    } catch {
      // An inaccessible console method is treated as unavailable.
    }
  }

  return NOOP
}

export function createConsoleSink(consoleTarget = globalThis.console) {
  const methods = Object.freeze({
    debug: bindConsoleMethod(consoleTarget, 'debug'),
    error: bindConsoleMethod(consoleTarget, 'error'),
    info: bindConsoleMethod(consoleTarget, 'info'),
    warn: bindConsoleMethod(consoleTarget, 'warn')
  })

  return Object.freeze({
    emit(record) {
      try {
        const line = formatConsoleRecord(record)
        if (record.severityNumber >= 17) methods.error(line)
        else if (record.severityNumber >= 13) methods.warn(line)
        else if (record.severityNumber >= 9) methods.info(line)
        else methods.debug(line)
      } catch {
        // Logging must never affect application behavior.
      }
    }
  })
}
