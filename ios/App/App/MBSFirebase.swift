import FirebaseCore
import Foundation

enum MBSFirebase {
  static var configErrorMessage: String?
  static var isConfigured: Bool {
    return FirebaseApp.app() != nil
  }

  private static func handleFailure(_ message: String) {
    NSLog("[MBS] Firebase configuration error: %@", message)
    configErrorMessage = message
  }

  static func configureIfNeeded(origin: String) {
    let gsPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist")
    NSLog("[MBS] GoogleService-Info.plist path=%@", gsPath ?? "nil")

    let before = FirebaseApp.app()
    NSLog("[MBS] Firebase default app BEFORE=%@", before == nil ? "nil" : "non-nil")

    if before != nil {
      NSLog("[MBS] Firebase already configured (origin=%@)", origin)
      NSLog("[MBS] Firebase default app AFTER=%@", "non-nil")
      return
    }

    guard let gsPath = gsPath else {
      handleFailure("Missing GoogleService-Info.plist (origin=\(origin))")
      return
    }
    guard let options = FirebaseOptions(contentsOfFile: gsPath) else {
      handleFailure("Failed to load FirebaseOptions (origin=\(origin))")
      return
    }

    FirebaseApp.configure(options: options)

    let after = FirebaseApp.app()
    NSLog("[MBS] Firebase default app AFTER=%@", after == nil ? "nil" : "non-nil")
    if after == nil {
      handleFailure("Firebase default app still nil after configure (origin=\(origin))")
    }
  }

  static func assertConfiguredForScene(origin: String) -> String? {
    if isConfigured {
      return nil
    }
    let message = configErrorMessage ?? "Firebase default app missing before scene (origin=\(origin))"
    NSLog("[MBS] Firebase configuration missing for scene: %@", message)
    configErrorMessage = message
    return message
  }
}
