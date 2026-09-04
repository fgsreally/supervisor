package com.wecode.nativebridge;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
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
        if (action == null) return List.of();
        if (!Intent.ACTION_SEND.equals(action)
            && !Intent.ACTION_SEND_MULTIPLE.equals(action)
            && !Intent.ACTION_VIEW.equals(action)
            && !Intent.ACTION_EDIT.equals(action)) {
            return List.of();
        }

        List<Uri> uris = new ArrayList<>();
        collectUris(intent, action, uris);
        if (uris.isEmpty()) return List.of();

        List<ShareQueue.Item> items = new ArrayList<>();
        for (Uri uri : uris) {
            ShareQueue.Item item = copyUriToCache(context, uri);
            if (item != null) items.add(item);
        }
        return items;
    }

    private static void collectUris(Intent intent, String action, List<Uri> uris) {
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_EDIT.equals(action)) {
            addUri(uris, intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            addStreamExtras(intent, uris);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            addStreamExtras(intent, uris);
        }
        ClipData clip = intent.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                addUri(uris, clip.getItemAt(i).getUri());
            }
        }
        addUri(uris, intent.getData());
    }

    private static void addStreamExtras(Intent intent, List<Uri> uris) {
        try {
            addUri(uris, intent.getParcelableExtra(Intent.EXTRA_STREAM));
        } catch (Exception ignored) {
            // Honor/OPPO may pack EXTRA_STREAM as a list
        }
        try {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) {
                for (Uri uri : streams) addUri(uris, uri);
            }
        } catch (Exception ignored) {
            // single Uri extra
        }
    }

    private static void addUri(List<Uri> uris, Uri uri) {
        if (uri != null && !uris.contains(uri)) uris.add(uri);
    }

    private static ShareQueue.Item copyUriToCache(Context context, Uri uri) {
        if (uri == null) return null;
        ContentResolver resolver = context.getContentResolver();
        String mime = resolver.getType(uri);
        if (mime == null || mime.isEmpty() || "*/*".equals(mime)) {
            mime = guessMime(uri);
        }

        String displayName = queryDisplayName(resolver, uri);
        if (displayName == null || displayName.isEmpty()) {
            String ext = extensionFor(mime, uri);
            displayName = "shared-" + System.currentTimeMillis() + (ext.isEmpty() ? "" : "." + ext);
        }
        String safeName = displayName.replace('\\', '_').replace('/', '_');

        File dir = new File(context.getCacheDir(), "share");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File out = new File(dir, System.currentTimeMillis() + "-" + itemsHash(uri) + "-" + safeName);

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

        return new ShareQueue.Item(out.getAbsolutePath(), mime, safeName);
    }

    private static String queryDisplayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {
            // content providers may omit DISPLAY_NAME
        }
        String last = uri.getLastPathSegment();
        return last == null || last.isEmpty() ? null : last;
    }

    private static String guessMime(Uri uri) {
        String ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        if (ext == null || ext.isEmpty()) {
            String last = uri.getLastPathSegment();
            if (last != null) {
                int dot = last.lastIndexOf('.');
                if (dot >= 0 && dot < last.length() - 1) ext = last.substring(dot + 1);
            }
        }
        if (ext == null || ext.isEmpty()) return "application/octet-stream";
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
        return mime != null ? mime : "application/octet-stream";
    }

    private static String extensionFor(String mime, Uri uri) {
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        if (ext != null && !ext.isEmpty()) return ext;
        String last = uri.getLastPathSegment();
        if (last != null) {
            int dot = last.lastIndexOf('.');
            if (dot >= 0 && dot < last.length() - 1) return last.substring(dot + 1);
        }
        return "";
    }

    private static int itemsHash(Uri uri) {
        return uri != null ? uri.hashCode() & 0xffff : 0;
    }
}
