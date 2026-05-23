// Structured JSON logger. Goes to stdout — Vercel / Supabase Edge runtime both capture it.
// One line per log event so Datadog / Logflare / etc. can parse without ceremony.

type Level = 'debug' | 'info' | 'warn' | 'error'

interface LogFields {
  [key: string]: unknown
}

function emit(level: Level, msg: string, fields?: LogFields) {
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    msg,
    ...fields,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const logger = {
  debug(msg: string, fields?: LogFields) {
    if (process.env.LOG_LEVEL === 'debug') emit('debug', msg, fields)
  },
  info(msg: string, fields?: LogFields) {
    emit('info', msg, fields)
  },
  warn(msg: string, fields?: LogFields) {
    emit('warn', msg, fields)
  },
  error(msg: string, fields?: LogFields) {
    emit('error', msg, fields)
  },
  /** Scoped logger that prepends a fixed set of fields to every line. */
  child(base: LogFields) {
    return {
      debug: (msg: string, f?: LogFields) => logger.debug(msg, { ...base, ...f }),
      info: (msg: string, f?: LogFields) => logger.info(msg, { ...base, ...f }),
      warn: (msg: string, f?: LogFields) => logger.warn(msg, { ...base, ...f }),
      error: (msg: string, f?: LogFields) => logger.error(msg, { ...base, ...f }),
    }
  },
}
