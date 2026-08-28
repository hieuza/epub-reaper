import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var pendingFiles: [URL] = []
    var isWebReady = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenu()
        setupWindow()
        loadWebContent()
    }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        let urls = filenames.map { URL(fileURLWithPath: $0) }.filter { $0.pathExtension.lowercased() == "epub" }
        guard !urls.isEmpty else { return }

        if isWebReady {
            if let first = urls.first {
                openEpubFile(at: first)
            }
        } else {
            pendingFiles.append(contentsOf: urls)
        }
    }

    func application(_ sender: NSApplication, openFile filename: String) -> Bool {
        let url = URL(fileURLWithPath: filename)
        guard url.pathExtension.lowercased() == "epub" else { return false }
        if isWebReady {
            openEpubFile(at: url)
        } else {
            pendingFiles.append(url)
        }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    // ── Window Setup ─────────────────────────────────────────────────────────
    private func setupWindow() {
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let winWidth: CGFloat = min(1120, screenRect.width * 0.85)
        let winHeight: CGFloat = min(800, screenRect.height * 0.85)
        let winX = screenRect.origin.x + (screenRect.width - winWidth) / 2
        let winY = screenRect.origin.y + (screenRect.height - winHeight) / 2

        let contentRect = NSRect(x: winX, y: winY, width: winWidth, height: winHeight)

        window = NSWindow(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        window.title = "EPUB Reaper"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.minSize = NSSize(width: 820, height: 560)
        window.backgroundColor = NSColor(red: 9/255.0, green: 13/255.0, blue: 22/255.0, alpha: 1.0)

        // WKWebView Configuration
        let config = WKWebViewConfiguration()
        let userContent = WKUserContentController()
        userContent.add(self, name: "openFileDialog")
        config.userContentController = userContent
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground") // Transparent native background

        // Register dragging
        webView.registerForDraggedTypes([.fileURL])

        window.contentView!.addSubview(webView)
        window.makeKeyAndOrderFront(nil)
    }

    // ── Load Web Assets ──────────────────────────────────────────────────────
    private func loadWebContent() {
        if let resourcePath = Bundle.main.resourcePath {
            let resourceURL = URL(fileURLWithPath: resourcePath)
            let indexURL = resourceURL.appendingPathComponent("index.html")
            if FileManager.default.fileExists(atPath: indexURL.path) {
                webView.loadFileURL(indexURL, allowingReadAccessTo: resourceURL)
                return
            }
        }

        // Fallback for direct development / CLI run
        let devURL = URL(fileURLWithPath: #file)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Resources/index.html")
        let devDir = devURL.deletingLastPathComponent()
        if FileManager.default.fileExists(atPath: devURL.path) {
            webView.loadFileURL(devURL, allowingReadAccessTo: devDir)
        }
    }

    // ── WKNavigationDelegate ─────────────────────────────────────────────────
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isWebReady = true

        // Process CLI arguments (e.g. `open "EPUB Reaper.app" --args /path/to/book.epub`)
        let args = ProcessInfo.processInfo.arguments
        if args.count > 1 {
            for arg in args.dropFirst() {
                let url = URL(fileURLWithPath: arg)
                if url.pathExtension.lowercased() == "epub" && FileManager.default.fileExists(atPath: url.path) {
                    pendingFiles.append(url)
                }
            }
        }

        if let pending = pendingFiles.first {
            openEpubFile(at: pending)
            pendingFiles.removeAll()
        }
    }

    // ── WKScriptMessageHandler ───────────────────────────────────────────────
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "openFileDialog" {
            showNativeOpenDialog()
        }
    }

    // ── Native File Operations ───────────────────────────────────────────────
    @objc func showNativeOpenDialog() {
        let panel = NSOpenPanel()
        panel.allowedFileTypes = ["epub"]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.prompt = "Open"
        panel.message = "Choose an EPUB file to read"

        panel.beginSheetModal(for: window) { [weak self] response in
            if response == .OK, let url = panel.url {
                self?.openEpubFile(at: url)
            }
        }
    }

    func openEpubFile(at url: URL) {
        guard let data = try? Data(contentsOf: url) else {
            let alert = NSAlert()
            alert.messageText = "Unable to read EPUB file"
            alert.informativeText = "Could not open \(url.lastPathComponent)"
            alert.runModal()
            return
        }

        let base64 = data.base64EncodedString()
        let filename = url.lastPathComponent.replacingOccurrences(of: "\"", with: "\\\"")
        let script = "window.openBookFromBase64(\"\(base64)\", \"\(filename)\");"

        webView.evaluateJavaScript(script) { _, error in
            if let error = error {
                NSLog("[EPUB Reaper] JS Evaluation error: %@", error.localizedDescription)
            }
        }
    }

    // ── Native Menu Setup ────────────────────────────────────────────────────
    private func setupMenu() {
        let mainMenu = NSMenu()

        // 1. App Menu
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        let appName = "EPUB Reaper"
        appMenu.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // 2. File Menu
        let fileMenuItem = NSMenuItem()
        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(withTitle: "Open EPUB...", action: #selector(showNativeOpenDialog), keyEquivalent: "o")
        fileMenu.addItem(NSMenuItem.separator())
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileMenuItem.submenu = fileMenu
        mainMenu.addItem(fileMenuItem)

        // 3. View Menu
        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        let toggleSpreadItem = NSMenuItem(title: "Toggle 1P / 2P Spread", action: #selector(menuActionToggleSpread), keyEquivalent: "d")
        viewMenu.addItem(toggleSpreadItem)

        let toggleThemeItem = NSMenuItem(title: "Cycle Theme (Dark / Light / Sepia)", action: #selector(menuActionCycleTheme), keyEquivalent: "t")
        viewMenu.addItem(toggleThemeItem)

        viewMenu.addItem(NSMenuItem.separator())
        viewMenu.addItem(withTitle: "Zoom In (Font +)", action: #selector(menuActionZoomIn), keyEquivalent: "+")
        viewMenu.addItem(withTitle: "Zoom Out (Font -)", action: #selector(menuActionZoomOut), keyEquivalent: "-")
        viewMenu.addItem(NSMenuItem.separator())
        viewMenu.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        // 4. Window Menu
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApplication.shared.mainMenu = mainMenu
    }

    @objc func menuActionToggleSpread() {
        webView?.evaluateJavaScript("window.triggerAction('toggle-spread')", completionHandler: nil)
    }

    @objc func menuActionCycleTheme() {
        webView?.evaluateJavaScript("window.triggerAction('next-theme')", completionHandler: nil)
    }

    @objc func menuActionZoomIn() {
        webView?.evaluateJavaScript("window.triggerAction('zoom-in')", completionHandler: nil)
    }

    @objc func menuActionZoomOut() {
        webView?.evaluateJavaScript("window.triggerAction('zoom-out')", completionHandler: nil)
    }
}

// ── Application Entry Point ──────────────────────────────────────────────────
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
