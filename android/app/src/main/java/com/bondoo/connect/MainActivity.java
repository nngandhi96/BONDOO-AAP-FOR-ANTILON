package com.bondoo.connect;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Collections;

public class MainActivity extends BridgeActivity {

    private boolean authBridgeInitialized = false;

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
            String customTabPackage = CustomTabsClient.getPackageName(this, Collections.emptyList());
            CustomTabsIntent customTabs = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build();
            if (customTabPackage != null) {
                customTabs.intent.setPackage(customTabPackage);
            }
            customTabs.intent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
            customTabs.launchUrl(this, uri);
        } catch (Exception e) {
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
                browserIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(browserIntent);
            } catch (Exception ignored) {}
        }
    }

    private void setupAuthInterception() {
        if (authBridgeInitialized) {
            return;
        }
        if (this.bridge != null && this.bridge.getWebView() != null) {
            authBridgeInitialized = true;
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

            // 2. Intercept any navigation requests attempting to load Google OAuth inside WebView
            //    and keep Bondoo URLs & bondoo:// deep links cleanly inside the app.
            this.bridge.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request == null || request.getUrl() == null) {
                        return super.shouldOverrideUrlLoading(view, request);
                    }

                    Uri url = request.getUrl();
                    String scheme = url.getScheme();
                    String host = url.getHost();
                    String path = url.getPath();

                    if ("bondoo".equalsIgnoreCase(scheme)) {
                        onNewIntent(new Intent(Intent.ACTION_VIEW, url));
                        return true;
                    }

                    if ("intent".equalsIgnoreCase(scheme)) {
                        try {
                            Intent parsedIntent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
                            if (parsedIntent.getData() != null && "bondoo".equalsIgnoreCase(parsedIntent.getData().getScheme())) {
                                onNewIntent(parsedIntent);
                                return true;
                            }
                        } catch (Exception ignored) {}
                    }

                    if (host != null && (
                        host.contains("accounts.google.com") ||
                        (host.endsWith("google.com") && path != null && path.contains("/o/oauth2")) ||
                        (host.endsWith("supabase.co") && path != null && path.contains("/auth/v1/authorize"))
                    )) {
                        openInCustomTabs(url);
                        return true;
                    }

                    if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                        if (host != null && (
                            host.equals("bondoo-connect-main.vercel.app") ||
                            host.endsWith(".bondoo-connect-main.vercel.app")
                        )) {
                            return false;
                        }
                    }

                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }
}
