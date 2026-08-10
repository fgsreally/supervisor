package com.supervisor.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;

public class ShellActivity extends AppCompatActivity {
    private static final String PREFS = "supervisor_shell";
    private static final String KEY_SERVER_URL = "server_url";

    /**
     * SPA root tabs. At these paths, history.back() often only hits the "/" redirect
     * (looks like a no-op) and the next back would leave the app — so we background instead.
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
    private View emptyView;
    private Button scanButton;

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
        registerForActivityResult(
            new androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
            granted -> {
                if (granted) {
                    launchScanner();
                } else {
                    Toast.makeText(this, "需要相机权限才能扫码", Toast.LENGTH_SHORT).show();
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

        // No native top chrome. Light status bar only; web pads the title itself.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insets.setAppearanceLightStatusBars(true);
        insets.setAppearanceLightNavigationBars(true);

        webView = findViewById(R.id.shell_webview);
        emptyView = findViewById(R.id.shell_empty);
        scanButton = findViewById(R.id.shell_scan_button);

        setupWebView();
        scanButton.setOnClickListener(v -> startScanFlow());

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

        String saved = getPrefs().getString(KEY_SERVER_URL, null);
        if (saved != null && !saved.isEmpty()) {
            loadServer(saved);
        } else {
            showEmpty();
        }
    }

    private void handleShellBack() {
        if (webView.getVisibility() != View.VISIBLE) {
            moveTaskToBack(true);
            return;
        }
        // Prefer SPA history.back(); never finish() the activity on swipe-back.
        webView.evaluateJavascript(
            HISTORY_BACK_JS,
            value -> {
                // evaluateJavascript wraps strings in quotes: "back" / "root"
                if (value == null || value.contains("root")) {
                    moveTaskToBack(true);
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
        options.setPrompt("扫描电脑端 Supervisor 二维码");
        options.setBeepEnabled(false);
        options.setOrientationLocked(true);
        options.setCaptureActivity(PortraitCaptureActivity.class);
        barcodeLauncher.launch(options);
    }

    private void handleScannedPayload(String raw) {
        String url = normalizeServerUrl(raw);
        if (url == null) {
            Toast.makeText(this, "二维码不是有效的 http(s) 地址", Toast.LENGTH_SHORT).show();
            return;
        }
        getPrefs().edit().putString(KEY_SERVER_URL, url).apply();
        loadServer(url);
        Toast.makeText(this, "已连接", Toast.LENGTH_SHORT).show();
    }

    @Nullable
    private String normalizeServerUrl(String raw) {
        if (raw == null) {
            return null;
        }
        String value = raw.trim();
        if (value.isEmpty()) {
            return null;
        }
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return null;
        }
        if (uri.getHost() == null || uri.getHost().isEmpty()) {
            return null;
        }
        return value;
    }

    private void loadServer(String url) {
        emptyView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private void showEmpty() {
        webView.setVisibility(View.GONE);
        emptyView.setVisibility(View.VISIBLE);
    }

    private SharedPreferences getPrefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }
}
