// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createLogger as createSharedLogger } from '../../../src/observability/logger.js'
import { version } from '../../../package.json'
import { runtimeConfig } from '../config/runtime.js'
import { EVENTS, SEVERITY, isCatalogueEvent } from './catalogue.js'

export function createLogger(options = {}) {
  return createSharedLogger({ serviceName: 'sarafan.ui', version, events: EVENTS, severity: SEVERITY, isCatalogueEvent, enabled: runtimeConfig.loggingEnabled, minimumSeverity: runtimeConfig.minimumSeverity, environment: import.meta.env.MODE || 'unknown', ...options })
}
export const uiLogger = createLogger()
