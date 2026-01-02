import Capacitor
import WebKit

final class InspectingBridgeViewController: CAPBridgeViewController, WKNavigationDelegate {
  override func viewDidLoad() {
    super.viewDidLoad()

    // proof native VC loaded
    print("✅ InspectingBridgeViewController loaded")

    if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
      print("✅ index.html found in bundle:", url)
    } else {
      print("❌ index.html NOT found in bundle")
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
      if let wv = self.bridge?.webView {
        print("✅ WKWebView exists")
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
