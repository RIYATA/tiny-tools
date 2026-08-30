import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuotaFromLogText } from './quota-service.mjs'

test('parses underscore quota records from local Codex logs', () => {
  const fixture = 'websocket event: {"type":"codex.rate_limits","rate_limits":{"primary":{"used_percent":23,"window_minutes":300,"reset_after_seconds":5000,"reset_at":1893456000},"secondary":{"used_percent":41,"window_minutes":10080,"reset_after_seconds":90000,"reset_at":1893542400}},"rateLimitResetCredits":{"availableCount":2}}'
  const quota = parseQuotaFromLogText(fixture)

  assert.equal(quota.primary.remainingPercent, 77)
  assert.equal(quota.secondary.remainingPercent, 59)
  assert.equal(quota.resetCredits, 2)
  assert.equal(quota.source, 'local-codex-recording')
})

test('parses camel-case quota records from app-server shaped local events', () => {
  const fixture = '{"primary":{"usedPercent":81,"resetsAt":1893456000},"secondary":{"usedPercent":12,"resetsAt":1893542400}}'
  const quota = parseQuotaFromLogText(fixture)

  assert.equal(quota.primary.remainingPercent, 19)
  assert.equal(quota.secondary.remainingPercent, 88)
})
