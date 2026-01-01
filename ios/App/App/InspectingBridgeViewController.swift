import Capacitor
import WebKit

final class InspectingBridgeViewController: CAPBridgeViewController, WKNavigationDelegate {
  override func viewDidLoad() {
    super.viewDidLoad()
    self.bridge?.webView?.navigationDelegate = self
    if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
      print("✅ index.html in bundle:", url)
    } else {
      print("❌ index.html NOT found in bundle")
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

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    print("❌ WKNavigation failed:", error)
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    print("❌ WKProvisional navigation failed:", error)
  }
}
