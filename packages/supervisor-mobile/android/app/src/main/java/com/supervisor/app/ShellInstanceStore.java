package com.supervisor.app;

import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Persisted supervisor instances for the Android shell (multi-server). */
final class ShellInstanceStore {
    static final String PREFS = "supervisor_shell";
    static final String KEY_INSTANCES = "instances_json";
    /** Legacy single URL from older shell builds. */
    static final String KEY_SERVER_URL = "server_url";

    static final class Instance {
        final String id;
        final String url;
        final String name;
        final long lastUsedAt;

        Instance(String id, String url, String name, long lastUsedAt) {
            this.id = id;
            this.url = url;
            this.name = name;
            this.lastUsedAt = lastUsedAt;
        }

        Instance withLastUsed(long at) {
            return new Instance(id, url, name, at);
        }
    }

    private ShellInstanceStore() {}

    @NonNull
    static List<Instance> load(android.content.SharedPreferences prefs) {
        migrateLegacy(prefs);
        String raw = prefs.getString(KEY_INSTANCES, null);
        if (raw == null || raw.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            JSONArray arr = new JSONArray(raw);
            List<Instance> out = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String id = obj.optString("id", "");
                String url = obj.optString("url", "");
                if (id.isEmpty() || url.isEmpty()) continue;
                String name = obj.optString("name", displayNameForUrl(url));
                long lastUsedAt = obj.optLong("lastUsedAt", 0L);
                out.add(new Instance(id, url, name, lastUsedAt));
            }
            Collections.sort(
                out,
                new Comparator<Instance>() {
                    @Override
                    public int compare(Instance a, Instance b) {
                        return Long.compare(b.lastUsedAt, a.lastUsedAt);
                    }
                }
            );
            return out;
        } catch (JSONException e) {
            return new ArrayList<>();
        }
    }

    static void save(android.content.SharedPreferences prefs, List<Instance> instances) {
        JSONArray arr = new JSONArray();
        for (Instance item : instances) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("id", item.id);
                obj.put("url", item.url);
                obj.put("name", item.name);
                obj.put("lastUsedAt", item.lastUsedAt);
                arr.put(obj);
            } catch (JSONException ignored) {
                // skip malformed
            }
        }
        prefs.edit().putString(KEY_INSTANCES, arr.toString()).remove(KEY_SERVER_URL).apply();
    }

    @NonNull
    static Instance upsertByUrl(
        android.content.SharedPreferences prefs,
        @NonNull String url
    ) {
        List<Instance> list = load(prefs);
        long now = System.currentTimeMillis();
        for (int i = 0; i < list.size(); i++) {
            Instance existing = list.get(i);
            if (normalizeUrl(existing.url).equals(normalizeUrl(url))) {
                Instance updated = existing.withLastUsed(now);
                list.set(i, updated);
                save(prefs, list);
                return updated;
            }
        }
        Instance created =
            new Instance(UUID.randomUUID().toString(), url, displayNameForUrl(url), now);
        list.add(0, created);
        save(prefs, list);
        return created;
    }

    static void touch(android.content.SharedPreferences prefs, @NonNull String id) {
        List<Instance> list = load(prefs);
        long now = System.currentTimeMillis();
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).id.equals(id)) {
                list.set(i, list.get(i).withLastUsed(now));
                save(prefs, list);
                return;
            }
        }
    }

    static void remove(android.content.SharedPreferences prefs, @NonNull String id) {
        List<Instance> list = load(prefs);
        List<Instance> next = new ArrayList<>();
        for (Instance item : list) {
            if (!item.id.equals(id)) next.add(item);
        }
        save(prefs, next);
    }

    @NonNull
    static String displayNameForUrl(@NonNull String url) {
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost();
            if (host == null || host.isEmpty()) return url;
            int port = uri.getPort();
            if (port > 0) return host + ":" + port;
            return host;
        } catch (Exception e) {
            return url;
        }
    }

    @Nullable
    static String normalizeServerUrl(@Nullable String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.isEmpty()) return null;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!"http".equals(scheme) && !"https".equals(scheme)) return null;
        if (uri.getHost() == null || uri.getHost().isEmpty()) return null;
        // Strip trailing slash for stable identity.
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    @NonNull
    private static String normalizeUrl(@NonNull String url) {
        String normalized = normalizeServerUrl(url);
        return normalized != null ? normalized : url;
    }

    private static void migrateLegacy(android.content.SharedPreferences prefs) {
        if (prefs.contains(KEY_INSTANCES)) return;
        String legacy = prefs.getString(KEY_SERVER_URL, null);
        if (legacy == null || legacy.isEmpty()) return;
        String url = normalizeServerUrl(legacy);
        if (url == null) return;
        Instance created =
            new Instance(
                UUID.randomUUID().toString(),
                url,
                displayNameForUrl(url),
                System.currentTimeMillis()
            );
        List<Instance> list = new ArrayList<>();
        list.add(created);
        save(prefs, list);
    }
}
