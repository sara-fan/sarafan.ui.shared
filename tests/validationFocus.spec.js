// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { mount, flushPromises } from '@vue/test-utils'
import { h, nextTick, onScopeDispose, ref, watch } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { createValidationFocus, focusInvalidField, validationFields } from '@sara-fan/ui-shared/validation-focus'

const useValidationFocus = createValidationFocus({ nextTick, onScopeDispose, watch })

const wrappers = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); globalThis.document.body.replaceChildren() })
function form(html) {
  const root = globalThis.document.createElement('form')
  root.innerHTML = html
  globalThis.document.body.append(root)
  return root
}
function harness() {
  const context = ref('first')
  const active = ref(true)
  const busy = ref(false)
  const fields = ref([])
  const key = ref(0)
  let run
  const wrapper = mount({
    setup() {
      const root = ref(null)
      const after = useValidationFocus(root, { context:() => context.value, active:() => active.value, ready:() => !busy.value })
      run = action => after(action, () => fields.value)
      return () => h('form', { ref:root, key:key.value }, [
        h('input', { name:'first', disabled:busy.value }), h('input', { name:'second' }), h('button', { type:'button' }, 'Save')
      ])
    }
  }, { attachTo:globalThis.document.body })
  wrappers.push(wrapper)
  return { wrapper, run, context, active, busy, fields, key }
}

describe('validation focus', () => {
  it('resolves structured fields and canonical types without reading message text', () => {
    expect(validationFields(null)).toEqual([])
    expect(validationFields({ type:'known', errors:{ 'product.price':['x'], empty:[], malformed:'x', 'consent.document':['x'] } }, {
      aliases:{ 'product.price':'price', consent:'checkbox' }, types:{ known:['price', 'file'] }
    })).toEqual(['price', 'checkbox', 'file'])
    expect(validationFields({ detail:'price invalid', errors:{ email:['invalid'] } })).toEqual(['email'])
  })

  it('selects the first problematic control in displayed order and stays within its form', () => {
    const outside = form('<input name="first">')
    const root = form('<input name="first" value="keep"><input name="second"><button>Save</button>')
    expect(focusInvalidField(root, ['second', 'first'])).toBe(true)
    expect(globalThis.document.activeElement).toBe(root.elements.first)
    expect(root.elements.first.value).toBe('keep')
    expect(globalThis.document.activeElement).not.toBe(outside.elements.first)
    expect(focusInvalidField(null, ['first'])).toBe(false)
    expect(focusInvalidField(root, [])).toBe(false)
  })

  it('skips hidden, inert, disabled and read-only controls, including disabled fieldsets', () => {
    const root = form(`<input name="bad" type="hidden"><input name="bad" disabled>
      <fieldset disabled><input name="bad"></fieldset><input name="bad" readonly>
      <div hidden><input name="bad"></div><div inert><input name="bad"></div>
      <div aria-hidden="true"><input name="bad"></div><div aria-disabled="true"><input name="bad"></div>
      <div style="display:none"><input name="bad"></div><div style="visibility:hidden"><input name="bad"></div>
      <div style="visibility:collapse"><input name="bad"></div><textarea name="good"></textarea>`)
    expect(focusInvalidField(root, ['bad', 'good'])).toBe(true)
    expect(globalThis.document.activeElement).toBe(root.elements.good)
    root.remove()
    expect(focusInvalidField(root, ['good'])).toBe(false)
  })

  it('supports checkbox groups, selects, comboboxes and visible upload activators', () => {
    const root = form(`<div data-validation-field="roles"><input type="checkbox" disabled><input type="checkbox"></div>
      <select name="kind"><option>Kind</option></select><input name="choice" readonly role="combobox">
      <div data-validation-field="file"><input type="file" style="display:none"><input type="file" style="opacity:0"><input readonly><button type="button">Upload</button></div>`)
    expect(focusInvalidField(root, ['roles'])).toBe(true)
    expect(globalThis.document.activeElement).toBe(root.querySelectorAll('[type="checkbox"]')[1])
    expect(focusInvalidField(root, ['kind'])).toBe(true)
    expect(globalThis.document.activeElement).toBe(root.elements.kind)
    expect(focusInvalidField(root, ['choice'])).toBe(true)
    expect(globalThis.document.activeElement).toBe(root.elements.choice)
    expect(focusInvalidField(root, ['file'])).toBe(true)
    expect(globalThis.document.activeElement).toBe(root.querySelector('button'))
  })

  it('supports standalone named-by-id controls and default lifecycle options', async () => {
    let run
    const wrapper = mount({
      setup() {
        const root = ref(null)
        const after = useValidationFocus(root)
        run = () => after(() => {}, () => ['field-id'])
        return () => h('form', { ref:root }, h('input', { id:'field-id' }))
      }
    }, { attachTo:globalThis.document.body })
    wrappers.push(wrapper)
    await run()
    expect(globalThis.document.activeElement).toBe(wrapper.get('input').element)
  })

  it('keeps lifecycle generations isolated between mounted forms', async () => {
    const first = harness()
    const second = harness()
    let finish
    const pending = first.run(() => new Promise(resolve => { finish = resolve }))
    first.fields.value = ['first']
    second.context.value = 'another account'
    await second.run(() => { second.fields.value = ['second'] })
    finish()
    await pending
    expect(globalThis.document.activeElement).toBe(first.wrapper.get('[name="first"]').element)
  })

  it('continues past a matching non-focusable element', () => {
    const root = form('<div data-validation-field="field"><div tabindex="bad"></div><input></div>')
    expect(focusInvalidField(root, ['field'])).toBe(true)
    expect(globalThis.document.activeElement).toBe(root.querySelector('input'))
    expect(focusInvalidField(root, ['missing'])).toBe(false)
  })

  it('waits for rendered enabled controls and handles repeated identical failures', async () => {
    const view = harness()
    for (let attempt = 0; attempt < 2; attempt++) {
      view.wrapper.get('button').element.focus()
      await view.run(async () => {
        view.busy.value = true
        await nextTick()
        view.fields.value = ['first']
        view.busy.value = false
      })
      expect(globalThis.document.activeElement).toBe(view.wrapper.get('[name="first"]').element)
    }
  })

  it('does not steal focus during typing, background validation or successful actions', async () => {
    const view = harness()
    const second = view.wrapper.get('[name="second"]').element
    second.focus()
    view.fields.value = ['first']
    await flushPromises()
    expect(globalThis.document.activeElement).toBe(second)
    await view.run(() => { view.fields.value = [] })
    expect(globalThis.document.activeElement).toBe(second)
  })

  it.each(['context', 'closed', 'reopened', 'unmounted', 'replaced', 'newer'])('ignores obsolete actions: %s', async mode => {
    const view = harness()
    let finish
    const request = view.run(() => new Promise(resolve => { finish = resolve }))
    view.fields.value = ['first']
    if (mode === 'context') { view.context.value = 'other'; view.context.value = 'first' }
    if (mode === 'closed') view.active.value = false
    if (mode === 'reopened') { view.active.value = false; view.active.value = true }
    if (mode === 'unmounted') { view.wrapper.unmount(); wrappers.pop() }
    if (mode === 'replaced') view.key.value++
    if (mode === 'newer') await view.run(() => { view.fields.value = [] })
    await nextTick()
    const sentinel = globalThis.document.createElement('button')
    globalThis.document.body.append(sentinel)
    sentinel.focus()
    finish()
    await request
    expect(globalThis.document.activeElement).toBe(sentinel)
  })

  it('does not focus while unready or later steal focus when readiness changes', async () => {
    const view = harness()
    const button = view.wrapper.get('button').element
    button.focus()
    await view.run(() => { view.busy.value = true; view.fields.value = ['second'] })
    expect(globalThis.document.activeElement).toBe(button)
    view.busy.value = false
    await nextTick()
    expect(globalThis.document.activeElement).toBe(button)
  })

  it('allows new actions after reopening without reviving earlier actions', async () => {
    const view = harness()
    let finish
    const obsolete = view.run(() => new Promise(resolve => { finish = resolve }))
    view.active.value = false
    view.active.value = true
    await view.run(() => { view.fields.value = ['second'] })
    expect(globalThis.document.activeElement).toBe(view.wrapper.get('[name="second"]').element)
    view.fields.value = ['first']
    finish()
    await obsolete
    expect(globalThis.document.activeElement).toBe(view.wrapper.get('[name="second"]').element)
  })

  it('preserves rejected action semantics while focusing its validation error', async () => {
    const view = harness()
    const error = new Error('test')
    await expect(view.run(() => { view.fields.value = ['first']; throw error })).rejects.toBe(error)
    expect(globalThis.document.activeElement).toBe(view.wrapper.get('[name="first"]').element)
  })
})
