package com.supervisor.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;

import java.util.List;

public class ShellActivity extends AppCompatActivity {
    /**
     * SPA root tabs. At these paths, history.back() often only hits the "/" redirect
     * (looks like a no-op) — return to the instance list instead of leaving the app.
     */
    private static final String HISTORY_BACK_JS =
        "(function(){"
            + "try{"
            + "var path=(location.pathname||'/').replace(/\\/+$/,'')||'/';"
            + "var roots=['/chat','/todo','/dashboard','/contacts','/settings','/providers','/resources','/active-ui'];"
            + "if(roots.indexOf(path)!==-1)return 'root';"
            + "history.back();"
            + "return 'back';"
            + "}catch(e){return 'root';}"
            + "})()";

    private WebView webView;
    private View listPanel;
    private View emptyView;
    private View sectionLabel;
    private LinearLayout instanceList;
    private TextView scanButton;
    private ImageButton scanHeaderButton;

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
        registerForActivityResult(
            new androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
            granted -> {
                if (granted) {
                    launchScanner();
                } else {
                    Toast.makeText(this, R.string.shell_camera_denied, Toast.LENGTH_SHORT).show();
                }
            }
        );

    private final ActivityResultLauncher<ScanOptions> barcodeLauncher =
        registerForActivityResult(
            new ScanContract(),
            result -> {
                if (result.getContents() == null) {
                    return;
                }
                handleScannedPayload(result.getContents());
            }
        );

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_shell);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.parseColor("#EDEDED"));
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insets.setAppearanceLightStatusBars(true);
        insets.setAppearanceLightNavigationBars(true);

        webView = findViewById(R.id.shell_webview);
        listPanel = findViewById(R.id.shell_list_panel);
        emptyView = findViewById(R.id.shell_empty);
        sectionLabel = findViewById(R.id.shell_section_label);
        instanceList = findViewById(R.id.shell_instance_list);
        scanButton = findViewById(R.id.shell_scan_button);
        scanHeaderButton = findViewById(R.id.shell_scan_header_button);

        setupWebView();
        scanButton.setOnClickListener(v -> startScanFlow());
        scanHeaderButton.setOnClickListener(v -> startScanFlow());

        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        handleShellBack();
                    }
                }
            );

        showInstanceList();
    }

    private void handleShellBack() {
        if (webView.getVisibility() != View.VISIBLE) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript(
            HISTORY_BACK_JS,
            value -> {
                if (value == null || value.contains("root")) {
                    // Leave the remote UI and return to the multi-instance picker.
                    showInstanceList();
                }
            }
        );
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " SupervisorShell/1");

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
                    if ("http".equals(scheme) || "https".equals(scheme)) {
                        return false;
                    }
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                        // no handler
                    }
                    return true;
                }

                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    injectShellMarker(view);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    injectShellMarker(view);
                }
            }
        );
    }

    private void injectShellMarker(WebView view) {
        view.evaluateJavascript(
            "(function(){try{document.documentElement.classList.add('supervisor-shell');}catch(e){}})();",
            null
        );
    }

    private void startScanFlow() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            launchScanner();
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void launchScanner() {
        ScanOptions options = new ScanOptions();
        options.setDesiredBarcodeFormats(ScanOptions.QR_CODE);
        options.setPrompt(getString(R.string.shell_scan_prompt));
        options.setBeepEnabled(false);
        options.setOrientationLocked(true);
        options.setCaptureActivity(PortraitCaptureActivity.class);
        barcodeLauncher.launch(options);
    }

    private void handleScannedPayload(String raw) {
        String url = ShellInstanceStore.normalizeServerUrl(raw);
        if (url == null) {
            Toast.makeText(this, R.string.shell_scan_invalid, Toast.LENGTH_SHORT).show();
            return;
        }
        ShellInstanceStore.Instance instance = ShellInstanceStore.upsertByUrl(getPrefs(), url);
        Toast.makeText(this, R.string.shell_added, Toast.LENGTH_SHORT).show();
        loadServer(instance);
    }

    private void showInstanceList() {
        webView.stopLoading();
        webView.loadUrl("about:blank");
        webView.setVisibility(View.GONE);
        listPanel.setVisibility(View.VISIBLE);
        renderInstanceList();
    }

    private void renderInstanceList() {
        List<ShellInstanceStore.Instance> instances = ShellInstanceStore.load(getPrefs());
        instanceList.removeAllViews();

        if (instances.isEmpty()) {
            emptyView.setVisibility(View.VISIBLE);
            sectionLabel.setVisibility(View.GONE);
            instanceList.setVisibility(View.GONE);
            return;
        }

        emptyView.setVisibility(View.GONE);
        sectionLabel.setVisibility(View.VISIBLE);
        instanceList.setVisibility(View.VISIBLE);

        LayoutInflater inflater = LayoutInflater.from(this);
        for (int i = 0; i < instances.size(); i++) {
            ShellInstanceStore.Instance item = instances.get(i);
            View row = inflater.inflate(R.layout.item_shell_instance, instanceList, false);
            TextView avatar = row.findViewById(R.id.shell_instance_avatar);
            TextView title = row.findViewById(R.id.shell_instance_title);
            TextView subtitle = row.findViewById(R.id.shell_instance_subtitle);

            String label = item.name != null && !item.name.isEmpty()
                ? item.name
                : ShellInstanceStore.displayNameForUrl(item.url);
            avatar.setText(avatarLetter(label));
            title.setText(label);
            subtitle.setText(item.url);

            row.setOnClickListener(v -> {
                ShellInstanceStore.touch(getPrefs(), item.id);
                loadServer(item);
            });
            row.setOnLongClickListener(v -> {
                confirmDelete(item);
                return true;
            });

            instanceList.addView(row);
            if (i < instances.size() - 1) {
                View divider = new View(this);
                LinearLayout.LayoutParams lp =
                    new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        1
                    );
                lp.setMargins(dp(68), 0, 0, 0);
                divider.setLayoutParams(lp);
                divider.setBackgroundColor(Color.parseColor("#1A000000"));
                instanceList.addView(divider);
            }
        }
    }

    private void confirmDelete(ShellInstanceStore.Instance item) {
        String label = item.name != null && !item.name.isEmpty()
            ? item.name
            : ShellInstanceStore.displayNameForUrl(item.url);
        new AlertDialog.Builder(this)
            .setTitle(R.string.shell_delete_title)
            .setMessage(getString(R.string.shell_delete_message, label))
            .setNegativeButton(R.string.shell_cancel, null)
            .setPositiveButton(
                R.string.shell_delete_confirm,
                (dialog, which) -> {
                    ShellInstanceStore.remove(getPrefs(), item.id);
                    renderInstanceList();
                }
            )
            .show();
    }

    private void loadServer(ShellInstanceStore.Instance instance) {
        listPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(instance.url);
        Toast.makeText(this, R.string.shell_connected, Toast.LENGTH_SHORT).show();
    }

    private static String avatarLetter(String label) {
        if (label == null || label.isEmpty()) return "S";
        int cp = label.codePointAt(0);
        return new String(Character.toChars(cp)).toUpperCase();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private SharedPreferences getPrefs() {
        return getSharedPreferences(ShellInstanceStore.PREFS, MODE_PRIVATE);
    }
}
