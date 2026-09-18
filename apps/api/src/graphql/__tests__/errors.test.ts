import { GraphQLError } from 'graphql'
import { describe, expect, it } from 'vitest'

import { ERROR_CODES, graphQLError } from '../errors.js'

describe('graphQLError', () => {
  it('returns a GraphQLError with the code in extensions', () => {
    const error = graphQLError(ERROR_CODES.forbidden, 'nope')

    expect(error).toBeInstanceOf(GraphQLError)
    expect(error.extensions.code).toBe('FORBIDDEN')
    expect(error.message).toBe('nope')
  })
})

describe('ERROR_CODES', () => {
  it('only contains SCREAMING_SNAKE codes', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(code).toMatch(/^[A-Z][A-Z_]*$/)
    }
  })

  it('has no duplicate values', () => {
    const codes = Object.values(ERROR_CODES)

    expect(new Set(codes).size).toBe(codes.length)
  })
})
