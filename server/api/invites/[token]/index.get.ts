export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, `invite-view:ip:${clientIp(event)}`, 60, 3600)
  const invite = await findOpenInvite(getRouterParam(event, 'token') ?? '')
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'This invitation has expired or was already used.' })
  return { orgName: invite.orgName, role: invite.role, email: invite.email }
})
