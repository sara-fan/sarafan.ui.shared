// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { problemAttributes, problemContext } from './observability/problem-reporting.js'

export const PROBLEM_TYPE_ROOT = 'https://sarafan.sw.consulting/problems/'

export const COMMON_INTERNAL_CATALOGUE = Object.freeze({
  networkUnavailable: {
    suffix: 'network-unavailable',
    code: 'ui_network_unavailable',
    title: 'Сервис недоступен',
    detail: 'Проверьте подключение к интернету и повторите попытку'
  },
  protocolError: {
    suffix: 'protocol-error',
    code: 'ui_protocol_error',
    title: 'Некорректный ответ сервиса',
    detail: 'Сервис вернул ответ в неподдерживаемом формате'
  },
  invalidInput: {
    suffix: 'invalid-input',
    code: 'ui_invalid_input',
    title: 'Некорректно заполнены поля',
    detail: 'Исправьте указанные поля и повторите попытку'
  },
  sessionRestoreUnavailable: {
    suffix: 'session-restore-unavailable',
    code: 'ui_session_restore_unavailable',
    title: 'Не удалось восстановить сеанс',
    detail: 'Проверьте подключение к интернету и повторите восстановление сеанса'
  },
  unexpectedError: {
    suffix: 'unexpected-error',
    code: 'ui_unexpected_error',
    title: 'Не удалось выполнить действие',
    detail: 'Повторите попытку позднее'
  }
})

let fallbackInstanceSequence = 0

function uniqueInstance() {
  const identifier = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${fallbackInstanceSequence += 1}`
  return `urn:sarafan:ui:${identifier}`
}

function definedEntries(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

export class ProblemError extends Error {
  constructor(problem, options = {}) {
    super(problem.detail || problem.title)
    this.name = 'ProblemError'
    Object.assign(this, definedEntries({
      type: problem.type,
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      instance: problem.instance,
      code: problem.code,
      errors: problem.errors,
      traceId: problem.traceId
    }))
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        configurable: true,
        writable: true
      })
    }
  }

  toJSON() {
    return definedEntries({
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance: this.instance,
      code: this.code,
      errors: this.errors,
      traceId: this.traceId
    })
  }
}

export function createProblemTools({ additions = {}, logger: defaultLogger, suppressedEvent } = {}) {
  const INTERNAL_CATALOGUE = Object.freeze({ ...COMMON_INTERNAL_CATALOGUE, ...additions })
  const INTERNAL_PROBLEM_TYPES = Object.freeze(Object.fromEntries(
    Object.entries(INTERNAL_CATALOGUE).map(([name, definition]) => [
      name,
      `${PROBLEM_TYPE_ROOT}ui/${definition.suffix}`
    ])
  ))

  function createInternalProblem(kind, options = {}) {
    const definition = INTERNAL_CATALOGUE[kind]
    if (!definition) throw new TypeError(`Unknown internal problem kind: ${kind}`)

    return new ProblemError({
      type: INTERNAL_PROBLEM_TYPES[kind],
      title: definition.title,
      detail: options.detail || definition.detail,
      instance: options.instance || uniqueInstance(),
      code: definition.code,
      errors: options.errors
    }, { cause: options.cause })
  }

  function normalizeProblem(value, options = {}) {
    if (value instanceof ProblemError) return value

    const kind = options.kind || 'unexpectedError'
    return createInternalProblem(kind, {
      cause: value,
      detail: options.detail,
      errors: options.errors
    })
  }

  function presentProblem(value, options = {}) {
    const problem = normalizeProblem(value, options)
    return options.detailsByType?.[problem.type] || problem.detail || problem.title
  }

  function problemFieldErrors(value, field) {
    if (!(value instanceof ProblemError) || !value.errors) return []
    const matchingKey = Object.keys(value.errors).find((key) => key.toLowerCase() === field.toLowerCase())
    return matchingKey ? value.errors[matchingKey] : []
  }

  function suppressProblem(value, options = {}) {
    const problem = normalizeProblem(value, options)
    const logger = options.logger ?? defaultLogger
    logger.log(suppressedEvent, {
      ...problemAttributes(problem),
      'operation.name': options.operation ?? 'unknown'
    }, problemContext(problem))
    return problem
  }

  return Object.freeze({ INTERNAL_PROBLEM_TYPES, createInternalProblem, normalizeProblem, presentProblem, problemFieldErrors, suppressProblem })
}
