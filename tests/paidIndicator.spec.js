// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { h } from 'vue'
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
