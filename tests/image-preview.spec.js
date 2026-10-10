// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { describe, expect, it, vi } from 'vitest'
import { createImagePreview } from '../src/image-preview.js'

function setup(overrides = {}) {
  const publish = vi.fn(), invalidFile = vi.fn(), protocolError = () => new Error('protocol')
  const urlApi = { createObjectURL:vi.fn().mockReturnValue('blob:image'), revokeObjectURL:vi.fn() }
  const load = vi.fn().mockResolvedValue(new globalThis.Blob(['image'], { type:'image/png' }))
  return { publish, invalidFile, urlApi, load, preview:createImagePreview({ load, publish, invalidFile, protocolError, urlApi, ...overrides }) }
}
describe('image preview lifecycle', () => {
  it('loads original blobs, replaces and clears owned URLs', async () => {
    const h = setup()
    await h.preview.update({ url:'/image', identity:'1' })
    expect(h.load).toHaveBeenCalledWith('/image')
    expect(h.publish).toHaveBeenLastCalledWith({ source:'blob:image', error:null })
    await h.preview.update({ file:new globalThis.Blob(['jpeg'], { type:'image/jpeg' }), identity:'1' })
    expect(h.urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:image')
    expect(h.load).toHaveBeenCalledTimes(1)
    h.preview.failed('old')
    expect(h.publish).toHaveBeenLastCalledWith({ source:'blob:image', error:null })
    h.preview.failed('blob:image')
    expect(h.invalidFile).toHaveBeenCalledTimes(1)
    h.preview.failed('')
    h.preview.dispose()
    await h.preview.update({ url:'/image', identity:'1' })
    expect(h.load).toHaveBeenCalledTimes(1)
  })
  it('skips missing identity and missing inputs and defaults to browser APIs', async () => {
    const h = setup()
    await h.preview.update({ url:'/image' })
    await h.preview.update({ identity:'1' })
    expect(h.load).not.toHaveBeenCalled()
    const create = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:default')
    const revoke = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
    const preview = createImagePreview({ load:h.load, publish:h.publish, invalidFile:h.invalidFile, protocolError:() => new Error('protocol') })
    await preview.update({ url:'/image', identity:'1' })
    preview.dispose()
    expect(create).toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith('blob:default')
    create.mockRestore(); revoke.mockRestore()
  })
  it.each([{}, new globalThis.Blob([], { type:'image/png' }), new globalThis.Blob(['svg'], { type:'image/svg+xml' })])('rejects malformed images', async value => {
    const h = setup({ load:async () => value })
    await h.preview.update({ url:'/image', identity:'1' })
    expect(h.publish.mock.lastCall[0].error.message).toBe('protocol')
    await h.preview.update({ file:value, identity:'1' })
    expect(h.invalidFile).toHaveBeenCalledWith(value)
  })
  it('owns current read/decode failures and ignores obsolete reads and errors', async () => {
    const h = setup()
    h.load.mockRejectedValueOnce(new Error('failed'))
    await h.preview.update({ url:'/image', identity:'1' })
    expect(h.publish.mock.lastCall[0].error.message).toBe('failed')
    await h.preview.update({ url:'/image', identity:'1' })
    h.preview.failed('blob:image')
    expect(h.publish.mock.lastCall[0].error.message).toBe('protocol')
    let resolve, reject
    h.load.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const old = h.preview.update({ url:'/old', identity:'1' })
    h.preview.clear()
    resolve(new globalThis.Blob(['webp'], { type:'image/webp' })); await old
    expect(h.publish).toHaveBeenLastCalledWith({ source:'', error:null })
    h.load.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    const failed = h.preview.update({ url:'/old', identity:'1' })
    h.preview.dispose(); reject(new Error('obsolete')); await failed
    expect(h.publish).toHaveBeenLastCalledWith({ source:'', error:null })
  })
})
