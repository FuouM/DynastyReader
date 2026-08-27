package com.dynasty_scans_reader

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    configureSystemBars(isDark = isNightModeActive())
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.setBackgroundColor(Color.TRANSPARENT)
    webView.addJavascriptInterface(ThemeBridge(this), "AndroidThemeBridge")
  }

  private fun isNightModeActive(): Boolean {
    val currentNightMode = resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK
    return currentNightMode == android.content.res.Configuration.UI_MODE_NIGHT_YES
  }

  fun configureSystemBars(isDark: Boolean) {
    val currentWindow = window ?: return
    val insetsController = WindowCompat.getInsetsController(currentWindow, currentWindow.decorView)
    insetsController.isAppearanceLightStatusBars = !isDark
    insetsController.isAppearanceLightNavigationBars = !isDark

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      currentWindow.isStatusBarContrastEnforced = false
      currentWindow.isNavigationBarContrastEnforced = false
    }

    currentWindow.statusBarColor = Color.TRANSPARENT
    currentWindow.navigationBarColor = Color.TRANSPARENT
  }

  class ThemeBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun updateTheme(isDark: Boolean, colorHex: String?) {
      activity.runOnUiThread {
        activity.configureSystemBars(isDark)
      }
    }
  }
}
