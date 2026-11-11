package com.bondoo.connect;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        setupAuthInterception();
    }

    @Override
    public void onStart() {
        super.onStart();
        setupAuthInterception();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupAuthInterception();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (this.bridge != null) {
            this.bridge.onNewIntent(intent);
        }
    }

    private void openInCustomTabs(Uri uri) {
        try {
            CustomTabsIntent customTabs = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build();
            customTabs.intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            customTabs.launchUrl(this, uri);
        } catch (Exception e) {
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
                browserIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(browserIntent);
            } catch (Exception ignored) {}
        }
    }

    private void setupAuthInterception() {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();

            // 1. Expose native interface so JavaScript can directly launch Chrome Custom Tabs
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void openSystemBrowser(String url) {
                    if (url != null && !url.isEmpty()) {
                        runOnUiThread(() -> openInCustomTabs(Uri.parse(url)));
                    }
                }
            }, "BondooNativeAuth");

            // 2. Intercept any navigation requests attempting to load Google OAuth inside the WebView
            webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request == null || request.getUrl() == null) {
                        return super.shouldOverrideUrlLoading(view, request);
                    }

                    Uri url = request.getUrl();
                    String host = url.getHost();

                    if (host != null && (
                        host.contains("accounts.google.com") ||
                        host.contains("google.com/o/oauth2") ||
                        (host.contains("supabase.co") && url.getPath() != null && url.getPath().contains("/auth/v1/authorize"))
                    )) {
                        openInCustomTabs(url);
                        return true;
                    }

                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }
}
