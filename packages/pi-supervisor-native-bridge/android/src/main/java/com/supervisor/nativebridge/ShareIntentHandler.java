package com.supervisor.nativebridge;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public final class ShareIntentHandler {
    private ShareIntentHandler() {}

    public static List<ShareQueue.Item> parse(Context context, Intent intent) {
        if (intent == null) return List.of();
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return List.of();
        }

        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        } else {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) uris.addAll(streams);
        }

        List<ShareQueue.Item> items = new ArrayList<>();
        for (Uri uri : uris) {
            ShareQueue.Item item = copyUriToCache(context, uri);
            if (item != null) items.add(item);
        }
        return items;
    }

    private static ShareQueue.Item copyUriToCache(Context context, Uri uri) {
        ContentResolver resolver = context.getContentResolver();
        String mime = resolver.getType(uri);
        if (mime == null || !mime.startsWith("image/")) return null;

        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        if (ext == null || ext.isEmpty()) ext = "jpg";
        String name = "shared-" + System.currentTimeMillis() + "-" + itemsHash(uri) + "." + ext;

        File dir = new File(context.getCacheDir(), "share");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File out = new File(dir, name);

        try (InputStream in = resolver.openInputStream(uri);
             FileOutputStream fos = new FileOutputStream(out)) {
            if (in == null) return null;
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                fos.write(buf, 0, n);
            }
        } catch (Exception ignored) {
            if (out.exists()) out.delete();
            return null;
        }

        return new ShareQueue.Item(out.getAbsolutePath(), mime, name);
    }

    private static int itemsHash(Uri uri) {
        return uri != null ? uri.hashCode() & 0xffff : 0;
    }
}
