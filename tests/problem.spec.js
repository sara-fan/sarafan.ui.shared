// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it, vi } from 'vitest'

import {
  INTERNAL_PROBLEM_TYPES,
  ProblemError,
  createInternalProblem,
  normalizeProblem,
  presentProblem,
  problemFieldErrors,
  suppressProblem
} from './support/errors/problem.js'

describe('shared problem model', () => {
  it('constructs every internal catalogue entry without an HTTP status', () => {
    for (const [kind, type] of Object.entries(INTERNAL_PROBLEM_TYPES)) {
      const problem = createInternalProblem(kind)

      expect(problem).toBeInstanceOf(ProblemError)
      expect(problem).toMatchObject({ type })
      expect(problem.title).toMatch(/[А-ЯЁа-яё]/u)
      expect(problem.detail).toMatch(/[А-ЯЁа-яё]/u)
      expect(problem.code).toMatch(/^ui_/u)
      expect(problem.instance).toMatch(/^urn:sarafan:ui:/u)
      expect(problem).not.toHaveProperty('status')
    }
  })

  it('generates unique instances and keeps causes diagnostic-only', () => {
    const cause = new Error('secret native message')
    const first = createInternalProblem('unexpectedError', { cause })
    const second = createInternalProblem('unexpectedError')

    expect(first.instance).not.toBe(second.instance)
    expect(first.cause).toBe(cause)
    expect(Object.keys(first)).not.toContain('cause')
    expect(JSON.stringify(first)).not.toContain('secret native message')
    expect(first.toJSON()).not.toHaveProperty('cause')
  })

  it('preserves structured server problems and presents safe centralized text', () => {
    const server = new ProblemError({
      type: 'https://sarafan.sw.consulting/problems/customer-not-found',
      title: 'Пользователь не найден',
      status: 404,
      detail: 'Пользователь не найден',
      instance: 'urn:sarafan:problem:4bf92f3577b34da6a3ce929d0e0e4736',
      code: 'customer_not_found',
      errors: { Phone: ['Проверьте номер телефона'] },
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736'
    })

    expect(normalizeProblem(server)).toBe(server)
    expect(presentProblem(server, {
      detailsByType: { [server.type]: 'Выберите регистрацию' }
    })).toBe('Выберите регистрацию')
    expect(problemFieldErrors(server, 'phone')).toEqual(['Проверьте номер телефона'])
    expect(problemFieldErrors(server, 'code')).toEqual([])
    expect(server.toJSON()).toEqual(expect.objectContaining({
      status: 404,
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736'
    }))
  })

  it('normalizes native and arbitrary failures without displaying raw values', () => {
    for (const value of [
      'raw failure',
      null,
      { message: 'raw object' },
      new Error('raw error'),
      new TypeError('Failed to fetch')
    ]) {
      const problem = normalizeProblem(value, { detail: 'Безопасное описание' })
      expect(problem.type).toBe(INTERNAL_PROBLEM_TYPES.unexpectedError)
      expect(problem.message).toBe('Безопасное описание')
      expect(JSON.stringify(problem)).not.toContain('raw')
    }

    expect(normalizeProblem(new TypeError('network'), { kind: 'networkUnavailable' }).type)
      .toBe(INTERNAL_PROBLEM_TYPES.networkUnavailable)
  })

  it('supports structured local validation and named suppression', () => {
    const logger = { log: vi.fn() }
    const validation = createInternalProblem('invalidInput', {
      detail: 'Введите номер телефона',
      errors: { phone: ['Введите номер телефона'] }
    })
    expect(problemFieldErrors(validation, 'phone')).toEqual(['Введите номер телефона'])
    expect(suppressProblem(validation, { operation: 'validation.local', logger })).toBe(validation)
    expect(suppressProblem(new Error('hidden'), {
      detail: 'Безопасная диагностика',
      operation: 'failure.expected',
      logger
    }).message)
      .toBe('Безопасная диагностика')
    expect(logger.log).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('hidden')
  })

  it('rejects unknown internal catalogue keys', () => {
    expect(() => createInternalProblem('missing')).toThrow(TypeError)
  })
})
