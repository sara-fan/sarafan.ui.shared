// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { PROBLEM_TYPE_ROOT, createProblemTools } from '../../../src/problems.js'
import { EVENTS } from '../observability/catalogue.js'
import { uiLogger } from '../observability/logger.js'
export { PROBLEM_TYPE_ROOT, ProblemError } from '../../../src/problems.js'

export const CORE_PROBLEM_TYPES = Object.freeze({
  customerNotFound: `${PROBLEM_TYPE_ROOT}customer-not-found`,
  invalidAccessToken: `${PROBLEM_TYPE_ROOT}invalid-access-token`,
  invalidRefreshToken: `${PROBLEM_TYPE_ROOT}invalid-refresh-token`,
  loginFailed: `${PROBLEM_TYPE_ROOT}login-failed`,
  validationFailed: `${PROBLEM_TYPE_ROOT}validation-failed`
})

export const { INTERNAL_PROBLEM_TYPES, createInternalProblem, normalizeProblem, presentProblem, problemFieldErrors, suppressProblem } = createProblemTools({
  logger: uiLogger, suppressedEvent: EVENTS.operationSuppressed, additions: {
  photoPreviewUnavailable: {
    suffix: 'photo-preview-unavailable',
    code: 'ui_photo_preview_unavailable',
    title: 'Не удалось загрузить фотографию',
    detail: 'Фотография недоступна. Вы можете продолжить редактирование профиля'
  },
  }
})
