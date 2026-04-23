// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "ImageSplitter",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "ImageSplitterCore",
            targets: ["ImageSplitterCore"]
        ),
        .executable(
            name: "ImageSplitter",
            targets: ["ImageSplitterApp"]
        )
    ],
    targets: [
        .target(
            name: "ImageSplitterCore"
        ),
        .executableTarget(
            name: "ImageSplitterApp",
            dependencies: ["ImageSplitterCore"]
        )
    ]
)
