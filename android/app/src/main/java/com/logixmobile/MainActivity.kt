package com.logixmobile

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "LogixMobile"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (intent.action == "com.logixmobile.SCAN_EVENT") {
      val decodedData = intent.getStringExtra("com.symbol.datawedge.data_string")
      val scanMap = Arguments.createMap()
      scanMap.putString("code", decodedData)
      
      this.reactInstanceManager.currentReactContext?.let { context ->
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("datawedge_broadcast_intent", scanMap)
      }
    }
  }
}
