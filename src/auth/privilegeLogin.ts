export function isEmailNotConfirmedAuthError(message: string, code?: string): boolean {
  if (code === 'email_not_confirmed') return true
  return /email not confirmed|email address not confirmed/i.test(message.trim())
}
