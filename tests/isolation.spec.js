// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application
import { describe, expect, it, vi } from 'vitest'
import { createDeduplication } from '../src/observability/deduplication.js'
import { createLogger } from '../src/observability/logger.js'
import { createProblemTools } from '../src/problems.js'
import { createHttpTools } from '../src/http.js'
import { sanitizeAttributes } from '../src/observability/sanitize.js'
import { problemAttributes } from '../src/observability/problem-reporting.js'
import { EVENTS, SEVERITY, isCatalogueEvent } from './support/observability/catalogue.js'
import { problemResponse, response } from './fixtures/http.js'

describe('independent consuming applications',()=>{
  it('preserves RFC URI references without logging them and treats an omitted refresh hook as final failure',async()=>{
    const p=createProblemTools(),logger={log:vi.fn()}
    const http=createHttpTools({...p,...createDeduplication(),logger,failedEvent:EVENTS.apiRequestFailed,routeTemplate:()=>undefined,shouldReportFailure:()=>true,invalidAccessTokenType:'https://sarafan.sw.consulting/problems/invalid-access-token'})
    const parsed=await http.parseProblemResponse(problemResponse(400,'validation-failed',{instance:'/requests/private@example.test',traceId:undefined}))
    expect(parsed.instance).toBe('/requests/private@example.test')
    expect(sanitizeAttributes(EVENTS.apiRequestFailed,problemAttributes(parsed))).not.toHaveProperty('sarafan.problem.instance')
    const fetch=vi.fn().mockResolvedValue(problemResponse(401,'invalid-access-token'))
    vi.stubGlobal('fetch',fetch)
    try {
      for(const refreshSession of [undefined,'invalid']) {
        const client=http.createApiClient({getAccessToken:()=>'',refreshSession})
        await expect(client.request('/staff',{}, {authorize:true})).rejects.toMatchObject({code:'invalid_access_token'})
      }
      expect(fetch).toHaveBeenCalledTimes(2)
      const getAccessToken=vi.fn(()=>{throw new Error('Token store must not run')})
      fetch.mockResolvedValue(response(200,{}))
      await http.createApiClient({getAccessToken}).request('/public')
      expect(getAccessToken).not.toHaveBeenCalled()
      await http.createApiClient({}).request('/private',{}, {authorize:true})
      expect(fetch.mock.calls.at(-1)[1].headers.has('Authorization')).toBe(false)
    } finally {vi.unstubAllGlobals()}
  })
  it('keeps suppression safe with absent or failing diagnostic hooks',()=>{
    for(const options of [{}, {logger:{}}, {logger:{log:vi.fn()}}, {suppressedEvent:EVENTS.operationSuppressed}, {logger:{log:()=>{throw new Error('private')}},suppressedEvent:EVENTS.operationSuppressed}]) {
      const p=createProblemTools(options)
      const problem=p.createInternalProblem('networkUnavailable')
      expect(p.suppressProblem(problem)).toBe(problem)
    }
  })
  it('fails closed for missing identity and invalid logging switches',()=>{
    expect(createLogger().log(EVENTS.applicationError)).toBe(false)
    const sink={emit:vi.fn()}
    const base={serviceName:'sarafan.ui',version:'0.0.1',events:EVENTS,severity:SEVERITY,isCatalogueEvent,enabled:true,sink}
    for(const override of [{serviceName:undefined},{serviceName:''},{version:undefined},{version:' '},{enabled:'true'},{severity:undefined}]) {
      const logger=createLogger({...base,...override})
      if(override.severity===undefined && Object.hasOwn(override,'severity')) expect(logger.log(EVENTS.applicationError)).toBe(true)
      else expect(logger.log(EVENTS.applicationError)).toBe(false)
      logger.flushDropped()
    }
    expect(sink.emit).toHaveBeenCalledTimes(1)
    const incomplete=createLogger({...base,events:undefined,rateLimit:{maximum:1,windowMilliseconds:1000}})
    incomplete.log(EVENTS.applicationError);incomplete.log(EVENTS.applicationError)
    expect(()=>incomplete.flushDropped()).not.toThrow()
  })
  it('isolates handled failures, problem additions, logger identity and rate limits',()=>{
    const a=createDeduplication(),b=createDeduplication(),error=new Error('diagnostic')
    a.markHandled(error);expect(a.isHandled(error)).toBe(true);expect(b.isHandled(error)).toBe(false)
    const first=createProblemTools({additions:{custom:{suffix:'custom',code:'ui_custom',title:'Ошибка',detail:'Повторите'}}})
    const second=createProblemTools();expect(first.createInternalProblem('custom').code).toBe('ui_custom');expect(()=>second.createInternalProblem('custom')).toThrow()
    const records=[]
    for(const serviceName of ['sarafan.ui','sarafan.back.office']) {
      const logger=createLogger({serviceName,version:'test',events:EVENTS,severity:SEVERITY,isCatalogueEvent,enabled:true,sink:{emit:r=>records.push(r)},rateLimit:{maximum:1,windowMilliseconds:1000}})
      logger.log(EVENTS.applicationError);logger.log(EVENTS.applicationError)
    }
    expect(records.map(r=>r.resource['service.name'])).toEqual(['sarafan.ui','sarafan.back.office'])
    expect(records[1].instrumentationScope).toBe('sarafan.back.office.observability')
  })
  it('does not refresh malformed or other-domain unauthorized responses',async()=>{
    const refreshSession=vi.fn(),logger={log:vi.fn()}
    const p=createProblemTools({logger,suppressedEvent:EVENTS.operationSuppressed})
    const http=createHttpTools({...p,...createDeduplication(),logger,failedEvent:EVENTS.apiRequestFailed,routeTemplate:()=>undefined,shouldReportFailure:()=>true,invalidAccessTokenType:'https://sarafan.sw.consulting/problems/invalid-backoffice-access-token'})
    const client=http.createApiClient({getAccessToken:()=>'',refreshSession})
    const fetch=vi.fn().mockResolvedValueOnce(response(401,{})).mockResolvedValueOnce(problemResponse(401,'invalid-access-token'))
    vi.stubGlobal('fetch',fetch)
    try {
      await expect(client.request('/staff',{}, {authorize:true})).rejects.toMatchObject({code:'ui_protocol_error'})
      await expect(client.request('/staff',{}, {authorize:true})).rejects.toMatchObject({code:'invalid_access_token'})
      expect(refreshSession).not.toHaveBeenCalled()
    } finally {vi.unstubAllGlobals()}
  })
})
