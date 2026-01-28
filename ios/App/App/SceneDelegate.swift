import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private func debugLog(_ message: String) {
    #if DEBUG
    print(message)
    #endif
  }

  private func buildFirebaseConfigErrorView(message: String) -> UIViewController {
    let controller = UIViewController()
    controller.view.backgroundColor = .systemBackground

    let titleLabel = UILabel()
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    titleLabel.text = "App configuration error"
    titleLabel.font = UIFont.preferredFont(forTextStyle: .headline)
    titleLabel.textAlignment = .center

    let messageLabel = UILabel()
    messageLabel.translatesAutoresizingMaskIntoConstraints = false
    messageLabel.numberOfLines = 0
    messageLabel.textAlignment = .center
    #if DEBUG
    messageLabel.text = message
    #else
    messageLabel.text = "Please reinstall the app or contact support."
    #endif

    controller.view.addSubview(titleLabel)
    controller.view.addSubview(messageLabel)

    NSLayoutConstraint.activate([
      titleLabel.centerXAnchor.constraint(equalTo: controller.view.centerXAnchor),
      titleLabel.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor, constant: -20),
      titleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: controller.view.leadingAnchor, constant: 24),
      titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: controller.view.trailingAnchor, constant: -24),
      messageLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 12),
      messageLabel.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor, constant: 24),
      messageLabel.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor, constant: -24),
    ])

    return controller
  }

  func scene(_ scene: UIScene,
             willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {

    debugLog("✅ SceneDelegate willConnect called")

    guard let windowScene = scene as? UIWindowScene else { return }

    let window = UIWindow(windowScene: windowScene)
    if let errorMessage = AppDelegate.firebaseConfigErrorMessage {
      window.rootViewController = buildFirebaseConfigErrorView(message: errorMessage)
      self.window = window
      window.makeKeyAndVisible()
      return
    }
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
