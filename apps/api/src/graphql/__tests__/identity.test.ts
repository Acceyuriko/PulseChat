import { describe, expect, it } from 'vitest'

import { IDENTITY_HEADER, readIdentityHeader, readSocketAuthUserId } from '../identity.js'

describe('readIdentityHeader', () => {
  it('returns a trimmed header value', () => {
    expect(readIdentityHeader({ [IDENTITY_HEADER]: '  user-1  ' })).toBe('user-1')
  })

  it('takes the first value when the header was repeated', () => {
    expect(readIdentityHeader({ [IDENTITY_HEADER]: ['first', 'second'] })).toBe('first')
  })

  it('returns null when the header is absent, blank or not a string', () => {
    expect(readIdentityHeader({})).toBeNull()
    expect(readIdentityHeader({ [IDENTITY_HEADER]: undefined })).toBeNull()
    expect(readIdentityHeader({ [IDENTITY_HEADER]: '' })).toBeNull()
    expect(readIdentityHeader({ [IDENTITY_HEADER]: '   ' })).toBeNull()
  })
})

describe('readSocketAuthUserId', () => {
  it('reads the identity out of the handshake payload', () => {
    expect(readSocketAuthUserId({ userId: '  user-1  ' })).toBe('user-1')
  })

  it('returns null for handshakes without a usable identity', () => {
    expect(readSocketAuthUserId(undefined)).toBeNull()
    expect(readSocketAuthUserId(null)).toBeNull()
    expect(readSocketAuthUserId('user-1')).toBeNull()
    expect(readSocketAuthUserId({ userId: 42 })).toBeNull()
    expect(readSocketAuthUserId({ userId: '   ' })).toBeNull()
    expect(readSocketAuthUserId({ somethingElse: 'user-1' })).toBeNull()
  })
})
