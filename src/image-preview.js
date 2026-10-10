// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

// Consumers own transport, identity, Vue bindings, presentation and Problem Details.
export function createImagePreview({ load, publish, invalidFile, protocolError, urlApi = globalThis.URL, BlobType = globalThis.Blob }) {
  let generation = 0, source = '', selectedFile = null, disposed = false
  function clear() {
    generation++
    if (source) urlApi.revokeObjectURL(source)
    source = ''
    selectedFile = null
    publish({ source:'', error:null })
  }
  function reject(error, file) {
    if (file) invalidFile(file)
    else publish({ source:'', error })
  }
  async function update({ url, file, identity }) {
    clear()
    if (disposed || !identity || (!file && !url)) return
    const current = generation
    selectedFile = file
    try {
      const blob = file ?? await load(url)
      if (current !== generation) return
      if (!(blob instanceof BlobType) || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || !blob.size) throw protocolError()
      source = urlApi.createObjectURL(blob)
      publish({ source, error:null })
    } catch (error) {
      if (current === generation) reject(error, file)
    }
  }
  function failed(expectedSource) {
    if (!source || expectedSource !== source) return
    const file = selectedFile
    clear()
    reject(protocolError(), file)
  }
  function dispose() { disposed = true; clear() }
  return { update, clear, failed, dispose }
}
