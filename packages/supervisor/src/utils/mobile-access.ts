/**
 * Terminal banner + ASCII QR for mobile remote access.
 * PIN is never encoded in the QR URL — printed on a separate line.
 */
import qrcodeTerminal from "qrcode-terminal";
import { getLanIPv4 } from "./cloudflare-tunnel.js";

export interface MobileAccessBannerOptions {
  port: number;
  pin: string;
  pinGenerated: boolean;
  tunnelUrl?: string | null;
}

function printQr(url: string): void {
  qrcodeTerminal.generate(url, { small: true }, (code: string) => {
    for (const line of code.split("\n")) {
      if (line.length) console.log(`  ${line}`);
    }
  });
}

export function printMobileAccessBanner(options: MobileAccessBannerOptions): void {
  const { port, pin, pinGenerated, tunnelUrl } = options;
  const lanIp = getLanIPv4();

  console.log("");
  console.log(pinGenerated ? `Web PIN: ${pin}` : "Web PIN: (configured)");
  console.log("");

  if (tunnelUrl) {
    console.log("手机远程访问（扫码）:");
    console.log(`  ${tunnelUrl}`);
    printQr(tunnelUrl);
    console.log("");
    console.log("PIN 请在手机上手动输入。");
    console.log("Restart 后 URL 会变，请重新扫码。");
    console.log("");
  }

  if (lanIp) {
    const lanUrl = `http://${lanIp}:${port}`;
    console.log(tunnelUrl ? "LAN（同 WiFi，可选）:" : "手机访问（同 WiFi 扫码）:");
    console.log(`  ${lanUrl}`);
    printQr(lanUrl);
    console.log("");
    if (!tunnelUrl) {
      console.log("PIN 请在手机上手动输入。");
      console.log("");
    }
  }
}
