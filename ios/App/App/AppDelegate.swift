import UIKit
import Capacitor
import FirebaseCore

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private static var didConfigureFirebase = false
    static var firebaseConfigErrorMessage: String?

    private func debugLog(_ message: String, _ args: CVarArg...) {
        #if DEBUG
        withVaList(args) { NSLogv(message, $0) }
        #endif
    }

    private func handleFirebaseConfigFailure(_ message: String) {
        NSLog("[MBS] Firebase configuration error: %@", message)
        #if DEBUG
        fatalError(message)
        #else
        AppDelegate.firebaseConfigErrorMessage = message
        #endif
    }

    private func configureFirebaseIfNeeded(origin: String) {
        if AppDelegate.didConfigureFirebase {
            return
        }
        AppDelegate.didConfigureFirebase = true

        let gsPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist")
        NSLog("[MBS] GoogleService-Info.plist path=%@", gsPath ?? "nil")
        let before = FirebaseApp.app()
        NSLog("[MBS] Firebase default app BEFORE=%@", before == nil ? "nil" : "non-nil")

        guard let gsPath = gsPath else {
            handleFirebaseConfigFailure("Missing GoogleService-Info.plist (origin=\(origin))")
            return
        }
        guard let options = FirebaseOptions(contentsOfFile: gsPath) else {
            handleFirebaseConfigFailure("Failed to load FirebaseOptions (origin=\(origin))")
            return
        }

        if FirebaseApp.app() == nil {
            FirebaseApp.configure(options: options)
        }

        let after = FirebaseApp.app()
        NSLog("[MBS] Firebase default app AFTER=%@", after == nil ? "nil" : "non-nil")
        if after == nil {
            handleFirebaseConfigFailure("Firebase default app still nil after configure (origin=\(origin))")
        }
    }

    override init() {
        super.init()
        configureFirebaseIfNeeded(origin: "init")
    }

    func application(_ application: UIApplication, willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        configureFirebaseIfNeeded(origin: "willFinishLaunching")
        return true
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureFirebaseIfNeeded(origin: "didFinishLaunching")
        let resourcesURL = Bundle.main.resourceURL
        let bundledIndexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "public")
        let indexExists = bundledIndexURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false

        debugLog("[MBS] didFinishLaunching")
        debugLog("[MBS] Bundle resources=%@", resourcesURL?.path ?? "nil")
        debugLog("[MBS] Bundled index.html=%@ exists=%d", bundledIndexURL?.path ?? "nil", indexExists ? 1 : 0)

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
