import 'dotenv/config'

function readString(name: string, fallback: string): string {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? fallback : value
}

function readPort(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Environment variable ${name} must be a valid port, received "${raw}"`)
  }

  return parsed
}

export const env = {
  nodeEnv: readString('NODE_ENV', 'development'),
  port: readPort('PORT', 4000),
  mongodbUri: readString('MONGODB_URI', 'mongodb://127.0.0.1:27017/pulsechat'),
  corsOrigin: readString('CORS_ORIGIN', 'http://localhost:4173'),
} as const

export const isProduction = env.nodeEnv === 'production'
