declare module "cloudflared" {
  export const bin: string;
  export function install(to?: string): Promise<string>;
}
