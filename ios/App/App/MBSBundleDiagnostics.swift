import Foundation

enum MBSBundleDiagnostics {
  private static var didLogPublicIndex = false

  static func logPublicIndexOnce() {
    if didLogPublicIndex {
      return
    }
    didLogPublicIndex = true

    let indexPath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "public")
    let indexExists = indexPath.map { FileManager.default.fileExists(atPath: $0) } ?? false
    NSLog(
      "[MBS] public/index.html exists=%d path=%@",
      indexExists ? 1 : 0,
      indexPath ?? "nil"
    )
  }
}
