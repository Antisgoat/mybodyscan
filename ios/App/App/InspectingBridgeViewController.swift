import Capacitor
import WebKit

final class InspectingBridgeViewController: CAPBridgeViewController, WKNavigationDelegate {
  override func viewDidLoad() {
    super.viewDidLoad()

    // Visual proof we reached native VC
    view.backgroundColor = .black

    // Log if index.html exists in bundle
    if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
      print("✅ index.html found in bundle:", url)
    } else {
      print("❌ index.html NOT found in bundle")
    }

    // Log webview creation
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
      if let wv = self.bridge?.webView {
        print("✅ WKWebView exists:", wv)
        wv.navigationDelegate = self
      } else {
        print("❌ bridge.webView is nil")
      }
    }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    #if DEBUG
    if #available(iOS 16.4, *) {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        self.bridge?.webView?.isInspectable = true
        print("✅ WKWebView inspectable enabled")
      }
    }
    #endif
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    print("✅ WebView didFinish navigation")
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    print("❌ didFailProvisionalNavigation:", error)
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    print("❌ didFail navigation:", error)
  }
}
