package com.dynasty_scans_reader

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
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
  fun performHaptic(style: String?) {
    val view = window?.decorView ?: return
    view.isHapticFeedbackEnabled = true

    when (style) {
      "confirm", "success" -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
        } else {
          view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        }
      }
      "snap", "lock" -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          view.performHapticFeedback(HapticFeedbackConstants.DRAG_START)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          view.performHapticFeedback(HapticFeedbackConstants.GESTURE_END)
        } else {
          view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
        }
      }
      else -> {
        view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
      }
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = getSystemService(VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        val vibrator = vibratorManager?.defaultVibrator
        if (vibrator?.hasVibrator() == true) {
          val effect = if (style == "confirm") {
            VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
          } else {
            VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
          }
          vibrator.vibrate(effect)
        }
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        @Suppress("DEPRECATION")
        val vibrator = getSystemService(VIBRATOR_SERVICE) as? Vibrator
        if (vibrator?.hasVibrator() == true) {
          val effect = if (style == "confirm") {
            VibrationEffect.createOneShot(45, VibrationEffect.DEFAULT_AMPLITUDE)
          } else {
            VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE)
          }
          vibrator.vibrate(effect)
        }
      }
    } catch (_: Exception) {}
  }

  class ThemeBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun updateTheme(isDark: Boolean, colorHex: String?) {
      activity.runOnUiThread {
        activity.configureSystemBars(isDark)
      }
    }

    @JavascriptInterface
    fun triggerHaptic(style: String?) {
      activity.runOnUiThread {
        activity.performHaptic(style)
      }
    }
  }
}
