// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { createPaidIndicator } from '../src/paid-indicator.js'

it('shares the accessible green check and follows paid state changes', async () => {
  const PaidIndicator = createPaidIndicator({ h })
  const wrapper = mount(PaidIndicator)
  expect(wrapper.find('.paid-indicator').exists()).toBe(false)
  await wrapper.setProps({ paid:true })
  expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Оплачено')
  expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  expect(wrapper.get('.paid-indicator').element.style.color).toBe('rgb(32, 119, 98)')
  await wrapper.setProps({ label:'Таможенная пошлина оплачена' })
  expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Таможенная пошлина оплачена')
  expect(wrapper.get('[role="img"]').attributes('title')).toBe('Таможенная пошлина оплачена')
  await wrapper.setProps({ paid:false })
  expect(wrapper.find('.paid-indicator').exists()).toBe(false)
  wrapper.unmount()
})

it('injects a fixed paid tooltip, forwards its activator and uses font-relative sizing', async () => {
  const Tooltip = defineComponent({
    props:['text', 'location'],
    setup(props, { slots }) {
      return () => h('div', { 'data-tooltip':props.text, 'data-location':props.location },
        slots.activator({ props:{ 'aria-describedby':'paid-tooltip', onFocus:() => focused++ } }))
    }
  })
  let focused = 0
  const wrapper = mount(createPaidIndicator({ h, Tooltip }), { props:{ paid:true, label:'Доставка по России оплачена' } })
  expect(wrapper.attributes('data-tooltip')).toBe('Оплачено')
  expect(wrapper.attributes('data-location')).toBe('top')
  const mark = wrapper.get('.paid-indicator')
  expect(mark.attributes('aria-label')).toBe('Доставка по России оплачена')
  expect(mark.attributes('title')).toBeUndefined()
  expect(mark.attributes('aria-describedby')).toBe('paid-tooltip')
  expect(mark.attributes('tabindex')).toBe('0')
  expect(wrapper.get('svg').attributes()).toMatchObject({ width:'1em', height:'1em' })
  await mark.trigger('focus')
  expect(focused).toBe(1)
  await wrapper.setProps({ label:'Основной платёж подтверждён' })
  expect(wrapper.attributes('data-tooltip')).toBe('Оплачено')
  expect(mark.attributes('aria-label')).toBe('Основной платёж подтверждён')
  await wrapper.setProps({ paid:false })
  expect(wrapper.find('.paid-indicator').exists()).toBe(false)
  wrapper.unmount()
})
