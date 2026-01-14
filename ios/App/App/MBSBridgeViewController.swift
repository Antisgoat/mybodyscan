import Capacitor
import Foundation
import WebKit

/// Adds minimal diagnostics to show exactly what the WKWebView is attempting to load.
final class MBSBridgeViewController: CAPBridgeViewController, WKNavigationDelegate {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        logBundleResources()

        guard let config = bridge?.config else {
            NSLog("[MBS] Capacitor bridge/config not ready yet")
            return
        }

        bridge?.webView?.navigationDelegate = self

        let startFileURL = config.appStartFileURL
        let startFileExists = FileManager.default.fileExists(atPath: startFileURL.path)

        NSLog("[MBS] Capacitor appStartFileURL=%@ exists=%d", startFileURL.absoluteString, startFileExists ? 1 : 0)
        NSLog("[MBS] Capacitor appStartServerURL=%@", config.appStartServerURL.absoluteString)
        NSLog("[MBS] Capacitor serverURL=%@", config.serverURL.absoluteString)

        let localURL = config.localURL
        NSLog("[MBS] Capacitor localURL=%@", localURL.absoluteString)

        NSLog("[MBS] Capacitor appLocation=%@", config.appLocation.absoluteString)
    }

    private func logBundleResources() {
        let resourcesURL = Bundle.main.resourceURL
        let indexURL = resourcesURL?.appendingPathComponent("public/index.html")
        let configURL = resourcesURL?.appendingPathComponent("capacitor.config.json")
        let indexExists = indexURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
        let configExists = configURL.map { FileManager.default.fileExists(atPath: $0.path) } ?? false

        NSLog("[MBS] Bundle resources=%@", resourcesURL?.path ?? "nil")
        NSLog("[MBS] Bundled public/index.html=%@ exists=%d", indexURL?.path ?? "nil", indexExists ? 1 : 0)
        NSLog("[MBS] Bundled capacitor.config.json=%@ exists=%d", configURL?.path ?? "nil", configExists ? 1 : 0)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        logWebViewError("didFailProvisionalNavigation", error: error, webView: webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        logWebViewError("didFailNavigation", error: error, webView: webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("[MBS] WebView content process terminated url=%@", webView.url?.absoluteString ?? "nil")
    }

    private func logWebViewError(_ label: String, error: Error, webView: WKWebView) {
        let nsError = error as NSError
        NSLog(
            "[MBS] WebView %@ error=%@ code=%d url=%@ userInfo=%@",
            label,
            nsError.localizedDescription,
            nsError.code,
            webView.url?.absoluteString ?? "nil",
            String(describing: nsError.userInfo)
        )
    }
}
