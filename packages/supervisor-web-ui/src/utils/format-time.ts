export function formatListTime(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return formatMessageClock(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return date.toLocaleDateString([], { month: "2-digit", day: "2-digit" });
}

/** Clock next to a chat bubble: hour:minute only. */
export function formatMessageClock(date: Date | number | string): string {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** WeChat-style day separator above message groups. */
export function formatChatDateDivider(date: Date | number | string, now = new Date()): string {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const day = startOfDay(value);
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;

  if (day === today) return "今天";
  if (day === yesterday) return "昨天";

  const month = value.getMonth() + 1;
  const dateNum = value.getDate();
  if (value.getFullYear() === now.getFullYear()) {
    return `${month}月${dateNum}日`;
  }
  return `${value.getFullYear()}年${month}月${dateNum}日`;
}

export function sameCalendarDay(a: Date | number | string, b: Date | number | string): boolean {
  const left = a instanceof Date ? a : new Date(a);
  const right = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** LLM turn duration shown on assistant message hover. */
export function formatMessageDuration(ms: number): string {
  const duration = Math.max(0, Math.round(ms));
  if (duration < 1_000) return "<1秒";
  if (duration < 60_000) return `${Math.floor(duration / 1_000)}秒`;
  const minutes = Math.floor(duration / 60_000);
  const seconds = Math.floor((duration % 60_000) / 1_000);
  return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分`;
}
