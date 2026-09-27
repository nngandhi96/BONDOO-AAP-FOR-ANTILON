package com.bondoo.connect;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupCustomWebViewClient();
    }

    @Override
    public void onStart() {
        super.onStart();
        setupCustomWebViewClient();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupCustomWebViewClient();
    }

    private void setupCustomWebViewClient() {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request == null || request.getUrl() == null) {
                        return super.shouldOverrideUrlLoading(view, request);
                    }

                    Uri url = request.getUrl();
                    String scheme = url.getScheme();
                    String host = url.getHost();

                    if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                        // Keep internal app routes, Vercel, Supabase, Google/CDN assets inside the app WebView
                        if (host == null ||
                            host.contains("vercel.app") ||
                            host.contains("bondoo") ||
                            host.contains("supabase.co") ||
                            host.contains("googleapis.com") ||
                            host.contains("gstatic.com") ||
                            host.equals("localhost")) {
                            return false; // Force WebView to load URL internally without launching browser
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }
}
