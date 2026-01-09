import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene,
             willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {

    print("✅ SceneDelegate willConnect called")

    guard let windowScene = scene as? UIWindowScene else { return }

    let window = UIWindow(windowScene: windowScene)
    #if DEBUG
    // Debug: extra WKWebView diagnostics + Web Inspector.
    window.rootViewController = InspectingBridgeViewController()
    #else
    // Release: minimal/noisy logging; stable bridge controller.
    window.rootViewController = MBSBridgeViewController()
    #endif
    self.window = window
    window.makeKeyAndVisible()
  }
}
