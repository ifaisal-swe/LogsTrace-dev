type TokenType = 'verify_email' | 'reset_password' | 'login_2fa'

// login_2fa: time between the password step and the authenticator code
const TTL_MINUTES: Record<TokenType, number> = { verify_email: 60 * 24, reset_password: 30, login_2fa: 5 }

export async function issueAuthToken(userId: string, type: TokenType) {
  const db = useDb()
  // Only the newest link of each type works
  await db.update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.userId, userId), eq(schema.authTokens.type, type), isNull(schema.authTokens.usedAt)))
  const token = randomToken(32)
  await db.insert(schema.authTokens).values({
    userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MINUTES[type] * 60_000)
  })
  return token
}

// Marks the token used atomically, so a link can't be redeemed twice in parallel
export async function consumeAuthToken(token: string, type: TokenType) {
  const [row] = await useDb().update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(
      eq(schema.authTokens.tokenHash, sha256(token)),
      eq(schema.authTokens.type, type),
      isNull(schema.authTokens.usedAt),
      gt(schema.authTokens.expiresAt, new Date())
    ))
    .returning({ userId: schema.authTokens.userId })
  return row?.userId ?? null
}
