# Capacitor & R8 Optimization ProGuard Rules

# 1. Keep JavascriptInterface methods used by WebView
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepattributes SourceFile,LineNumberTable

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 2. Keep Capacitor Bridge and Plugins
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-dontwarn com.getcapacitor.**

# 3. Keep Main Activity and Custom Bridge
-keep class com.bondoo.connect.** { *; }
-keepclassmembers class com.bondoo.connect.MainActivity { *; }

# 4. Keep Cordova Plugin compatibility
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# 5. AndroidX & Support Libraries
-keep class androidx.browser.customtabs.** { *; }
-keep class androidx.core.splashscreen.** { *; }
-dontwarn androidx.browser.customtabs.**

# 6. WebKit
-keep class android.webkit.** { *; }
-dontwarn android.webkit.**
