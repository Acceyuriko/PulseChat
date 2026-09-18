import { GraphQLError } from 'graphql'

/**
 * Error codes use the SCREAMING_SNAKE convention, surfaced to the client as
 * `errors[].extensions.code` — the same shape Apollo Server produces for its own error codes.
 *
 * The frontend is expected to branch on `code`, never on the human-readable message.
 */
export const ERROR_CODES = {
  unauthenticated: 'UNAUTHENTICATED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  badUserInput: 'BAD_USER_INPUT',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export function graphQLError(code: ErrorCode, message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code } })
}
