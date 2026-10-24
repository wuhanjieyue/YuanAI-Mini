function buildEphemeralMessages(chats, maxTurns = 10) {
  const chronological = (Array.isArray(chats) ? chats : [])
    .slice()
    .reverse()
    .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.trim())
    .map((item) => ({ role: item.role, content: item.content }))
  const complete = []
  for (let index = 0; index + 1 < chronological.length; index += 2) {
    const user = chronological[index]
    const assistant = chronological[index + 1]
    if (user.role !== 'user' || assistant.role !== 'assistant') break
    complete.push(user, assistant)
  }
  return complete.slice(-Math.max(0, maxTurns) * 2)
}

module.exports = { buildEphemeralMessages }
