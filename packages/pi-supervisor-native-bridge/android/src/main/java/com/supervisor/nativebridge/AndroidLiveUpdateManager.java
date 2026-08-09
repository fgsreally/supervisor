package com.supervisor.nativebridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Android 16+ Live Updates (AOSP promoted ongoing + ProgressStyle).
 * ColorOS 16 and other OEM skins may render this as their fluid-cloud equivalent.
 */
final class AndroidLiveUpdateManager {

    static final String CHANNEL_ID = "supervisor_live_status";
    static final int NOTIFICATION_ID = 1002;

    private AndroidLiveUpdateManager() {}

    static boolean isApiSupported() {
        return Build.VERSION.SDK_INT >= 36;
    }

    static boolean canPostPromoted(Context context) {
        if (!isApiSupported()) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= 36) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                return manager.canPostPromotedNotifications();
            }
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Supervisor 任务",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Agent 运行中的实时进度");
        manager.createNotificationChannel(channel);
    }

    static void show(Context context, String title, String subtitle, String phase) {
        ensureChannel(context);
        NotificationManagerCompat.from(context).notify(
            NOTIFICATION_ID,
            buildNotification(context, title, subtitle, phase, true)
        );
    }

    static void cancel(Context context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    }

    static Notification buildNotification(
        Context context,
        String title,
        String subtitle,
        String phase,
        boolean ongoing
    ) {
        int progress = progressForPhase(phase);
        String chip = chipTextForPhase(phase);
        String safeTitle = title == null || title.isEmpty() ? "Supervisor" : title;
        String safeSubtitle = subtitle == null ? "" : subtitle;

        NotificationCompat.ProgressStyle style = new NotificationCompat.ProgressStyle()
            .setProgress(100, progress, progress <= 0);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(safeTitle)
            .setContentText(safeSubtitle)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setOngoing(ongoing)
            .setOnlyAlertOnce(true)
            .setStyle(style)
            .setContentIntent(launchPendingIntent(context));

        if (isApiSupported()) {
            builder.setRequestPromotedOngoing(true);
            if (!chip.isEmpty()) {
                builder.setShortCriticalText(chip);
            }
        }

        return builder.build();
    }

    private static PendingIntent launchPendingIntent(Context context) {
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent();
        }
        return PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int progressForPhase(String phase) {
        if (phase == null) {
            return 30;
        }
        switch (phase) {
            case "connecting":
                return 10;
            case "thinking":
                return 30;
            case "waiting":
                return 50;
            case "tool":
                return 70;
            case "idle":
                return 100;
            default:
                return 30;
        }
    }

    /** Status bar chip text — keep within ~7 characters. */
    private static String chipTextForPhase(String phase) {
        if (phase == null) {
            return "思考中";
        }
        switch (phase) {
            case "connecting":
                return "连接中";
            case "thinking":
                return "思考中";
            case "waiting":
                return "等待中";
            case "tool":
                return "执行中";
            case "idle":
                return "已完成";
            default:
                return "进行中";
        }
    }
}
