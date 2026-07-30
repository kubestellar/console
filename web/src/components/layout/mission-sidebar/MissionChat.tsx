import { MissionChat as MissionChatContent } from './mission-chat/MissionChatContent'

type MissionChatProps = Parameters<typeof MissionChatContent>[0]

export function MissionChat(props: MissionChatProps) {
  return <MissionChatContent {...props} />
}
