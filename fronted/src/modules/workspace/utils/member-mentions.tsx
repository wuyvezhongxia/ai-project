import { Avatar } from 'antd'

import { getAvatarLabel, getAvatarSeed, getAvatarStyle } from './avatar'

export type MemberMentionCandidate = {
  id: string
  name: string
  hint?: string
}

export const buildMemberMentionOptions = (candidates: MemberMentionCandidate[]) =>
  candidates.map((user) => ({
    key: user.id,
    value: user.name,
    label: (
      <div className="comment-mention-option">
        <Avatar size={28} style={getAvatarStyle(getAvatarSeed(user.id, user.name))}>
          {getAvatarLabel(user.name)}
        </Avatar>
        <div className="comment-mention-meta">
          <span className="comment-mention-name">{user.name}</span>
          <span className="comment-mention-hint">{user.hint || '组织成员'}</span>
        </div>
      </div>
    ),
  }))
