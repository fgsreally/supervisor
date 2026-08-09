package com.supervisor.nativebridge;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SupervisorNative")
public class SupervisorNativePlugin extends Plugin {

    @PluginMethod
    public void getPushToken(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("token", null);
        ret.put("platform", "android");
        call.resolve(ret);
    }

    @PluginMethod
    public void startBackgroundConnection(PluginCall call) {
        String title = call.getString("title", "Supervisor");
        String body = call.getString("body", "连接中");
        Intent intent = new Intent(getContext(), SupervisorForegroundService.class);
        intent.setAction(SupervisorForegroundService.ACTION_START);
        intent.putExtra(SupervisorForegroundService.EXTRA_TITLE, title);
        intent.putExtra(SupervisorForegroundService.EXTRA_BODY, body);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopBackgroundConnection(PluginCall call) {
        Intent intent = new Intent(getContext(), SupervisorForegroundService.class);
        intent.setAction(SupervisorForegroundService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateBackgroundConnection(PluginCall call) {
        String title = call.getString("title", "Supervisor");
        String body = call.getString("body", "连接中");
        SupervisorForegroundService.updateNotification(getContext(), title, body);
        call.resolve();
    }

    @PluginMethod
    public void startLiveStatus(PluginCall call) {
        applyLiveStatus(call);
        call.resolve();
    }

    @PluginMethod
    public void updateLiveStatus(PluginCall call) {
        applyLiveStatus(call);
        call.resolve();
    }

    @PluginMethod
    public void endLiveStatus(PluginCall call) {
        AndroidLiveUpdateManager.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void isAndroidLiveUpdatesAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        boolean apiReady = AndroidLiveUpdateManager.isApiSupported();
        boolean promoted = AndroidLiveUpdateManager.canPostPromoted(getContext());
        ret.put("available", apiReady);
        ret.put("promoted", promoted);
        if (!apiReady) {
            ret.put("reason", "requires_android_16_api_36");
        } else if (!promoted) {
            ret.put("reason", "live_updates_disabled_in_settings");
        }
        call.resolve(ret);
    }

    /** @deprecated Use {@link #isAndroidLiveUpdatesAvailable(PluginCall)} */
    @PluginMethod
    public void isOppoLiveUpdatesAvailable(PluginCall call) {
        isAndroidLiveUpdatesAvailable(call);
    }

    private void applyLiveStatus(PluginCall call) {
        String title = call.getString("title", "Supervisor");
        String subtitle = call.getString("subtitle", "");
        String phase = call.getString("phase", "thinking");
        AndroidLiveUpdateManager.show(getContext(), title, subtitle, phase);
    }
}
