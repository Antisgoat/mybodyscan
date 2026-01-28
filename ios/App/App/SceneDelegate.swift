import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private func debugLog(_ message: String) {
    #if DEBUG
    print(message)
    #endif
  }

  private func buildBlockingErrorView(title: String, message: String, showMessageInRelease: Bool = false) -> UIViewController {
    let controller = UIViewController()
    controller.view.backgroundColor = .systemBackground

    let titleLabel = UILabel()
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    titleLabel.text = title
    titleLabel.font = UIFont.preferredFont(forTextStyle: .headline)
    titleLabel.textAlignment = .center

    let messageLabel = UILabel()
    messageLabel.translatesAutoresizingMaskIntoConstraints = false
    messageLabel.numberOfLines = 0
    messageLabel.textAlignment = .center
    #if DEBUG
    messageLabel.text = message
    #else
    messageLabel.text = showMessageInRelease ? message : "Please reinstall the app or contact support."
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

  private func blockingErrorScreen(forMissingAssets status: MBSBundleDiagnostics.PublicIndexStatus) -> UIViewController? {
    if status.isValid {
      return nil
    }
    let detail = "Missing assets – run npm run ios:reset."
    #if DEBUG
    let extra = "Expected public/index.html at \(status.url?.path ?? "unknown") (size: \(status.sizeBytes) bytes)."
    #else
    let extra = ""
    #endif
    let message = extra.isEmpty ? detail : "\(detail)\n\n\(extra)"
    return buildBlockingErrorView(
      title: "App assets missing",
      message: message,
      showMessageInRelease: true
    )
  }

  func scene(_ scene: UIScene,
             willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {

    debugLog("✅ SceneDelegate willConnect called")

    guard let windowScene = scene as? UIWindowScene else { return }

    let window = UIWindow(windowScene: windowScene)
    let publicStatus = MBSBundleDiagnostics.publicIndexStatus()
    if let errorVC = blockingErrorScreen(forMissingAssets: publicStatus) {
      window.rootViewController = errorVC
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
