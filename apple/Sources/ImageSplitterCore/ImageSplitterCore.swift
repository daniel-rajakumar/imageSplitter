import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

public struct ImageSource {
    public let cgImage: CGImage
    public let displayName: String

    public var pixelWidth: Int { cgImage.width }
    public var pixelHeight: Int { cgImage.height }
    public var pixelSize: CGSize {
        CGSize(width: cgImage.width, height: cgImage.height)
    }

    public init(cgImage: CGImage, displayName: String) {
        self.cgImage = cgImage
        self.displayName = displayName
    }
}

public struct ImageTile: Identifiable {
    public let id = UUID()
    public let row: Int
    public let column: Int
    public let cgImage: CGImage
    public let pixelWidth: Int
    public let pixelHeight: Int
    public let pngData: Data
}

public struct PixelRect: Equatable {
    public let x: Int
    public let y: Int
    public let width: Int
    public let height: Int
    public let offset: CGSize

    public init(x: Int, y: Int, width: Int, height: Int, offset: CGSize = .zero) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.offset = offset
    }
}

public struct TileSplitResult {
    public let cropRect: PixelRect
    public let clampedOffset: CGSize
    public let tiles: [ImageTile]
}

public enum ImageSplitterError: Error {
    case invalidImage
    case cropFailed
    case pngEncodingFailed
    case rotationFailed
}

public enum ImageSplitterEngine {
    private static let instagramTileWidth = 3
    private static let instagramTileHeight = 4

    public static func split(
        source: ImageSource,
        rows: Int,
        columns: Int,
        zoomScale: Double,
        cropOffset: CGSize
    ) throws -> TileSplitResult {
        let rows = max(1, rows)
        let columns = max(1, columns)
        let cropLayout = makeInstagramCropLayout(
            imageWidth: source.pixelWidth,
            imageHeight: source.pixelHeight,
            rows: rows,
            columns: columns
        )
        let cropRect = cropLayout.cropRect(
            zoomScale: zoomScale,
            requestedOffset: cropOffset
        )
        var tiles: [ImageTile] = []

        for row in 0..<rows {
            let top = cropRect.y + cropRect.height * row / rows
            let bottom = cropRect.y + cropRect.height * (row + 1) / rows
            let tileHeight = bottom - top

            for column in 0..<columns {
                let left = cropRect.x + cropRect.width * column / columns
                let right = cropRect.x + cropRect.width * (column + 1) / columns
                let tileWidth = right - left
                let crop = CGRect(x: left, y: top, width: tileWidth, height: tileHeight)

                guard let tileImage = source.cgImage.cropping(to: crop) else {
                    throw ImageSplitterError.cropFailed
                }

                guard let pngData = pngData(from: tileImage) else {
                    throw ImageSplitterError.pngEncodingFailed
                }

                tiles.append(
                    ImageTile(
                        row: row,
                        column: column,
                        cgImage: tileImage,
                        pixelWidth: tileWidth,
                        pixelHeight: tileHeight,
                        pngData: pngData
                    )
                )
            }
        }

        return TileSplitResult(
            cropRect: cropRect,
            clampedOffset: cropRect.offset,
            tiles: tiles
        )
    }

    public static func rotated(_ source: ImageSource, clockwise: Bool) throws -> ImageSource {
        guard let rotatedImage = rotate(source.cgImage, clockwise: clockwise) else {
            throw ImageSplitterError.rotationFailed
        }

        return ImageSource(cgImage: rotatedImage, displayName: source.displayName)
    }

    private static func makeInstagramCropLayout(imageWidth: Int, imageHeight: Int, rows: Int, columns: Int) -> InstagramCropLayout {
        let targetAspect = Double(columns * instagramTileWidth) / Double(rows * instagramTileHeight)
        let sourceAspect = Double(imageWidth) / Double(imageHeight)

        if sourceAspect > targetAspect {
            let baseHeight = Double(imageHeight)
            let baseWidth = baseHeight * targetAspect
            return InstagramCropLayout(
                imageWidth: imageWidth,
                imageHeight: imageHeight,
                baseWidth: baseWidth,
                baseHeight: baseHeight
            )
        }

        let baseWidth = Double(imageWidth)
        let baseHeight = baseWidth / targetAspect
        return InstagramCropLayout(
            imageWidth: imageWidth,
            imageHeight: imageHeight,
            baseWidth: baseWidth,
            baseHeight: baseHeight
        )
    }

    private static func pngData(from image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
            return nil
        }

        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            return nil
        }

        return data as Data
    }

    private static func rotate(_ image: CGImage, clockwise: Bool) -> CGImage? {
        let newWidth = image.height
        let newHeight = image.width
        let colorSpace = image.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue

        guard let context = CGContext(
            data: nil,
            width: newWidth,
            height: newHeight,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else {
            return nil
        }

        context.interpolationQuality = .high

        if clockwise {
            context.translateBy(x: CGFloat(newWidth), y: 0)
            context.rotate(by: .pi / 2)
        } else {
            context.translateBy(x: 0, y: CGFloat(newHeight))
            context.rotate(by: -.pi / 2)
        }

        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return context.makeImage()
    }
}

private struct InstagramCropLayout {
    let imageWidth: Int
    let imageHeight: Int
    let baseWidth: Double
    let baseHeight: Double

    func cropRect(zoomScale: Double, requestedOffset: CGSize) -> PixelRect {
        let normalizedZoom = min(max(zoomScale, 1), 4)
        let scaledWidth = max(1, baseWidth / normalizedZoom)
        let scaledHeight = max(1, baseHeight / normalizedZoom)

        let maxOffsetX = max(0, (Double(imageWidth) - scaledWidth) / 2)
        let maxOffsetY = max(0, (Double(imageHeight) - scaledHeight) / 2)
        let clampedOffsetX = min(max(Double(requestedOffset.width), -maxOffsetX), maxOffsetX)
        let clampedOffsetY = min(max(Double(requestedOffset.height), -maxOffsetY), maxOffsetY)

        let rectWidth = min(imageWidth, max(1, Int(scaledWidth.rounded())))
        let rectHeight = min(imageHeight, max(1, Int(scaledHeight.rounded())))
        let centeredX = (Double(imageWidth) - Double(rectWidth)) / 2
        let centeredY = (Double(imageHeight) - Double(rectHeight)) / 2
        let x = clamp(Int((centeredX + clampedOffsetX).rounded()), lowerBound: 0, upperBound: imageWidth - rectWidth)
        let y = clamp(Int((centeredY + clampedOffsetY).rounded()), lowerBound: 0, upperBound: imageHeight - rectHeight)

        return PixelRect(
            x: x,
            y: y,
            width: rectWidth,
            height: rectHeight,
            offset: CGSize(width: Double(x) - centeredX, height: Double(y) - centeredY)
        )
    }

    private func clamp(_ value: Int, lowerBound: Int, upperBound: Int) -> Int {
        min(max(value, lowerBound), upperBound)
    }
}
