//
//  HybridFormPose.swift
//  FormPose
//
//  The form camera's pose plugin (roadmap G4.2). The JS side is src/specs/FormPose.nitro.ts.
//  configure() runs on the JS thread and detect() on the camera thread, so the engine is swapped
//  under a lock. detect() never throws: an error thrown inside a frame processor stops a release
//  build, so every failure comes back in PoseResult.error instead.
//

import AVFoundation
import CoreMedia
import Foundation
import NitroModules
import QuartzCore
import UIKit
import VisionCamera
import os

final class HybridFormPose: HybridFormPoseSpec {
  private let lock = NSLock()
  private var runner: PoseRunner?
  private var lastConfig: PoseConfig?
  private var orientationMode: PoseOrientationMode = .frame
  private var seq: Double = 0

  var hostTimeMs: Double {
    return CACurrentMediaTime() * 1000
  }

  func configure(config: PoseConfig) throws -> PoseConfigureResult {
    let start = CACurrentMediaTime()
    do {
      // Build the new engine outside the lock (loading a model takes a while), then swap it in.
      let next = try makeRunner(config)
      lock.lock()
      runner = next
      lastConfig = config
      orientationMode = config.orientationMode
      lock.unlock()
      return PoseConfigureResult(ok: true, error: nil, delegateActive: next.delegateActive, loadMs: (CACurrentMediaTime() - start) * 1000)
    } catch {
      lock.lock()
      runner = nil
      lock.unlock()
      return PoseConfigureResult(ok: false, error: describe(error), delegateActive: .cpu, loadMs: (CACurrentMediaTime() - start) * 1000)
    }
  }

  func detect(frame: any HybridFrameSpec) throws -> PoseResult {
    let entryMs = CACurrentMediaTime() * 1000
    lock.lock()
    defer { lock.unlock() }
    seq += 1

    guard let runner = runner else {
      return failure("Not configured", entryMs: entryMs, frameMs: entryMs)
    }
    guard let nativeFrame = frame as? any NativeFrame, let sampleBuffer = nativeFrame.sampleBuffer else {
      return failure("The frame has no sample buffer", entryMs: entryMs, frameMs: entryMs)
    }
    let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    let frameMs = pts.isNumeric ? pts.seconds * 1000 : entryMs
    var width = 0.0
    var height = 0.0
    if let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
      width = Double(CVPixelBufferGetWidth(pixelBuffer))
      height = Double(CVPixelBufferGetHeight(pixelBuffer))
    }
    // Mirroring is left to the JS overlay: the engines get only the rotation.
    let orientation: UIImage.Orientation
    switch orientationMode {
    case .frame: orientation = frame.orientation.formPoseImageOrientation(swapped: false)
    case .frameSwapped: orientation = frame.orientation.formPoseImageOrientation(swapped: true)
    case .raw: orientation = .up
    }
    let count = seq

    return autoreleasepool { () -> PoseResult in
      do {
        let start = CACurrentMediaTime()
        let output = try runner.detect(sampleBuffer: sampleBuffer, orientation: orientation, timestampMs: frameMs)
        let end = CACurrentMediaTime()
        return PoseResult(
          ok: true, error: nil, poseFound: output.found, seq: count,
          frameMs: frameMs, entryMs: entryMs, resultMs: end * 1000, inferMs: (end - start) * 1000,
          bufferWidth: width, bufferHeight: height, landmarks: output.landmarks, world: output.world)
      } catch {
        let end = CACurrentMediaTime()
        return PoseResult(
          ok: false, error: describe(error), poseFound: false, seq: count,
          frameMs: frameMs, entryMs: entryMs, resultMs: end * 1000, inferMs: 0,
          bufferWidth: width, bufferHeight: height, landmarks: [], world: [])
      }
    }
  }

  func reset() throws {
    lock.lock()
    let config = lastConfig
    lock.unlock()
    if let config = config {
      _ = try configure(config: config)
    }
  }

  func perfSnapshot(cameraPosition: String) throws -> PerfSnapshot {
    let info = ProcessInfo.processInfo
    let thermal: Double
    switch info.thermalState {
    case .nominal: thermal = 0
    case .fair: thermal = 1
    case .serious: thermal = 2
    case .critical: thermal = 3
    @unknown default: thermal = -1
    }
    let position: AVCaptureDevice.Position = cameraPosition == "front" ? .front : .back
    let pressure = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)?.systemPressureState.level.rawValue ?? "unknown"
    return PerfSnapshot(
      hostMs: CACurrentMediaTime() * 1000,
      thermalState: thermal,
      lowPowerMode: info.isLowPowerModeEnabled,
      cpuSeconds: cpuSeconds(),
      footprintMB: footprintMB(),
      availableMB: Double(os_proc_available_memory()) / 1_048_576,
      pressureLevel: pressure)
  }

  // MARK: - Helpers

  private func makeRunner(_ config: PoseConfig) throws -> PoseRunner {
    switch config.engine {
    case .vision:
      return VisionRunner()
    case .mediapipe:
      #if canImport(MediaPipeTasksVision)
        let minConfidence = Float(min(max(config.minConfidence, 0), 1))
        return try MediaPipeRunner(model: config.model, delegate: config.delegate, minConfidence: minConfidence)
      #else
        throw RuntimeError.error(withMessage: "This build was made without MediaPipe")
      #endif
    }
  }

  private func failure(_ message: String, entryMs: Double, frameMs: Double) -> PoseResult {
    return PoseResult(
      ok: false, error: message, poseFound: false, seq: seq,
      frameMs: frameMs, entryMs: entryMs, resultMs: entryMs, inferMs: 0,
      bufferWidth: 0, bufferHeight: 0, landmarks: [], world: [])
  }

  private func describe(_ error: Error) -> String {
    let nsError = error as NSError
    return "\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)"
  }

  /// The app's CPU time so far, user plus system.
  private func cpuSeconds() -> Double {
    var usage = rusage()
    guard getrusage(RUSAGE_SELF, &usage) == 0 else { return -1 }
    let user = Double(usage.ru_utime.tv_sec) + Double(usage.ru_utime.tv_usec) / 1_000_000
    let system = Double(usage.ru_stime.tv_sec) + Double(usage.ru_stime.tv_usec) / 1_000_000
    return user + system
  }

  /// The memory iOS charges the app for (what Xcode's memory gauge shows).
  private func footprintMB() -> Double {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), rebound, &count)
      }
    }
    return result == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576 : -1
  }
}

/// What an engine found in one frame.
struct PoseOutput {
  let found: Bool
  /// 33 × [x, y, z, visibility, presence], in MediaPipe's landmark order.
  let landmarks: [Double]
  /// 33 × [x, y, z] in metres, or empty.
  let world: [Double]

  static let none = PoseOutput(found: false, landmarks: [], world: [])
}

protocol PoseRunner: AnyObject {
  var delegateActive: PoseDelegate { get }
  func detect(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation, timestampMs: Double) throws -> PoseOutput
}

extension CameraOrientation {
  /// The UIImage orientation the engines expect, without mirroring (the overlay mirrors in JS).
  ///
  /// The labels mean opposite turns. VisionCamera's 'left' says the scene's top runs along the
  /// buffer's left edge (FrameCoordinateSystemConverter turns it clockwise to stand it up), which
  /// UIImage and EXIF call .right (EXIF 6, the back camera held upright). `swapped` hands over the
  /// other quarter turn instead, for checking on the phone without a new build.
  func formPoseImageOrientation(swapped: Bool) -> UIImage.Orientation {
    switch self {
    case .up: return .up
    case .down: return .down
    case .left: return swapped ? .left : .right
    case .right: return swapped ? .right : .left
    }
  }
}
