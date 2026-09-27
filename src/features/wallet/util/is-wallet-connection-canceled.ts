export function getErrorCode(error: unknown) {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    return String(error.code)
  }

  return ''
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (error !== null && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }

  return typeof error === 'string' ? error : ''
}

export function isWalletConnectionCanceled(error: unknown) {
  const code = getErrorCode(error)
  const message = getErrorMessage(error)

  return (
    code === 'ERROR_ASSOCIATION_CANCELLED' ||
    code === 'Session not established: Local association cancelled by user' ||
    message.includes('CancellationException') ||
    message.includes('Local association cancelled by user')
  )
}
