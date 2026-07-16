const AGENT_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-violet-500",
  "bg-amber-600",
];
const PROVIDER_COLORS = [
  "bg-sky-600",
  "bg-emerald-600",
  "bg-orange-500",
  "bg-rose-500",
  "bg-violet-600",
];

function pickColor(id: string, palette: string[]): string {
  const idx = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}

export function agentAvatarClass(agentId: string): string {
  return pickColor(agentId, AGENT_COLORS);
}

export function providerAvatarClass(providerId: string): string {
  return pickColor(providerId, PROVIDER_COLORS);
}
