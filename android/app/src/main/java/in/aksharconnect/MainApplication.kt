package `in`.aksharconnect

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Registered as families so a `fontWeight` in a style picks the matching file.
    ReactFontManager.getInstance().addCustomFont(this, "DM Sans", R.font.dm_sans)
    ReactFontManager.getInstance().addCustomFont(this, "Sora", R.font.sora)
    loadReactNative(this)
  }
}
