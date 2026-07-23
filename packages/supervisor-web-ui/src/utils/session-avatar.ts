export interface SessionAvatarValue {
  text: string;
  color: string;
  /** Image URL, Iconify id, or `/public/...` path — usually copied from agent.icon. */
  icon?: string | null;
}

export const SESSION_AVATAR_COLORS = ["#07a65a", "#576b95", "#d97706", "#5b6ee1", "#8b6f47"];

export function sessionAvatar(
  id: string,
  name: string,
  value?: Partial<SessionAvatarValue>,
  agentIcon?: string | null,
): SessionAvatarValue {
  const index = id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const icon = value?.icon?.trim() || agentIcon?.trim() || null;
  return {
    text: value?.text?.trim().slice(0, 2) || name.trim().charAt(0).toUpperCase() || "A",
    color: value?.color || SESSION_AVATAR_COLORS[index % SESSION_AVATAR_COLORS.length],
    icon,
  };
}
