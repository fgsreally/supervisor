package com.supervisor.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.supervisor.nativebridge.ShareIntentHandler;
import com.supervisor.nativebridge.ShareQueue;
import com.supervisor.nativebridge.SupervisorNativePlugin;

import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        List<ShareQueue.Item> items = ShareIntentHandler.parse(this, intent);
        if (items.isEmpty()) return;
        ShareQueue.enqueue(items);
        SupervisorNativePlugin.notifyShareReceived();
        intent.setAction(null);
    }
}
