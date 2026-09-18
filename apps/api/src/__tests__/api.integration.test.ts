import { createServer } from 'node:http'

import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import { connectDatabase, disconnectDatabase } from '../db/connection.js'
import { createApolloServer } from '../graphql/apollo.js'

/**
 * Integration suite. It needs a real MongoDB, because the point of these tests is that the
 * resolver -> Mongoose -> document round trip actually works.
 *
 * When no database is reachable the suite reports that it was skipped instead of passing quietly.
 */
const testMongodbUri = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pulsechat_test'

const databaseReachable = await connectDatabase(testMongodbUri)
  .then(() => true)
  .catch(() => false)

if (!databaseReachable) {
  console.warn(
    `[api] SKIPPING integration tests: no MongoDB reachable at ${testMongodbUri}. ` +
      'Start MongoDB and re-run `pnpm test`.',
  )
}

const httpServer = createServer()
const apolloServer = createApolloServer(httpServer)
await apolloServer.start()

const app = createApp(apolloServer)

afterAll(async () => {
  await disconnectDatabase()
})

/** supertest types `body` as `any`; this is the shape the GraphQL transport actually returns. */
interface GraphQLBody {
  data?: unknown
  errors?: { message: string; extensions?: { code?: string } }[]
}

function readErrorCode(body: GraphQLBody, index = 0): string | undefined {
  return body.errors?.[index]?.extensions?.code
}

describe.skipIf(!databaseReachable)('GraphQL endpoint', () => {
  it('answers a health query without an identity', async () => {
    const response = await request(app).post('/graphql').send({ query: '{ health }' })
    const body = response.body as GraphQLBody

    expect(response.status).toBe(200)
    expect(body.data).toEqual({ health: 'ok' })
  })

  it('rejects `me` when no identity header was sent', async () => {
    const response = await request(app).post('/graphql').send({ query: '{ me { id } }' })
    const body = response.body as GraphQLBody

    expect(body.errors).toHaveLength(1)
    expect(readErrorCode(body)).toBe('UNAUTHENTICATED')
  })

  it('rejects a malformed conversation id with BAD_USER_INPUT', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('x-user-id', '507f1f77bcf86cd799439011')
      .send({ query: '{ conversation(id: "not-an-object-id") { id } }' })
    const body = response.body as GraphQLBody

    expect(readErrorCode(body)).toBe('BAD_USER_INPUT')
  })
})

describe.skipIf(!databaseReachable)('health endpoint', () => {
  it('reports ok', async () => {
    const response = await request(app).get('/health')
    const body = response.body as { status?: string }

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
  })
})
