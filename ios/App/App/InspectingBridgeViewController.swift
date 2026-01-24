import Capacitor
import WebKit

final class InspectingBridgeViewController: CAPBridgeViewController, WKNavigationDelegate {
  private func debugLog(_ message: String, _ args: CVarArg...) {
    #if DEBUG
    withVaList(args) { NSLogv(message, $0) }
    #endif
  }

  override func capacitorDidLoad() {
    super.capacitorDidLoad()

    debugLog("[MBS] InspectingBridgeViewController loaded")
    logBundleResources()
    logCapacitorConfig()

    if let webView = bridge?.webView {
      debugLog("[MBS] WKWebView exists=%d", 1)
      webView.navigationDelegate = self
      #if DEBUG
      if #available(iOS 16.4, *) {
        webView.isInspectable = true
        debugLog("[MBS] WKWebView inspectable enabled")
      }
      #endif
    } else {
      debugLog("[MBS] WKWebView exists=%d", 0)
    }
  }

  private func logBundleResources() {
    let resourcesURL = Bundle.main.resourceURL
    let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "public")
    let configURL = Bundle.main.url(forResource: "capacitor", withExtension: "config.json")
    let indexExists = indexURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    let configExists = configURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false

    debugLog("[MBS] Bundle resources=%@", resourcesURL?.path ?? "nil")
    debugLog("[MBS] Bundled public/index.html=%@ exists=%d", indexURL?.path ?? "nil", indexExists ? 1 : 0)
    debugLog("[MBS] Bundled capacitor.config.json=%@ exists=%d", configURL?.path ?? "nil", configExists ? 1 : 0)
  }

  private func logCapacitorConfig() {
    guard let config = bridge?.config else {
      debugLog("[MBS] Capacitor bridge/config not ready yet")
      return
    }

    let startFileURL = config.appStartFileURL
    let startFileExists = FileManager.default.fileExists(atPath: startFileURL.path)

    debugLog("[MBS] Capacitor appStartFileURL=%@ exists=%d", startFileURL.absoluteString, startFileExists ? 1 : 0)
    debugLog("[MBS] Capacitor appStartServerURL=%@", config.appStartServerURL.absoluteString)
    debugLog("[MBS] Capacitor serverURL=%@", config.serverURL.absoluteString)
    debugLog("[MBS] Capacitor localURL=%@", config.localURL.absoluteString)
    debugLog("[MBS] Capacitor appLocation=%@", config.appLocation.absoluteString)
  }

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    debugLog("[MBS] WebView didStartProvisionalNavigation url=%@", webView.url?.absoluteString ?? "nil")
  }

  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
    debugLog("[MBS] WebView didCommit url=%@", webView.url?.absoluteString ?? "nil")
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    debugLog("[MBS] WebView didFinish url=%@", webView.url?.absoluteString ?? "nil")
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    logWebViewError("didFailProvisionalNavigation", error: error, webView: webView)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    logWebViewError("didFailNavigation", error: error, webView: webView)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    debugLog("[MBS] WebView content process terminated url=%@", webView.url?.absoluteString ?? "nil")
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    if let response = navigationResponse.response as? HTTPURLResponse {
      debugLog("[MBS] WebView response status=%d url=%@", response.statusCode, response.url?.absoluteString ?? "nil")
    } else {
      debugLog("[MBS] WebView response url=%@", navigationResponse.response.url?.absoluteString ?? "nil")
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
    debugLog("[MBS] WebView didReceiveServerRedirect url=%@", webView.url?.absoluteString ?? "nil")
  }

  private func logWebViewError(_ label: String, error: Error, webView: WKWebView) {
    let nsError = error as NSError
    debugLog(
      "[MBS] WebView %@ error=%@ code=%d url=%@ userInfo=%@",
      label,
      nsError.localizedDescription,
      nsError.code,
      webView.url?.absoluteString ?? "nil",
      String(describing: nsError.userInfo)
    )
  }
}
