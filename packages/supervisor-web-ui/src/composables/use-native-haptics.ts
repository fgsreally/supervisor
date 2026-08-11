import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNativeApp } from "@/composables/use-native-app";

/** Light tap — selection / toggle. */
export async function hapticImpact(style: ImpactStyle = ImpactStyle.Medium): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Haptics.impact({ style });
  } catch {
    // Web / unsupported devices: ignore
  }
}

/** Notification-style pulse — delete / warning confirm. */
export async function hapticNotification(
  type: NotificationType = NotificationType.Warning,
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Haptics.notification({ type });
  } catch {
    // Web / unsupported devices: ignore
  }
}

/** Delete confirm / destructive action feedback. */
export async function hapticDelete(): Promise<void> {
  await hapticNotification(NotificationType.Warning);
}
