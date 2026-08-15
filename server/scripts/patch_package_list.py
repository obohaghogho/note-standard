import os

file_path = r"d:\Users\Manuel\OneDrive\Desktop\note-standard-latest\mobile\node_modules\expo\android\build\generated\expo\src\main\java\expo\modules\ExpoModulesPackageList.java"

content = """package expo.modules;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import expo.modules.core.interfaces.Package;
import expo.modules.kotlin.modules.Module;
import expo.modules.kotlin.services.Service;
import expo.modules.kotlin.ModulesProvider;

public class ExpoModulesPackageList implements ModulesProvider {
  private static class LazyHolder {
    static final List<Package> packagesList = Arrays.<Package>asList(
      new expo.modules.adapters.react.ReactAdapterPackage(),
      new expo.modules.av.AVPackage(),
      new expo.modules.constants.ConstantsPackage(),
      new expo.modules.core.BasePackage(),
      new expo.modules.filesystem.legacy.FileSystemPackage(),
      new expo.modules.imageloader.ImageLoaderPackage(),
      new expo.modules.kotlin.edgeToEdge.EdgeToEdgePackage(),
      new expo.modules.linking.ExpoLinkingPackage(),
      new expo.modules.logbox.ExpoLogBoxPackage(),
      new expo.modules.notifications.NotificationsPackage(),
      new expo.modules.updates.UpdatesPackage()
    );

    static final List<Class<? extends Module>> modulesList = Arrays.<Class<? extends Module>>asList(
      expo.modules.webview.DomWebViewModule.class,
      expo.modules.application.ApplicationModule.class,
      expo.modules.asset.AssetModule.class,
      expo.modules.av.video.VideoViewModule.class,
      expo.modules.av.AVModule.class,
      expo.modules.constants.ConstantsModule.class,
      expo.modules.crypto.CryptoModule.class,
      expo.modules.documentpicker.DocumentPickerModule.class,
      expo.modules.easclient.EASClientModule.class,
      expo.modules.filesystem.FileSystemModule.class,
      expo.modules.filesystem.legacy.FileSystemLegacyModule.class,
      expo.modules.font.FontLoaderModule.class,
      expo.modules.font.FontUtilsModule.class,
      expo.modules.imagepicker.ImagePickerModule.class,
      expo.modules.intentlauncher.IntentLauncherModule.class,
      expo.modules.keepawake.KeepAwakeModule.class,
      expo.modules.lineargradient.LinearGradientModule.class,
      expo.modules.linking.ExpoLinkingModule.class,
      expo.modules.notifications.badge.BadgeModule.class,
      expo.modules.notifications.notifications.background.ExpoBackgroundNotificationTasksModule.class,
      expo.modules.notifications.notifications.categories.ExpoNotificationCategoriesModule.class,
      expo.modules.notifications.notifications.channels.NotificationChannelGroupManagerModule.class,
      expo.modules.notifications.notifications.channels.NotificationChannelManagerModule.class,
      expo.modules.notifications.notifications.emitting.NotificationsEmitter.class,
      expo.modules.notifications.notifications.handling.NotificationsHandler.class,
      expo.modules.notifications.permissions.NotificationPermissionsModule.class,
      expo.modules.notifications.notifications.presentation.ExpoNotificationPresentationModule.class,
      expo.modules.notifications.notifications.scheduling.NotificationScheduler.class,
      expo.modules.notifications.serverregistration.ServerRegistrationModule.class,
      expo.modules.notifications.tokens.PushTokenModule.class,
      expo.modules.securestore.SecureStoreModule.class,
      expo.modules.sqlite.SQLiteModule.class,
      expo.modules.updates.UpdatesModule.class
    );
  }

  public static List<Package> getPackageList() {
    return LazyHolder.packagesList;
  }

  @Override
  public Map<Class<? extends Module>, String> getModulesMap() {
    Map<Class<? extends Module>, String> map = new HashMap<>();
    for (Class<? extends Module> module : LazyHolder.modulesList) {
      map.put(module, null);
    }
    return map;
  }

  @Override
  public List<Class<? extends Service>> getServices() {
    return java.util.Collections.emptyList();
  }
}
"""

os.makedirs(os.path.dirname(file_path), exist_ok=True)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully written updated ExpoModulesPackageList.java!")
