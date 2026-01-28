import Foundation

enum MBSBundleDiagnostics {
  struct PublicIndexStatus {
    let url: URL?
    let exists: Bool
  }

  static func indexURL() -> URL? {
    let url = Bundle.main.url(
      forResource: "index",
      withExtension: "html",
      subdirectory: "public"
    )
    NSLog("[MBS] public/index.html lookup path=%@", url?.path ?? "nil")
    return url
  }

  static func publicIndexStatus() -> PublicIndexStatus {
    let url = indexURL()
    let exists = url.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    return PublicIndexStatus(url: url, exists: exists)
  }

  static func logPublicIndex(context: String? = nil) {
    let status = publicIndexStatus()
    if let context = context {
      NSLog(
        "[MBS] public/index.html path=%@ exists=%d context=%@",
        status.url?.path ?? "nil",
        status.exists ? 1 : 0,
        context
      )
    } else {
      NSLog(
        "[MBS] public/index.html path=%@ exists=%d",
        status.url?.path ?? "nil",
        status.exists ? 1 : 0
      )
    }
    if !status.exists {
      logPublicDirectoryContents()
    }
  }

  private static func logPublicDirectoryContents() {
    #if DEBUG
    guard let resourcesURL = Bundle.main.resourceURL else {
      NSLog("[MBS] public dir contents (top-level)=nil (no resources URL)")
      return
    }
    let publicURL = resourcesURL.appendingPathComponent("public")
    var isDirectory: ObjCBool = false
    let exists = FileManager.default.fileExists(atPath: publicURL.path, isDirectory: &isDirectory)
    guard exists, isDirectory.boolValue else {
      NSLog("[MBS] public dir contents (top-level)=nil (public dir missing)")
      return
    }
    do {
      let contents = try FileManager.default.contentsOfDirectory(atPath: publicURL.path)
      NSLog("[MBS] public dir contents (top-level)=%@", contents.joined(separator: ", "))
    } catch {
      NSLog("[MBS] public dir contents (top-level)=error %@", error.localizedDescription)
    }
    #endif
  }
}
