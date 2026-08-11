package com.supervisor.nativebridge;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.ArrayList;
import java.util.List;

/** Static queue for share payloads received before the Capacitor bridge is ready. */
public final class ShareQueue {
    public static final class Item {
        public final String uri;
        public final String mimeType;
        public final String name;

        public Item(String uri, String mimeType, String name) {
            this.uri = uri;
            this.mimeType = mimeType;
            this.name = name;
        }
    }

    private static final List<Item> pending = new ArrayList<>();

    private ShareQueue() {}

    public static synchronized void enqueue(List<Item> items) {
        if (items == null || items.isEmpty()) return;
        pending.addAll(items);
    }

    public static synchronized JSObject toJSObject() {
        if (pending.isEmpty()) return null;
        JSObject ret = new JSObject();
        JSArray arr = new JSArray();
        for (Item item : pending) {
            JSObject o = new JSObject();
            o.put("uri", item.uri);
            o.put("mimeType", item.mimeType);
            o.put("name", item.name);
            arr.put(o);
        }
        ret.put("items", arr);
        return ret;
    }

    public static synchronized void clear() {
        pending.clear();
    }
}
