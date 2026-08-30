import AppKit
import CoreGraphics

let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
print("visible-window-count=\(windows.count)")

for info in windows {
    let owner = info[kCGWindowOwnerName as String] as? String ?? ""
    let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.intValue ?? -1
    let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? -1
    let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? -1
    let bounds = info[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let x = (bounds["X"] as? NSNumber)?.doubleValue ?? -1
    let y = (bounds["Y"] as? NSNumber)?.doubleValue ?? -1
    let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? -1
    let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? -1
    print("owner=\(owner) pid=\(pid) layer=\(layer) alpha=\(alpha) frame=\(Int(x)),\(Int(y)),\(Int(width)),\(Int(height))")
}
