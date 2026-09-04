package com.wecode.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.wecode.nativebridge.ShareIntentHandler;
import com.wecode.nativebridge.ShareQueue;
import com.wecode.nativebridge.WecodeNativePlugin;

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
        WecodeNativePlugin.notifyShareReceived();
        intent.setAction(null);
    }
}
