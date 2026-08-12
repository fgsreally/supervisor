import Foundation
import UIKit
import AVFoundation
import Capacitor

@objc(SupervisorNativePlugin)
public class SupervisorNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SupervisorNativePlugin"
    public let jsName = "SupervisorNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPushToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBackgroundConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBackgroundConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateBackgroundConnection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLiveStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateLiveStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endLiveStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAndroidLiveUpdatesAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isOppoLiveUpdatesAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanQrCode", returnType: CAPPluginReturnPromise),
    ]

    private var scanCall: CAPPluginCall?

    @objc func getPushToken(_ call: CAPPluginCall) {
        call.resolve([
            "token": NSNull(),
            "platform": "ios",
        ])
    }

    @objc func getPendingShare(_ call: CAPPluginCall) {
        call.resolve(NSNull())
    }

    @objc func clearPendingShare(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func startBackgroundConnection(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func stopBackgroundConnection(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func updateBackgroundConnection(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func startLiveStatus(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            LiveActivityManager.shared.start(from: call)
        }
        call.resolve()
    }

    @objc func updateLiveStatus(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            LiveActivityManager.shared.update(from: call)
        }
        call.resolve()
    }

    @objc func endLiveStatus(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            LiveActivityManager.shared.end(sessionId: call.getString("sessionId"))
        }
        call.resolve()
    }

    @objc func isAndroidLiveUpdatesAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": false,
            "promoted": false,
            "reason": "ios",
        ])
    }

    @objc func isOppoLiveUpdatesAvailable(_ call: CAPPluginCall) {
        isAndroidLiveUpdatesAvailable(call)
    }

    @objc func scanQrCode(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.presentQrScanner(call)
        }
    }

    private func presentQrScanner(_ call: CAPPluginCall) {
        guard let bridge = self.bridge else {
            call.reject("bridge unavailable")
            return
        }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted {
                        self.presentQrScanner(call)
                    } else {
                        call.reject("需要相机权限才能扫码")
                    }
                }
            }
            return
        default:
            call.reject("需要相机权限才能扫码")
            return
        }

        let scanner = QrScannerViewController()
        scanner.modalPresentationStyle = .fullScreen
        scanner.onResult = { [weak self] value in
            guard let self else { return }
            self.scanCall = nil
            if let value, !value.isEmpty {
                call.resolve(["value": value])
            } else {
                call.reject("cancelled")
            }
        }
        self.scanCall = call
        bridge.viewController?.present(scanner, animated: true)
    }
}

private final class QrScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onResult: ((String?) -> Void)?

    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input)
        else {
            finish(nil)
            return
        }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            finish(nil)
            return
        }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        if output.availableMetadataObjectTypes.contains(.qr) {
            output.metadataObjectTypes = [.qr]
        }

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)
        previewLayer = preview

        let close = UIButton(type: .system)
        close.setTitle("取消", for: .normal)
        close.setTitleColor(.white, for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 17, weight: .medium)
        close.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(close)
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            close.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
        ])

        let hint = UILabel()
        hint.text = "扫描电脑端 Supervisor 二维码"
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 15, weight: .medium)
        hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint)
        NSLayoutConstraint.activate([
            hint.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hint.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -28),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            session.stopRunning()
        }
    }

    @objc private func cancelTapped() {
        finish(nil)
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !finished,
              let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              object.type == .qr,
              let value = object.stringValue
        else { return }
        finish(value)
    }

    private func finish(_ value: String?) {
        guard !finished else { return }
        finished = true
        if session.isRunning {
            session.stopRunning()
        }
        dismiss(animated: true) { [weak self] in
            self?.onResult?(value)
        }
    }
}
