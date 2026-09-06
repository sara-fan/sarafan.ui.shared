// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export function createDeduplication() {
let handled = new WeakSet()

function trackable(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
}

function markHandled(value) {
  if (trackable(value)) handled.add(value)
  return value
}

function isHandled(value) {
  return trackable(value) && handled.has(value)
}

function resetHandledForTests() {
  handled = new WeakSet()
}

return Object.freeze({ markHandled, isHandled, resetHandledForTests })
}
