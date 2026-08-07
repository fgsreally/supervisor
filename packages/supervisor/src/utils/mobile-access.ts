/**
 * Terminal banner + ASCII QR for mobile remote access.
 * Prefer {@link printStartupBanner} from startup-banner.ts for full serve output.
 * PIN is never encoded in the QR URL.
 */
import { printStartupBanner, type StartupBannerOptions } from "./startup-banner.js";

export type MobileAccessBannerOptions = StartupBannerOptions;

/** @deprecated Prefer printStartupBanner — kept for call-site compatibility. */
export function printMobileAccessBanner(options: MobileAccessBannerOptions): void {
  printStartupBanner(options);
}
