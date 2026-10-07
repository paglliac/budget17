// swift-tools-version: 6.2
// Checks the app on a Mac without Xcode (make ios-check): type-checks its sources and decodes the server's JSON with its
// models. The app itself is built from Budget.xcodeproj.
import PackageDescription

let package = Package(
    name: "Budget",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Budget",
            path: ".",
            exclude: ["Budget/Assets.xcassets"],
            sources: ["Budget", "Shared"],
            swiftSettings: [.defaultIsolation(MainActor.self)]
        ),
        .executableTarget(name: "FixtureCheck", path: "FixtureCheck", swiftSettings: [.defaultIsolation(MainActor.self)]),
    ]
)
