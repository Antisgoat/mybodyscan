import UIKit
import FirebaseCore

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene,
             willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {

    print("✅ SceneDelegate willConnect called")

    // Defensive: some Firebase components can log before AppDelegate finishes.
    // Configure only if the plist is present and Firebase isn't already configured.
    if FirebaseApp.app() == nil {
      let plistPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist")
      if plistPath != nil {
        FirebaseApp.configure()
        NSLog("[MBS] FirebaseApp configured (SceneDelegate fallback)")
      }
    }

    guard let windowScene = scene as? UIWindowScene else { return }

    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = InspectingBridgeViewController()
    self.window = window
    window.makeKeyAndVisible()
  }
}
