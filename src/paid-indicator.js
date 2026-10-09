// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

export function createPaidIndicator({ h }) {
  return {
    name:'PaidIndicator',
    props:{ paid:Boolean, label:{ type:String, default:'Оплачено' } },
    setup(props) {
      return () => props.paid ? h('span', {
        class:'paid-indicator', role:'img', 'aria-label':props.label, title:props.label,
        style:{ display:'inline-flex', verticalAlign:'middle', marginInlineStart:'0.35em', color:'#207762' }
      }, [h('svg', { viewBox:'0 0 24 24', width:18, height:18, fill:'none', stroke:'currentColor',
        'stroke-width':3, 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true' },
      [h('path', { d:'M5 12l4 4L19 6' })])]) : null
    }
  }
}
