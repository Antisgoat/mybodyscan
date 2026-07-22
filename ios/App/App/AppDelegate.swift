import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return true
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    NotificationCenter.default.post(name: .capacitorOpenURL, object: [
      "url": url,
      "options": options,
    ])
    NotificationCenter.default.post(name: NSNotification.Name.CDVPluginHandleOpenURL, object: url)
    return true
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    _ = restorationHandler
    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
          userActivity.webpageURL != nil else {
      return false
    }
    NotificationCenter.default.post(name: .capacitorOpenUniversalLink, object: [
      "url": userActivity.webpageURL as Any,
    ])
    return true
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    NotificationCenter.default.post(
      name: .capacitorDidRegisterForRemoteNotifications,
      object: deviceToken
    )
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NotificationCenter.default.post(
      name: .capacitorDidFailToRegisterForRemoteNotifications,
      object: error
    )
  }

  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    NotificationCenter.default.post(
      name: Notification.Name("didReceiveRemoteNotification"),
      object: completionHandler,
      userInfo: userInfo
    )
  }
}
