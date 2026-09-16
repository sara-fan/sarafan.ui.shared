// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export function validationFields(problem, { types = {}, aliases = {} } = {}) {
  const fields = Object.entries(problem?.errors ?? {})
    .filter(([, messages]) => Array.isArray(messages) && messages.length)
    .map(([field]) => Object.entries(aliases)
      .find(([prefix]) => field.toLowerCase() === prefix.toLowerCase() || field.toLowerCase().startsWith(`${prefix.toLowerCase()}.`))?.[1] ?? field)
  return [...new Set([...fields, ...(types[problem?.type] ?? [])])]
}

function available(control, root) {
  if (!control.isConnected || control.matches(':disabled, [disabled], [type="hidden"]')
    || control.readOnly && control.getAttribute('role') !== 'combobox') return false
  for (let element = control; element; element = element.parentElement) {
    const style = element.ownerDocument.defaultView.getComputedStyle(element)
    if (element.hidden || element.hasAttribute('inert') || element.getAttribute('aria-hidden') === 'true'
      || element.getAttribute('aria-disabled') === 'true' || style.display === 'none'
      || control.type === 'file' && element === control && style.opacity === '0'
      || style.visibility === 'hidden' || style.visibility === 'collapse') return false
    if (element === root) break
  }
  return true
}

export function focusInvalidField(root, fields) {
  if (!root?.isConnected || !fields.length) return false
  const names = new Set(fields.map(field => field.toLowerCase()))
  for (const control of root.querySelectorAll('input, textarea, select, button, [tabindex]')) {
    const group = control.closest('[data-validation-field]')
    const name = group?.getAttribute('data-validation-field') ?? control.getAttribute('name') ?? control.id
    if (!names.has(name.toLowerCase()) || !available(control, root)) continue
    control.focus()
    if (control.ownerDocument.activeElement === control) return true
  }
  return false
}

// Inject the consuming framework lifecycle; this package has no Vue runtime dependency.
export function createValidationFocus({ nextTick, onScopeDispose, watch }) {
  // Call only around a user action, never from a validation watcher or background load.
  return function useValidationFocus(root, { context = () => null, active = () => true } = {}) {
    let generation = 0
    let disposed = false
    watch(context, () => { generation++ }, { flush:'sync' })
    onScopeDispose(() => { disposed = true; generation++ })
    return async function focusAfter(action, fields) {
      const ownGeneration = ++generation
      const origin = root.value
      try {
        return await action()
      } finally {
        await nextTick()
        if (!disposed && generation === ownGeneration && active() && origin === root.value) {
          focusInvalidField(origin, fields())
        }
      }
    }
  }
}
