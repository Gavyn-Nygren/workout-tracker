//
//  VisionRunner.swift
//  FormPose
//
//  Apple Vision's body pose (VNDetectHumanBodyPoseRequest), the fallback engine. It has 19 joints
//  and none below the ankle, so heels and toes stay empty (visibility 0). Its joints are written
//  into MediaPipe's 33 slots, so the JS side reads both engines the same way.
//

import CoreMedia
import Foundation
import ImageIO
import UIKit
import Vision

final class VisionRunner: PoseRunner {
  /// Vision picks its own hardware (CPU, GPU or Neural Engine); this only fills the result field.
  let delegateActive: PoseDelegate = .cpu
  private let request = VNDetectHumanBodyPoseRequest()
  /// The centre of the person picked last frame, to stay on them (Vision doesn't track).
  private var lastCentre: CGPoint?

  /// Vision joint → MediaPipe landmark index. Both name sides from the person's point of view.
  private static let slots: [(VNHumanBodyPoseObservation.JointName, Int)] = [
    (.nose, 0), (.leftEye, 2), (.rightEye, 5), (.leftEar, 7), (.rightEar, 8),
    (.leftShoulder, 11), (.rightShoulder, 12), (.leftElbow, 13), (.rightElbow, 14),
    (.leftWrist, 15), (.rightWrist, 16), (.leftHip, 23), (.rightHip, 24),
    (.leftKnee, 25), (.rightKnee, 26), (.leftAnkle, 27), (.rightAnkle, 28),
  ]

  func detect(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation, timestampMs: Double) throws -> PoseOutput {
    let handler = VNImageRequestHandler(cmSampleBuffer: sampleBuffer, orientation: CGImagePropertyOrientation(formPose: orientation), options: [:])
    try handler.perform([request])
    guard let observation = pick(request.results ?? []) else {
      lastCentre = nil
      return .none
    }
    let points = try observation.recognizedPoints(.all)
    var landmarks = [Double](repeating: 0, count: 33 * 5)
    for (joint, slot) in VisionRunner.slots {
      guard let point = points[joint], point.confidence > 0 else { continue }
      // Vision's origin is the bottom-left corner; MediaPipe's (and the overlay's) is the top-left.
      landmarks[slot * 5] = Double(point.location.x)
      landmarks[slot * 5 + 1] = 1 - Double(point.location.y)
      landmarks[slot * 5 + 3] = Double(point.confidence)
      landmarks[slot * 5 + 4] = Double(point.confidence)
    }
    return PoseOutput(found: true, landmarks: landmarks, world: [])
  }
}

extension VisionRunner {
  /// Vision returns one observation per person, in no set order. Stay on the person closest to last
  /// frame's pick; otherwise take the biggest (the lifter is usually nearest the camera).
  fileprivate func pick(_ observations: [VNHumanBodyPoseObservation]) -> VNHumanBodyPoseObservation? {
    var best: (observation: VNHumanBodyPoseObservation, score: Double, centre: CGPoint)?
    for observation in observations {
      guard let points = try? observation.recognizedPoints(.all) else { continue }
      let seen = points.values.filter { $0.confidence > 0.1 }.map { $0.location }
      guard seen.count >= 4, let minX = seen.map({ $0.x }).min(), let maxX = seen.map({ $0.x }).max(),
        let minY = seen.map({ $0.y }).min(), let maxY = seen.map({ $0.y }).max()
      else { continue }
      let centre = CGPoint(x: (minX + maxX) / 2, y: (minY + maxY) / 2)
      let score: Double
      if let last = lastCentre {
        score = -Double(hypot(centre.x - last.x, centre.y - last.y))
      } else {
        score = Double((maxX - minX) * (maxY - minY))
      }
      if best == nil || score > best!.score { best = (observation, score, centre) }
    }
    lastCentre = best?.centre
    return best?.observation
  }
}

extension CGImagePropertyOrientation {
  init(formPose orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
