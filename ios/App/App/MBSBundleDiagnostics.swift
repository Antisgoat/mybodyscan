import Foundation

enum MBSBundleDiagnostics {
  struct PublicIndexStatus {
    let url: URL?
    let exists: Bool
  }

  static func publicIndexStatus() -> PublicIndexStatus {
    let indexURL = Bundle.main.url(
      forResource: "index",
      withExtension: "html",
      subdirectory: "public"
    )
    let indexExists = indexURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    return PublicIndexStatus(url: indexURL, exists: indexExists)
  }

  static func logPublicIndex(context: String) {
    let status = publicIndexStatus()
    NSLog(
      "[MBS] %@ public/index.html exists=%d path=%@",
      context,
      status.exists ? 1 : 0,
      status.url?.path ?? "nil"
    )
  }
}
