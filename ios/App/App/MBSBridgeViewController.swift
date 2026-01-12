import Capacitor
import Foundation

/// Adds minimal diagnostics to show exactly what the WKWebView is attempting to load.
final class MBSBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        guard let config = bridge?.config else {
            NSLog("[MBS] Capacitor bridge/config not ready yet")
            return
        }

        let startFileURL = config.appStartFileURL
        let startFileExists = FileManager.default.fileExists(atPath: startFileURL.path)

        NSLog("[MBS] Capacitor appStartFileURL=%@ exists=%d", startFileURL.absoluteString, startFileExists ? 1 : 0)
        NSLog("[MBS] Capacitor appStartServerURL=%@", config.appStartServerURL.absoluteString)
        NSLog("[MBS] Capacitor serverURL=%@", config.serverURL.absoluteString)

        let localURL = config.localURL
        NSLog("[MBS] Capacitor localURL=%@", localURL.absoluteString)

        NSLog("[MBS] Capacitor appLocation=%@", config.appLocation.absoluteString)
    }
}
