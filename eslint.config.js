// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import js from '@eslint/js'
export default [{ ignores: ['coverage/**', 'node_modules/**'] }, js.configs.recommended, { rules: { 'no-console': 'error' } }]
