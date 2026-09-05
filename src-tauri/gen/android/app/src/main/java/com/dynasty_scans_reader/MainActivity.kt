package com.dynasty_scans_reader

import android.content.Intent
import android.graphics.Color
import android.net.Uri
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
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    configureSystemBars(isDark = isNightModeActive())
  }

  override fun onResume() {
    super.onResume()
    if (isStatusBarHidden) {
      setStatusBarVisible(false)
    }
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

  private var isStatusBarHidden: Boolean = false

  fun setStatusBarVisible(visible: Boolean) {
    val currentWindow = window ?: return
    val insetsController = WindowCompat.getInsetsController(currentWindow, currentWindow.decorView)
    isStatusBarHidden = !visible
    if (visible) {
      insetsController.show(WindowInsetsCompat.Type.statusBars())
      insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
    } else {
      insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      insetsController.hide(WindowInsetsCompat.Type.statusBars())
    }
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

    if (isStatusBarHidden) {
      insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      insetsController.hide(WindowInsetsCompat.Type.statusBars())
    }
  }
  fun performHaptic(style: String?, durationMs: Int = 0, amplitude: Int = 0) {
    val view = window?.decorView ?: return
    view.isHapticFeedbackEnabled = true

    val effectiveDur = if (durationMs > 0) durationMs.coerceIn(5, 500) else when (style) {
      "confirm", "success" -> 25
      "snap", "lock" -> 40
      "page-turn" -> 20
      else -> 15
    }

    val effectiveAmp = if (amplitude > 0) amplitude.coerceIn(1, 255) else 255

    // 1. Hardware vibrator with precise amplitude (strength) and duration
    try {
      val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = getSystemService(VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vibratorManager?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(VIBRATOR_SERVICE) as? Vibrator
      }

      if (vibrator?.hasVibrator() == true) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val effect = if (style == "confirm" || style == "success") {
            val d = effectiveDur.toLong()
            val timings = longArrayOf(0, d, 40, d)
            if (vibrator.hasAmplitudeControl()) {
              val amps = intArrayOf(0, effectiveAmp, 0, effectiveAmp)
              VibrationEffect.createWaveform(timings, amps, -1)
            } else {
              VibrationEffect.createWaveform(timings, -1)
            }
          } else {
            val d = effectiveDur.toLong()
            if (vibrator.hasAmplitudeControl()) {
              VibrationEffect.createOneShot(d, effectiveAmp)
            } else {
              VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE)
            }
          }
          vibrator.vibrate(effect)
          return
        } else {
          @Suppress("DEPRECATION")
          if (style == "confirm" || style == "success") {
            val d = effectiveDur.toLong()
            vibrator.vibrate(longArrayOf(0, d, 40, d), -1)
          } else {
            vibrator.vibrate(effectiveDur.toLong())
          }
          return
        }
      }
    } catch (_: Exception) {}

    // 2. Fallback: View.performHapticFeedback with FLAG_IGNORE_VIEW_SETTING / FLAG_IGNORE_GLOBAL_SETTING
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING
    } else {
      @Suppress("DEPRECATION")
      HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING
    }

    val constant = when (style) {
      "confirm", "success" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS
      "snap", "lock" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) HapticFeedbackConstants.DRAG_START else HapticFeedbackConstants.CONTEXT_CLICK
      "page-turn" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) HapticFeedbackConstants.CLOCK_TICK else HapticFeedbackConstants.KEYBOARD_TAP
      else -> HapticFeedbackConstants.KEYBOARD_TAP
    }
    view.performHapticFeedback(constant, flags)
  }

  class ThemeBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun updateTheme(isDark: Boolean, colorHex: String?) {
      activity.runOnUiThread {
        activity.configureSystemBars(isDark)
      }
    }

    @JavascriptInterface
    fun setStatusBarVisible(visible: Boolean) {
      activity.runOnUiThread {
        activity.setStatusBarVisible(visible)
      }
    }

    @JavascriptInterface
    fun setStatusBarHidden(hidden: Boolean) {
      activity.runOnUiThread {
        activity.setStatusBarVisible(!hidden)
      }
    }

    @JavascriptInterface
    fun triggerHaptic(style: String?) {
      activity.runOnUiThread {
        activity.performHaptic(style)
      }
    }

    @JavascriptInterface
    fun triggerHapticAdvanced(style: String?, durationMs: Int, amplitude: Int) {
      activity.runOnUiThread {
        activity.performHaptic(style, durationMs, amplitude)
      }
    }

    @JavascriptInterface
    fun isConnectionMetered(): Boolean {
      return try {
        val cm = activity.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
          ?: return false
        cm.isActiveNetworkMetered
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun openUrl(url: String?): Boolean {
      if (url.isNullOrBlank()) return false
      val lower = url.trim().lowercase()
      if (!lower.startsWith("http://") && !lower.startsWith("https://")) return false
      return try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
