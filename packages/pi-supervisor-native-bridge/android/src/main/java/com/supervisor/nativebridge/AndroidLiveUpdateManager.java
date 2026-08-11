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
    private static final int SEGMENT_UNIT = 100;

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

    static void show(
        Context context,
        String title,
        String subtitle,
        String phase,
        String chip,
        Integer activeCount,
        Integer completedCount,
        Integer totalCount,
        Boolean allComplete
    ) {
        ensureChannel(context);
        boolean complete = Boolean.TRUE.equals(allComplete)
            || (activeCount != null && activeCount == 0 && totalCount != null && totalCount > 0);
        // Keep ongoing even when complete so OEM fluid-cloud / Live Update chip stays visible.
        NotificationManagerCompat.from(context).notify(
            NOTIFICATION_ID,
            buildNotification(
                context,
                title,
                subtitle,
                phase,
                chip,
                activeCount,
                completedCount,
                totalCount,
                complete,
                true
            )
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
        String chip,
        Integer activeCount,
        Integer completedCount,
        Integer totalCount,
        boolean allComplete,
        boolean ongoing
    ) {
        String resolvedChip = resolveChip(chip, activeCount, totalCount, phase, allComplete);
        String safeTitle = title == null || title.isEmpty() ? "Supervisor" : title;
        String safeSubtitle = subtitle == null || subtitle.isEmpty()
            ? defaultSubtitle(activeCount, completedCount, totalCount, allComplete, phase)
            : subtitle;

        NotificationCompat.ProgressStyle style = buildProgressStyle(
            activeCount,
            completedCount,
            totalCount,
            phase,
            allComplete
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(safeTitle)
            .setContentText(safeSubtitle)
            .setSubText("Supervisor")
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setOngoing(ongoing)
            .setOnlyAlertOnce(true)
            .setStyle(style)
            .setContentIntent(launchPendingIntent(context));

        if (isApiSupported()) {
            builder.setRequestPromotedOngoing(true);
            if (!resolvedChip.isEmpty()) {
                builder.setShortCriticalText(resolvedChip);
            }
        }

        if (allComplete) {
            builder.setCategory(NotificationCompat.CATEGORY_STATUS);
        } else {
            builder.setCategory(NotificationCompat.CATEGORY_PROGRESS);
        }

        return builder.build();
    }

    private static NotificationCompat.ProgressStyle buildProgressStyle(
        Integer activeCount,
        Integer completedCount,
        Integer totalCount,
        String phase,
        boolean allComplete
    ) {
        NotificationCompat.ProgressStyle style = new NotificationCompat.ProgressStyle();

        if (totalCount != null && totalCount > 0) {
            int total = Math.max(totalCount, 1);
            int completed = completedCount != null
                ? Math.max(0, Math.min(completedCount, total))
                : Math.max(0, total - (activeCount == null ? 0 : activeCount));
            int active = activeCount == null ? Math.max(total - completed, 0) : Math.max(activeCount, 0);

            for (int i = 0; i < total; i++) {
                style.addProgressSegment(new NotificationCompat.ProgressStyle.Segment(SEGMENT_UNIT));
            }

            boolean allRunning = active >= total && !allComplete;
            style.setProgressIndeterminate(allRunning);
            if (allComplete) {
                style.setProgress(total * SEGMENT_UNIT);
            } else {
                style.setProgress(completed * SEGMENT_UNIT);
            }
            return style;
        }

        int progress = progressForPhase(phase);
        style.setProgressIndeterminate(progress <= 0 || !"idle".equals(phase))
            .setProgress("idle".equals(phase) ? 100 : Math.max(progress, 0))
            .addProgressSegment(new NotificationCompat.ProgressStyle.Segment(100));
        return style;
    }

    private static String defaultSubtitle(
        Integer activeCount,
        Integer completedCount,
        Integer totalCount,
        boolean allComplete,
        String phase
    ) {
        if (totalCount != null && totalCount > 0) {
            int active = activeCount == null ? 0 : activeCount;
            int completed = completedCount == null
                ? Math.max(totalCount - active, 0)
                : completedCount;
            if (allComplete) {
                return "进行中 0 · 已完成 " + completed + " · 共 " + totalCount + " 个会话";
            }
            return "进行中 " + active + " · 已完成 " + completed + " · 共 " + totalCount + " 个";
        }
        return chipTextForPhase(phase);
    }

    private static String resolveChip(
        String chip,
        Integer activeCount,
        Integer totalCount,
        String phase,
        boolean allComplete
    ) {
        if (chip != null && !chip.isEmpty()) {
            return chip;
        }
        if (allComplete) {
            return "完成";
        }
        if (activeCount != null && totalCount != null && totalCount > 0) {
            String ratio = activeCount + "/" + totalCount;
            return ratio.length() <= 7 ? ratio : activeCount + "进行";
        }
        return chipTextForPhase(phase);
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
                return "完成";
            default:
                return "进行中";
        }
    }
}
