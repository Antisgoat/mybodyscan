import Capacitor

final class InspectingBridgeViewController: CAPBridgeViewController {
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    #if DEBUG
    if #available(iOS 16.4, *) {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        self.bridge?.webView?.isInspectable = true
      }
    }
    #endif
  }
}
