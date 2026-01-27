import Capacitor
import Foundation
import WebKit

/// Adds minimal diagnostics to show exactly what the WKWebView is attempting to load.
final class MBSBridgeViewController: CAPBridgeViewController, WKNavigationDelegate {
    private func debugLog(_ message: String, _ args: CVarArg...) {
        #if DEBUG
        withVaList(args) { NSLogv(message, $0) }
        #endif
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        logBundleResources()

        guard let config = bridge?.config else {
            debugLog("[MBS] Capacitor bridge/config not ready yet")
            return
        }

        bridge?.webView?.navigationDelegate = self

        let startFileURL = config.appStartFileURL
        let startFileExists = FileManager.default.fileExists(atPath: startFileURL.path)

        debugLog(
            "[MBS] Capacitor appStartFileURL=%@ exists=%d",
            startFileURL.absoluteString,
            startFileExists ? 1 : 0
        )
        debugLog("[MBS] Capacitor appStartServerURL=%@", config.appStartServerURL.absoluteString)
        debugLog("[MBS] Capacitor serverURL=%@", config.serverURL.absoluteString)

        let localURL = config.localURL
        debugLog("[MBS] Capacitor localURL=%@", localURL.absoluteString)

        debugLog("[MBS] Capacitor appLocation=%@", config.appLocation.absoluteString)
    }

    private func logBundleResources() {
        let resourcesURL = Bundle.main.resourceURL
        let bundledIndexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "public")
        let rootIndexURL = Bundle.main.url(forResource: "index", withExtension: "html")
        let indexURL = bundledIndexURL ?? rootIndexURL
        let configURL = Bundle.main.url(forResource: "capacitor", withExtension: "config.json")
        let indexExists = indexURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
        let configExists = configURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false

        debugLog("[MBS] Bundle resources=%@", resourcesURL?.path ?? "nil")
        debugLog("[MBS] Bundled index.html=%@ exists=%d", indexURL?.path ?? "nil", indexExists ? 1 : 0)
        debugLog("[MBS] Bundled capacitor.config.json=%@ exists=%d", configURL?.path ?? "nil", configExists ? 1 : 0)
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
