package com.supervisor.nativebridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

public class SupervisorForegroundService extends Service {
    public static final String CHANNEL_ID = "supervisor_connection";
    public static final int NOTIFICATION_ID = 1001;
    public static final String ACTION_START = "com.supervisor.nativebridge.START";
    public static final String ACTION_STOP = "com.supervisor.nativebridge.STOP";
    public static final String ACTION_UPDATE = "com.supervisor.nativebridge.UPDATE";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        String title = intent.getStringExtra(EXTRA_TITLE);
        if (title == null || title.isEmpty()) {
            title = "Supervisor";
        }
        String body = intent.getStringExtra(EXTRA_BODY);
        if (body == null || body.isEmpty()) {
            body = "连接中";
        }
        Notification notification = buildNotification(this, title, body);
        startForeground(NOTIFICATION_ID, notification);
        return START_STICKY;
    }

    static Notification buildNotification(Context context, String title, String body) {
        ensureChannel(context);
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .build();
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
            "Supervisor 连接",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("后台保持与 Supervisor 服务器的连接");
        manager.createNotificationChannel(channel);
    }

    static void updateNotification(Context context, String title, String body) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        manager.notify(NOTIFICATION_ID, buildNotification(context, title, body));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
