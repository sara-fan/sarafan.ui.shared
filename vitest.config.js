// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text', 'lcov'],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 }
    }
  }
})
