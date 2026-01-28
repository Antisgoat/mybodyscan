import Foundation

enum MBSBundleDiagnostics {
  private static var didLogPublicIndex = false

  static func logPublicIndexOnce() {
    if didLogPublicIndex {
      return
    }
    didLogPublicIndex = true

    let indexURL = Bundle.main.url(
      forResource: "index",
      withExtension: "html",
      subdirectory: "public"
    )
    let indexExists = indexURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    NSLog(
      "[MBS] public/index.html exists=%d path=%@",
      indexExists ? 1 : 0,
      indexURL?.path ?? "nil"
    )
  }
}
