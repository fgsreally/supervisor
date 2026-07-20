export interface SessionAvatarValue {
  text: string;
  color: string;
}

export const SESSION_AVATAR_COLORS = ["#07a65a", "#576b95", "#d97706", "#5b6ee1", "#8b6f47"];

export function sessionAvatar(
  id: string,
  name: string,
  value?: Partial<SessionAvatarValue>,
): SessionAvatarValue {
  const index = id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    text: value?.text?.trim().slice(0, 2) || name.trim().charAt(0).toUpperCase() || "A",
    color: value?.color || SESSION_AVATAR_COLORS[index % SESSION_AVATAR_COLORS.length],
  };
}
