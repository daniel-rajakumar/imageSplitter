# ImageSplitter

Native macOS image grid cutter built with SwiftUI.

## Features

- Drag and drop an image into the window
- Preview the original image with a live grid overlay
- Adjust rows and columns
- Rotate left or right
- Move and zoom the Instagram crop before splitting
- Inspect the generated tile previews
- Export all tiles as PNG files

## Run

```bash
swift run
```

## Xcode

Open [ImageSplitter.xcodeproj](/Users/danielrajakumar/code/imageSplitter/ImageSplitter.xcodeproj) in Xcode and run the shared `ImageSplitter` scheme.

The project also includes an iOS app target, `ImageSplitteriOS`, that imports from Photos, lets you drag/zoom the Instagram crop, previews the tiles, and shares the generated PNG files through the iOS share sheet.
