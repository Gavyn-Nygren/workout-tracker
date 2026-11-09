//
//  MediaPipeRunner.swift
//  FormPose
//
//  MediaPipe Pose Landmarker in VIDEO mode: one person, 33 landmarks including heels and toes.
//  The CI compile check also builds without MediaPipe (FORM_POSE_MEDIAPIPE=0), so this file
//  compiles to just the model lookup when the pod isn't there.
//

import CoreMedia
import Foundation
import NitroModules
import UIKit

#if canImport(MediaPipeTasksVision)

  import MediaPipeTasksVision

  final class MediaPipeRunner: PoseRunner {
    let delegateActive: PoseDelegate
    private let landmarker: PoseLandmarker
    private var lastTimestampMs = -1

    init(model: PoseModel, delegate: PoseDelegate, minConfidence: Float) throws {
      let path = try FormPoseModels.path(for: model)
      let wantsGPU: Bool
      switch delegate {
      case .gpu: wantsGPU = true
      case .cpu: wantsGPU = false
      }
      // A GPU that fails to start falls back to the CPU; delegateActive reports which one runs.
      if wantsGPU, let gpu = try? MediaPipeRunner.make(path: path, delegate: .GPU, minConfidence: minConfidence) {
        landmarker = gpu
        delegateActive = .gpu
      } else {
        landmarker = try MediaPipeRunner.make(path: path, delegate: .CPU, minConfidence: minConfidence)
        delegateActive = .cpu
      }
    }

    private static func make(path: String, delegate: Delegate, minConfidence: Float) throws -> PoseLandmarker {
      let options = PoseLandmarkerOptions()
      options.baseOptions.modelAssetPath = path
      options.baseOptions.delegate = delegate
      options.runningMode = .video
      options.numPoses = 1
      options.minPoseDetectionConfidence = minConfidence
      options.minPosePresenceConfidence = minConfidence
      options.minTrackingConfidence = minConfidence
      options.shouldOutputSegmentationMasks = false
      return try PoseLandmarker(options: options)
    }

    func detect(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation, timestampMs: Double) throws -> PoseOutput {
      if let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
        let format = CVPixelBufferGetPixelFormatType(pixelBuffer)
        if format != kCVPixelFormatType_32BGRA {
          throw RuntimeError.error(withMessage: "MediaPipe needs BGRA frames (pixel format 'rgb'), got \(fourCC(format))")
        }
      }
      let image = try MPImage(sampleBuffer: sampleBuffer, orientation: orientation)
      // VIDEO mode needs strictly increasing timestamps.
      var timestamp = Int(timestampMs.rounded())
      if timestamp <= lastTimestampMs { timestamp = lastTimestampMs + 1 }
      lastTimestampMs = timestamp

      let result = try landmarker.detect(videoFrame: image, timestampInMilliseconds: timestamp)
      guard let pose = result.landmarks.first, pose.count >= 33 else { return .none }
      var landmarks = [Double]()
      landmarks.reserveCapacity(33 * 5)
      for point in pose.prefix(33) {
        landmarks.append(Double(point.x))
        landmarks.append(Double(point.y))
        landmarks.append(Double(point.z))
        landmarks.append(point.visibility?.doubleValue ?? 0)
        landmarks.append(point.presence?.doubleValue ?? 0)
      }
      var world = [Double]()
      if let worldPose = result.worldLandmarks.first, worldPose.count >= 33 {
        world.reserveCapacity(33 * 3)
        for point in worldPose.prefix(33) {
          world.append(Double(point.x))
          world.append(Double(point.y))
          world.append(Double(point.z))
        }
      }
      return PoseOutput(found: true, landmarks: landmarks, world: world)
    }
  }

  private func fourCC(_ code: OSType) -> String {
    let bytes = [24, 16, 8, 0].map { UInt8((code >> $0) & 0xFF) }
    let text = String(bytes: bytes, encoding: .ascii) ?? ""
    return text.allSatisfy({ $0.isASCII && !$0.isNewline }) && text.count == 4 ? "'\(text)'" : "\(code)"
  }

#endif

/// The bundled .task models (ios/models, copied into the FormPoseModels resource bundle).
enum FormPoseModels {
  static func fileName(for model: PoseModel) -> String {
    switch model {
    case .lite: return "pose_landmarker_lite"
    case .full: return "pose_landmarker_full"
    case .heavy: return "pose_landmarker_heavy"
    }
  }

  static func path(for model: PoseModel) throws -> String {
    let name = fileName(for: model)
    for bundle in [Bundle(for: HybridFormPose.self), Bundle.main] {
      if let url = bundle.url(forResource: "FormPoseModels", withExtension: "bundle"),
        let resources = Bundle(url: url),
        let path = resources.path(forResource: name, ofType: "task")
      {
        return path
      }
      if let path = bundle.path(forResource: name, ofType: "task") {
        return path
      }
    }
    throw RuntimeError.error(withMessage: "The model \(name).task isn't in the app")
  }
}
