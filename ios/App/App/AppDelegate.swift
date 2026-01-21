import UIKit
import Capacitor
import FirebaseCore

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private func debugLog(_ message: String, _ args: CVarArg...) {
        #if DEBUG
        withVaList(args) { NSLogv(message, $0) }
        #endif
    }

    private func log(_ message: String, _ args: CVarArg...) {
        withVaList(args) { NSLogv(message, $0) }
    }

    private func configureFirebaseIfPossible() {
        if FirebaseApp.app() != nil {
            debugLog("[MBS] FirebaseApp already configured")
            return
        }

        guard let plistPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") else {
            log("[MBS] Firebase config missing: GoogleService-Info.plist not found in bundle. Skipping FirebaseApp.configure().")
            return
        }

        guard let options = FirebaseOptions(contentsOfFile: plistPath) else {
            log("[MBS] Firebase config invalid: unable to parse GoogleService-Info.plist. Skipping FirebaseApp.configure().")
            return
        }

        let googleAppId = options.googleAppID.trimmingCharacters(in: .whitespacesAndNewlines)
        if googleAppId.isEmpty || googleAppId.contains("REPLACE_ME") {
            log("[MBS] Firebase config invalid: GOOGLE_APP_ID is missing/placeholder. Skipping FirebaseApp.configure().")
            return
        }

        if let plist = NSDictionary(contentsOfFile: plistPath),
           let bundleIdFromPlist = plist["BUNDLE_ID"] as? String,
           let bundleId = Bundle.main.bundleIdentifier,
           bundleIdFromPlist != bundleId {
            log("[MBS] Firebase config invalid: BUNDLE_ID '%@' does not match app bundle '%@'. Skipping FirebaseApp.configure().", bundleIdFromPlist, bundleId)
            return
        }

        FirebaseApp.configure(options: options)
        debugLog("[MBS] FirebaseApp configured")
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // MUST occur before any Capacitor bridge init / plugin access.
        configureFirebaseIfPossible()

        let resourcesURL = Bundle.main.resourceURL
        let indexURL = resourcesURL?.appendingPathComponent("public/index.html")
        let indexExists = indexURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false

        debugLog("[MBS] didFinishLaunching")
        debugLog("[MBS] Bundle resources=%@", resourcesURL?.path ?? "nil")
        debugLog("[MBS] Bundled public/index.html=%@ exists=%d", indexURL?.path ?? "nil", indexExists ? 1 : 0)

        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
