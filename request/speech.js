import { startHttpBinary } from './http'
import { store } from '../store/index'
import { DEFAULT_VOICE_ID, VOICE_META_MAP } from '../static_utils/voiceOptions'

export function synthesizeSpeech({ conversationId, messageId }) {
  const selected = store.chatAbout?.chatVoice
  const voiceId = VOICE_META_MAP[selected] ? selected : DEFAULT_VOICE_ID
  return startHttpBinary('/speech', { conversationId, messageId, voiceId })
}
