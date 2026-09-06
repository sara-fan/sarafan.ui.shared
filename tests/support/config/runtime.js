// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

function exactBoolean(value) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

export function resolveRuntimeConfig({ runtime = {}, developmentLogging } = {}) {
  const runtimeSupplied = runtime !== null
    && typeof runtime === 'object'
    && Object.hasOwn(runtime, 'loggingEnabled')
  const runtimeLogging = exactBoolean(runtime?.loggingEnabled)
  const developmentFallback = import.meta.env.DEV
    ? exactBoolean(developmentLogging)
    : undefined

  return Object.freeze({
    loggingEnabled: runtimeSupplied ? (runtimeLogging ?? false) : (developmentFallback ?? false),
    minimumSeverity: import.meta.env.DEV ? 'DEBUG' : 'WARN'
  })
}

export const runtimeConfig = resolveRuntimeConfig({
  runtime: globalThis.__SARAFAN_RUNTIME_CONFIG__,
  developmentLogging: import.meta.env.VITE_SARAFAN_UI_LOGGING_ENABLED
})
