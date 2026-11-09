require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# The CI compile check also builds without MediaPipe (FORM_POSE_MEDIAPIPE=0), so a MediaPipe link
# problem can be told apart from a VisionCamera one. App builds always include it.
with_mediapipe = ENV["FORM_POSE_MEDIAPIPE"] != "0"

Pod::Spec.new do |s|
  s.name          = "FormPose"
  s.version       = package["version"]
  s.summary       = package["description"]
  s.homepage      = package["homepage"]
  s.license       = package["license"]
  s.authors       = package["author"]
  s.platforms     = { :ios => "17.0" }
  s.source        = { :git => "https://github.com/Gavyn-Nygren/workout-tracker.git" }
  s.swift_version = "5.0"
  s.static_framework = true

  s.source_files = ["ios/**/*.swift"]
  s.frameworks = ["AVFoundation", "CoreMedia", "Vision"]
  # The MediaPipe models, looked up by FormPoseModels in MediaPipeRunner.swift.
  s.resource_bundles = { "FormPoseModels" => ["ios/models/*.task"] }

  load "nitrogen/generated/ios/FormPose+autolinking.rb"
  add_nitrogen_files(s)

  s.dependency "VisionCamera"
  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  # 1.0.0 is the last MediaPipe release on CocoaPods trunk, which goes read-only in December 2026.
  s.dependency "MediaPipeTasksVision", "1.0.0" if with_mediapipe
  install_modules_dependencies(s)
end
