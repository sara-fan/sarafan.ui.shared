// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createDeduplication } from '../../../src/observability/deduplication.js'
export const { markHandled, isHandled, resetHandledForTests } = createDeduplication()
