import Foundation
import CoreGraphics
import ApplicationServices

// 这个 helper 只监听 button-down 事件，并以 {"at": epoch_ms} 输出。
// 坐标、窗口、应用名和设备信息均不会离开系统事件回调。

if !AXIsProcessTrusted() {
    fputs("Goule mouse collector requires Accessibility permission.\n", stderr)
    exit(2)
}

let eventMask =
    (CGEventMask(1) << CGEventType.leftMouseDown.rawValue) |
    (CGEventMask(1) << CGEventType.rightMouseDown.rawValue) |
    (CGEventMask(1) << CGEventType.otherMouseDown.rawValue)

var eventTap: CFMachPort?
let callback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let eventTap {
            CGEvent.tapEnable(tap: eventTap, enable: true)
        }
        return Unmanaged.passUnretained(event)
    }

    if type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown {
        let at = Int(Date().timeIntervalSince1970 * 1000)
        let line = "{\"at\":\(at)}\n"
        FileHandle.standardOutput.write(Data(line.utf8))
    }
    return Unmanaged.passUnretained(event)
}

guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .tailAppendEventTap,
    options: .listenOnly,
    eventsOfInterest: eventMask,
    callback: callback,
    userInfo: nil
) else {
    fputs("Unable to create CGEventTap. Check Accessibility permission.\n", stderr)
    exit(2)
}
eventTap = tap

guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else {
    fputs("Unable to create event tap run-loop source.\n", stderr)
    exit(3)
}

let runLoop = CFRunLoopGetCurrent()
CFRunLoopAddSource(runLoop, source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()
