import AppKit
import CoreGraphics
import Foundation

private struct QuotaWindow: Decodable {
    let remainingPercent: Int
    let resetsAt: String
}

private struct QuotaPayload: Decodable {
    let available: Bool
    let source: String
    let observedAt: String
    let primary: QuotaWindow?
    let secondary: QuotaWindow?
    let resetCredits: Int?
    let message: String?
}

private final class CompanionPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

private struct PetWindowCandidate {
    let frame: CGRect
    let score: Int
}

private final class CodexPetTracker {
    func locatePet() -> CGRect? {
        let codexPIDs = Set(NSWorkspace.shared.runningApplications.compactMap { app -> pid_t? in
            let name = app.localizedName?.lowercased() ?? ""
            let bundle = app.bundleIdentifier?.lowercased() ?? ""
            return name.contains("codex") || name.contains("chatgpt") || bundle.contains("codex") ? app.processIdentifier : nil
        })
        guard !codexPIDs.isEmpty,
              let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
        else { return nil }

        let candidates: [PetWindowCandidate] = windows.compactMap { info in
            guard let pidValue = info[kCGWindowOwnerPID as String] as? NSNumber,
                  codexPIDs.contains(pid_t(pidValue.int32Value)),
                  let bounds = info[kCGWindowBounds as String] as? [String: Any],
                  let x = (bounds["X"] as? NSNumber)?.doubleValue,
                  let y = (bounds["Y"] as? NSNumber)?.doubleValue,
                  let width = (bounds["Width"] as? NSNumber)?.doubleValue,
                  let height = (bounds["Height"] as? NSNumber)?.doubleValue
            else { return nil }

            let frame = CGRect(x: x, y: y, width: width, height: height)
            guard
                  frame.width >= 36, frame.height >= 36,
                  frame.width <= 560, frame.height <= 560
            else { return nil }

            let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1
            let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
            guard alpha > 0.03, layer >= 0 else { return nil }

            let title = (info[kCGWindowName as String] as? String ?? "").lowercased()
            let owner = (info[kCGWindowOwnerName as String] as? String ?? "").lowercased()
            var score = 100
            if title.contains("pet") || title.contains("companion") || title.contains("mascot") { score += 1_000 }
            if owner.contains("chatgpt") { score += 800 }
            if frame.width <= 360 && frame.height <= 360 { score += 260 }
            if layer > 0 { score += 90 }
            score -= Int(frame.width * frame.height / 10_000)
            return PetWindowCandidate(frame: frame, score: score)
        }
        return candidates.max(by: { $0.score < $1.score })?.frame
    }
}

private final class QuotaPanelView: NSView {
    var onRefresh: (() -> Void)?
    private var payload: QuotaPayload?
    private var statusText = "正在连接 Codex…"
    private var isRefreshing = true
    private let isoFormatter = ISO8601DateFormatter()
    private var refreshRect = NSRect.zero

    override var isFlipped: Bool { true }

    func render(payload: QuotaPayload?, status: String, refreshing: Bool) {
        self.payload = payload
        statusText = status
        isRefreshing = refreshing
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        if refreshRect.contains(convert(event.locationInWindow, from: nil)) {
            onRefresh?()
            return
        }
        window?.performDrag(with: event)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let primary = payload?.primary?.remainingPercent
        let mood = moodColor(for: primary)
        let canvas = bounds
        NSGraphicsContext.current?.cgContext.setShouldAntialias(false)

        if payload == nil {
            drawPixelText(isRefreshing ? "[···] CALIBRATING" : "[!] \(statusText)", in: NSRect(x: 5, y: 16, width: canvas.width - 32, height: 16), font: .monospacedSystemFont(ofSize: 10, weight: .bold), color: mood)
        } else {
            drawMetricRow(label: "5H", percent: primary, resetAt: payload?.primary?.resetsAt, y: 2, mood: mood)
            drawMetricRow(label: "7D", percent: payload?.secondary?.remainingPercent, resetAt: payload?.secondary?.resetsAt, y: 25, mood: moodColor(for: payload?.secondary?.remainingPercent))
            drawPixelText("R\(payload?.resetCredits.map(String.init) ?? "—")", in: NSRect(x: canvas.width - 27, y: 2, width: 24, height: 14), font: .monospacedSystemFont(ofSize: 9, weight: .bold), color: .white, alignment: .right)
        }

        refreshRect = NSRect(x: canvas.width - 21, y: 27, width: 18, height: 16)
        drawPixelText(isRefreshing ? "·" : "↻", in: refreshRect, font: .monospacedSystemFont(ofSize: 10, weight: .bold), color: mood, alignment: .right)
    }

    private func drawMetricRow(label: String, percent: Int?, resetAt: String?, y: CGFloat, mood: NSColor) {
        drawPixelText(label, in: NSRect(x: 3, y: y + 2, width: 23, height: 14), font: .monospacedSystemFont(ofSize: 9, weight: .bold), color: .white)
        drawPixelBar(percent: percent, frame: NSRect(x: 28, y: y + 2, width: 136, height: 11), mood: mood)
        drawPixelText(percent.map { "\($0)%" } ?? "—", in: NSRect(x: 170, y: y + 1, width: 39, height: 14), font: .monospacedDigitSystemFont(ofSize: 10, weight: .bold), color: .white)
        drawPixelText(countdown(to: resetAt), in: NSRect(x: 211, y: y + 1, width: 66, height: 14), font: .monospacedDigitSystemFont(ofSize: 9, weight: .bold), color: mood, alignment: .right)
    }

    private func drawPixelBar(percent: Int?, frame: NSRect, mood: NSColor) {
        let blocks = 10
        let gap: CGFloat = 2
        let blockWidth = floor((frame.width - CGFloat(blocks - 1) * gap) / CGFloat(blocks))
        let filled = Int(ceil(CGFloat(max(0, min(100, percent ?? 0))) / 100 * CGFloat(blocks)))
        for index in 0..<blocks {
            let x = frame.minX + CGFloat(index) * (blockWidth + gap)
            let shadowRect = NSRect(x: x - 1, y: frame.minY - 1, width: blockWidth + 2, height: frame.height + 2)
            NSColor.black.withAlphaComponent(0.76).setFill()
            NSBezierPath(rect: shadowRect).fill()
            let block = NSRect(x: x, y: frame.minY, width: blockWidth, height: frame.height)
            (index < filled ? mood : NSColor.white.withAlphaComponent(0.22)).setFill()
            NSBezierPath(rect: block).fill()
            if index < filled {
                NSColor.white.withAlphaComponent(0.26).setFill()
                NSBezierPath(rect: NSRect(x: x + 1, y: frame.minY + 1, width: max(1, blockWidth - 2), height: 2)).fill()
            }
        }
    }

    private func moodColor(for remaining: Int?) -> NSColor {
        guard let remaining else { return NSColor(calibratedWhite: 0.55, alpha: 1) }
        switch remaining {
        case 70...100: return NSColor(calibratedRed: 0.72, green: 0.86, blue: 0.57, alpha: 1)
        case 45...69: return NSColor(calibratedRed: 0.49, green: 0.80, blue: 0.74, alpha: 1)
        case 21...44: return NSColor(calibratedRed: 0.92, green: 0.67, blue: 0.36, alpha: 1)
        case 6...20: return NSColor(calibratedRed: 0.94, green: 0.43, blue: 0.31, alpha: 1)
        default: return NSColor(calibratedRed: 0.77, green: 0.30, blue: 0.38, alpha: 1)
        }
    }

    private func countdown(to dateString: String?) -> String {
        guard let dateString, let date = isoFormatter.date(from: dateString) else { return "等待信号" }
        let seconds = max(0, Int(date.timeIntervalSinceNow))
        let days = seconds / 86_400
        let hours = (seconds % 86_400) / 3_600
        let minutes = (seconds % 3_600) / 60
        if days > 0 { return "\(days)天 \(hours)时" }
        return String(format: "%02d:%02d", hours, minutes)
    }

    private func drawText(_ text: String, in rect: NSRect, font: NSFont, color: NSColor, alignment: NSTextAlignment = .left, spacing: CGFloat = 0) {
        let style = NSMutableParagraphStyle()
        style.alignment = alignment
        style.lineBreakMode = .byTruncatingTail
        (text as NSString).draw(in: rect, withAttributes: [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style,
            .kern: spacing,
        ])
    }

    private func drawPixelText(_ text: String, in rect: NSRect, font: NSFont, color: NSColor, alignment: NSTextAlignment = .left) {
        drawText(text, in: rect.offsetBy(dx: 2, dy: 2), font: font, color: .black.withAlphaComponent(0.92), alignment: alignment)
        drawText(text, in: rect, font: font, color: color, alignment: alignment)
    }
}

private final class LocalQuotaBridge {
    func refresh(completion: @escaping (Result<QuotaPayload, Error>) -> Void) {
        let url = URL(string: "http://127.0.0.1:4319/api/quota?force=1")!
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        URLSession.shared.dataTask(with: request) { data, _, error in
            if let error { completion(.failure(error)); return }
            guard let data else {
                completion(.failure(NSError(domain: "QuotaTide", code: 1, userInfo: [NSLocalizedDescriptionKey: "本机额度服务没有返回数据。"])))
                return
            }
            do { completion(.success(try JSONDecoder().decode(QuotaPayload.self, from: data))) }
            catch { completion(.failure(error)) }
        }.resume()
    }
}

private final class AppDelegate: NSObject, NSApplicationDelegate {
    private let panel = CompanionPanel(contentRect: NSRect(x: 0, y: 0, width: 310, height: 48), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    private let panelView = QuotaPanelView(frame: NSRect(x: 0, y: 0, width: 310, height: 48))
    private let tracker = CodexPetTracker()
    private let bridge = LocalQuotaBridge()
    private var isTracking = true
    private var isPanelShown = false
    private var positionTimer: Timer?
    private var refreshTimer: Timer?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.contentView = panelView
        panelView.onRefresh = { [weak self] in self?.refreshQuota() }
        centerPanel()
        panel.alphaValue = 0
        panel.orderOut(nil)
        configureMenu()
        refreshQuota()
        positionTimer = Timer.scheduledTimer(timeInterval: 0.12, target: self, selector: #selector(followPet), userInfo: nil, repeats: true)
        refreshTimer = Timer.scheduledTimer(timeInterval: 15, target: self, selector: #selector(refreshQuota), userInfo: nil, repeats: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        positionTimer?.invalidate()
        refreshTimer?.invalidate()
    }

    @objc private func refreshQuota() {
        panelView.render(payload: nil, status: "正在校准 Codex 额度…", refreshing: true)
        bridge.refresh { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                switch result {
                case .success(let payload) where payload.available:
                    self.panelView.render(payload: payload, status: "", refreshing: false)
                case .success(let payload):
                    self.panelView.render(payload: nil, status: payload.message ?? "暂时无法读取额度。", refreshing: false)
                case .failure:
                    self.panelView.render(payload: nil, status: "等候 Codex 服务；点击右上角重试。", refreshing: false)
                }
            }
        }
    }

    @objc private func followPet() {
        guard isTracking, let quartzFrame = tracker.locatePet(), let screen = NSScreen.main else {
            setPanelShown(false)
            return
        }
        let petFrame = CGRect(x: quartzFrame.minX, y: screen.frame.maxY - quartzFrame.maxY, width: quartzFrame.width, height: quartzFrame.height)
        attachPanel(to: petFrame)
        let pointer = NSEvent.mouseLocation
        let hoveringPet = petFrame.insetBy(dx: -2, dy: -2).contains(pointer)
        let hoveringPanel = panel.frame.insetBy(dx: -2, dy: -2).contains(pointer)
        setPanelShown(hoveringPet || hoveringPanel)
    }

    private func attachPanel(to petFrame: CGRect) {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame
        let size = panel.frame.size
        var x = petFrame.midX - size.width / 2
        var y = petFrame.minY - size.height - 2
        if y < visible.minY + 2 { y = petFrame.maxY + 2 }
        x = min(max(x, visible.minX + 3), visible.maxX - size.width - 3)
        y = min(max(y, visible.minY + 3), visible.maxY - size.height - 3)
        panel.setFrameOrigin(NSPoint(x: x, y: y))
    }

    private func setPanelShown(_ shouldShow: Bool) {
        guard shouldShow != isPanelShown else { return }
        isPanelShown = shouldShow
        if shouldShow {
            panel.alphaValue = 0
            panel.orderFrontRegardless()
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.11
                panel.animator().alphaValue = 1
            }
        } else {
            NSAnimationContext.runAnimationGroup({ context in
                context.duration = 0.11
                panel.animator().alphaValue = 0
            }, completionHandler: { [weak self] in
                guard let self, !self.isPanelShown else { return }
                self.panel.orderOut(nil)
            })
        }
    }

    private func centerPanel() {
        guard let visible = NSScreen.main?.visibleFrame else { return }
        panel.setFrameOrigin(NSPoint(x: visible.midX - panel.frame.width / 2, y: visible.minY + 84))
    }

    private func configureMenu() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "✦"
        item.button?.toolTip = "Quota Tide"
        let menu = NSMenu()
        menu.addItem(withTitle: "立即刷新额度", action: #selector(refreshQuota), keyEquivalent: "r")
        menu.addItem(withTitle: "重新贴合 Codex 宠物", action: #selector(resumeTracking), keyEquivalent: "f")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "暂停跟随", action: #selector(toggleTracking), keyEquivalent: "t")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "退出 Quota Tide", action: #selector(quit), keyEquivalent: "q")
        item.menu = menu
        statusItem = item
    }

    @objc private func resumeTracking() {
        isTracking = true
        followPet()
    }

    @objc private func toggleTracking(_ sender: NSMenuItem) {
        isTracking.toggle()
        if !isTracking { setPanelShown(false) }
        sender.title = isTracking ? "暂停跟随" : "继续跟随"
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}

let application = NSApplication.shared
private let applicationDelegate = AppDelegate()
application.delegate = applicationDelegate
application.run()
