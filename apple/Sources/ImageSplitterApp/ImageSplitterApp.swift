import AppKit
import ImageSplitterCore
import SwiftUI
import UniformTypeIdentifiers

@main
struct ImageSplitterApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 1100, minHeight: 760)
        }
        .defaultSize(width: 1240, height: 840)
    }
}

struct ContentView: View {
    @StateObject private var viewModel = ImageSplitterViewModel()

    var body: some View {
        HSplitView {
            controlSidebar
                .frame(minWidth: 280, idealWidth: 300, maxWidth: 340)

            mainContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(WindowBackdrop())
        .dropDestination(for: URL.self) { urls, _ in
            viewModel.handleDroppedFiles(urls)
        } isTargeted: { isTargeted in
            viewModel.isDropTargeted = isTargeted
        }
        .overlay {
            if viewModel.isDropTargeted {
                DropOverlayView()
                    .transition(.opacity)
            }
        }
        .toolbar {
            ToolbarItemGroup {
                Button("Import Image…") {
                    viewModel.pickImage()
                }

                Button {
                    viewModel.rotateLeft()
                } label: {
                    Label("Rotate Left", systemImage: "rotate.left")
                }
                .disabled(viewModel.sourceImage == nil)

                Button {
                    viewModel.rotateRight()
                } label: {
                    Label("Rotate Right", systemImage: "rotate.right")
                }
                .disabled(viewModel.sourceImage == nil)

                Button("Export Tiles…") {
                    viewModel.pickExportFolderAndExport()
                }
                .disabled(!viewModel.canExport)
            }

            ToolbarItem(placement: .principal) {
                Text("Image Splitter")
                    .font(.headline)
            }
        }
        .alert(item: $viewModel.alert) { alert in
            Alert(
                title: Text(alert.title),
                message: Text(alert.message),
                dismissButton: .default(Text("OK"))
            )
        }
    }

    private var controlSidebar: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HeroBanner(source: viewModel.sourceImage, tileCount: viewModel.rows * viewModel.columns) {
                    viewModel.pickImage()
                }

                SidebarSection(title: "Source", systemImage: "photo") {
                    VStack(alignment: .leading, spacing: 12) {
                        if let source = viewModel.sourceImage {
                            DetailRow(title: "File", value: source.displayName, lineLimit: 1)
                            DetailRow(title: "Original", value: "\(source.pixelWidth) x \(source.pixelHeight) px")

                            if let cropRect = viewModel.cropRect {
                                DetailRow(title: "Instagram Crop", value: "\(cropRect.width) x \(cropRect.height) px")
                            }

                            DetailRow(title: "Tiles", value: "\(viewModel.rows * viewModel.columns)")
                        } else {
                            Text("Drop an image anywhere in the window or choose one from Finder.")
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                SidebarSection(title: "Grid", systemImage: "square.grid.3x3") {
                    VStack(alignment: .leading, spacing: 14) {
                        Stepper(value: $viewModel.rows, in: 1...20) {
                            LabeledContent("Rows") {
                                Text("\(viewModel.rows)")
                                    .monospacedDigit()
                            }
                        }

                        Stepper(value: $viewModel.columns, in: 1...20) {
                            LabeledContent("Columns") {
                                Text("\(viewModel.columns)")
                                    .monospacedDigit()
                            }
                        }

                        if let source = viewModel.sourceImage {
                            Divider()

                            LabeledContent("Base Tile") {
                                if let cropRect = viewModel.cropRect {
                                    Text("\(cropRect.width / viewModel.columns) x \(cropRect.height / viewModel.rows) px")
                                } else {
                                    Text("\(source.pixelWidth / viewModel.columns) x \(source.pixelHeight / viewModel.rows) px")
                                }
                            }

                            Text("The app center-crops to an Instagram-ready canvas so each exported tile is portrait `3:4`.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                SidebarSection(title: "Rotate", systemImage: "rotate.3d") {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            Button {
                                viewModel.rotateLeft()
                            } label: {
                                Label("Left", systemImage: "rotate.left")
                            }
                            .disabled(viewModel.sourceImage == nil)

                            Button {
                                viewModel.rotateRight()
                            } label: {
                                Label("Right", systemImage: "rotate.right")
                            }
                            .disabled(viewModel.sourceImage == nil)
                        }

                        if viewModel.sourceImage != nil {
                            LabeledContent("Rotation") {
                                Text(viewModel.rotationDescription)
                            }
                        } else {
                            Text("Rotate the imported image before exporting tiles.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                SidebarSection(title: "Adjust", systemImage: "slider.horizontal.3") {
                    VStack(alignment: .leading, spacing: 12) {
                        LabeledContent("Zoom") {
                            Text(String(format: "%.2fx", viewModel.zoomScale))
                                .monospacedDigit()
                        }

                        Slider(
                            value: Binding(
                                get: { viewModel.zoomScale },
                                set: { viewModel.setZoom($0) }
                            ),
                            in: 1...4
                        )
                        .disabled(viewModel.sourceImage == nil)

                        Button("Reset Position") {
                            viewModel.resetCropAdjustments()
                        }
                        .disabled(viewModel.sourceImage == nil)

                        Text("Drag the preview to reposition the Instagram crop. Use zoom to tighten or loosen the framing.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                SidebarSection(title: "Export", systemImage: "square.and.arrow.down") {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Instagram portrait export")
                            .font(.headline)

                        Text("Every tile is exported at a `3:4` aspect ratio. If needed, the source image is center-cropped before splitting.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        Button("Export Tiles…") {
                            viewModel.pickExportFolderAndExport()
                        }
                        .disabled(!viewModel.canExport)

                        Text("Tiles are exported as PNG files named with row and column indices.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(20)
        }
        .background(
            LinearGradient(
                colors: [
                    Color(nsColor: .underPageBackgroundColor),
                    Color(nsColor: .windowBackgroundColor)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    @ViewBuilder
    private var mainContent: some View {
        if let source = viewModel.sourceImage {
            VStack(spacing: 18) {
                PreviewSummaryBar(
                    source: source,
                    cropRect: viewModel.cropRect,
                    zoomScale: viewModel.zoomScale,
                    rotationDescription: viewModel.rotationDescription
                )

                PanelCard(title: "Preview", systemImage: "rectangle.dashed") {
                    ImagePreviewCanvas(
                        image: source.image,
                        pixelSize: source.pixelSize,
                        cropRect: viewModel.cropRect,
                        cropOffset: viewModel.cropOffset,
                        rows: viewModel.rows,
                        columns: viewModel.columns,
                        onCropOffsetChange: viewModel.updateCropOffset
                    )
                    .frame(maxWidth: .infinity, minHeight: 360, maxHeight: 430)
                }

                PanelCard(title: "Tiles", systemImage: "square.grid.2x2") {
                    ScrollView {
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 150, maximum: 220), spacing: 14)],
                            spacing: 14
                        ) {
                            ForEach(viewModel.tiles) { tile in
                                TileCard(tile: tile)
                            }
                        }
                        .padding(.top, 4)
                    }
                }
            }
            .padding(20)
        } else {
            WelcomeDropView {
                viewModel.pickImage()
            }
            .padding(28)
        }
    }
}

@MainActor
final class ImageSplitterViewModel: ObservableObject {
    @Published var rows = 2 {
        didSet {
            guard rows != oldValue else { return }
            rebuildTiles()
        }
    }

    @Published var columns = 2 {
        didSet {
            guard columns != oldValue else { return }
            rebuildTiles()
        }
    }

    @Published var isDropTargeted = false
    @Published var alert: ViewAlert?
    @Published private(set) var sourceImage: SplitSourceImage?
    @Published private(set) var cropRect: PixelRect?
    @Published private(set) var tiles: [SplitTile] = []
    @Published private(set) var rotationQuarterTurns = 0
    @Published private(set) var zoomScale = 1.0
    @Published private(set) var cropOffset = CGSize.zero

    var canExport: Bool {
        sourceImage != nil && !tiles.isEmpty
    }

    var rotationDescription: String {
        let normalizedTurns = ((rotationQuarterTurns % 4) + 4) % 4
        let degrees = normalizedTurns * 90
        return "\(degrees)°"
    }

    func handleDroppedFiles(_ urls: [URL]) -> Bool {
        guard let imageURL = urls.first(where: { isSupportedImageFile($0) }) else {
            alert = ViewAlert(
                title: "Unsupported File",
                message: "Drop a standard image file such as PNG, JPEG, TIFF, HEIC, or GIF."
            )
            return false
        }

        loadImage(from: imageURL)
        return true
    }

    func pickImage() {
        let panel = NSOpenPanel()
        panel.title = "Choose an image"
        panel.prompt = "Open"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.png, .jpeg, .tiff, .gif, .heic, .image]

        if panel.runModal() == .OK, let url = panel.url {
            loadImage(from: url)
        }
    }

    func pickExportFolderAndExport() {
        guard canExport else { return }

        let panel = NSOpenPanel()
        panel.title = "Choose an export folder"
        panel.prompt = "Export"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false

        guard panel.runModal() == .OK, let folderURL = panel.url else {
            return
        }

        exportTiles(to: folderURL)
    }

    func rotateLeft() {
        rotate(clockwise: false)
    }

    func rotateRight() {
        rotate(clockwise: true)
    }

    func setZoom(_ newValue: Double) {
        let clampedValue = min(max(newValue, 1), 4)
        guard abs(clampedValue - zoomScale) > 0.0001 else { return }
        zoomScale = clampedValue
        rebuildTiles()
    }

    func updateCropOffset(_ newOffset: CGSize) {
        guard sourceImage != nil else { return }
        cropOffset = newOffset
        rebuildTiles()
    }

    func resetCropAdjustments() {
        let needsReset = abs(zoomScale - 1) > 0.0001 || abs(cropOffset.width) > 0.5 || abs(cropOffset.height) > 0.5
        guard needsReset else { return }
        zoomScale = 1
        cropOffset = .zero
        rebuildTiles()
    }

    private func loadImage(from url: URL) {
        guard let source = SplitSourceImage(url: url) else {
            alert = ViewAlert(
                title: "Image Load Failed",
                message: "The selected file could not be opened as an image."
            )
            return
        }

        sourceImage = source
        rotationQuarterTurns = 0
        zoomScale = 1
        cropOffset = .zero
        rebuildTiles()
    }

    private func rebuildTiles() {
        guard let sourceImage else {
            cropRect = nil
            tiles = []
            return
        }

        let splitResult: TileSplitResult
        do {
            splitResult = try ImageSplitterEngine.split(
                source: sourceImage.coreSource,
                rows: rows,
                columns: columns,
                zoomScale: zoomScale,
                cropOffset: cropOffset
            )
        } catch {
            alert = ViewAlert(
                title: "Split Failed",
                message: error.localizedDescription
            )
            tiles = []
            return
        }
        cropRect = splitResult.cropRect
        cropOffset = splitResult.clampedOffset
        tiles = splitResult.tiles.map(SplitTile.init(coreTile:))
    }

    private func exportTiles(to folderURL: URL) {
        guard let sourceImage else { return }

        do {
            for tile in tiles {
                let filename = "\(sourceImage.displayName)_r\(tile.row + 1)_c\(tile.column + 1).png"
                let outputURL = folderURL.appendingPathComponent(filename)
                try tile.pngData.write(to: outputURL, options: .atomic)
            }

            alert = ViewAlert(
                title: "Export Complete",
                message: "Saved \(tiles.count) tiles to \(folderURL.path)."
            )
        } catch {
            alert = ViewAlert(
                title: "Export Failed",
                message: error.localizedDescription
            )
        }
    }

    private func isSupportedImageFile(_ url: URL) -> Bool {
        guard let type = UTType(filenameExtension: url.pathExtension) else {
            return false
        }

        return type.conforms(to: .image)
    }

    private func rotate(clockwise: Bool) {
        guard let rotatedImage = sourceImage?.rotated(clockwise: clockwise) else {
            return
        }

        sourceImage = rotatedImage
        rotationQuarterTurns += clockwise ? 1 : -1
        cropOffset = .zero
        rebuildTiles()
    }
}

struct SplitSourceImage {
    let url: URL
    let coreSource: ImageSource
    let image: NSImage
    let pixelSize: CGSize
    let displayName: String

    var pixelWidth: Int { Int(pixelSize.width) }
    var pixelHeight: Int { Int(pixelSize.height) }

    init?(url: URL) {
        guard
            let image = NSImage(contentsOf: url),
            let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
        else {
            return nil
        }

        let pixelSize = CGSize(width: cgImage.width, height: cgImage.height)
        let normalizedImage = NSImage(cgImage: cgImage, size: NSSize(width: pixelSize.width, height: pixelSize.height))

        self.url = url
        self.coreSource = ImageSource(cgImage: cgImage, displayName: url.deletingPathExtension().lastPathComponent)
        self.image = normalizedImage
        self.pixelSize = pixelSize
        self.displayName = url.deletingPathExtension().lastPathComponent
    }

    init(url: URL, coreSource: ImageSource) {
        self.url = url
        self.coreSource = coreSource
        self.image = NSImage(
            cgImage: coreSource.cgImage,
            size: NSSize(width: coreSource.pixelWidth, height: coreSource.pixelHeight)
        )
        self.pixelSize = coreSource.pixelSize
        self.displayName = coreSource.displayName
    }

    func rotated(clockwise: Bool) -> SplitSourceImage? {
        guard let rotatedSource = try? ImageSplitterEngine.rotated(coreSource, clockwise: clockwise) else {
            return nil
        }

        return SplitSourceImage(url: url, coreSource: rotatedSource)
    }
}

struct SplitTile: Identifiable {
    let id: UUID
    let row: Int
    let column: Int
    let image: NSImage
    let pixelWidth: Int
    let pixelHeight: Int
    let pngData: Data

    init(coreTile: ImageTile) {
        self.id = coreTile.id
        self.row = coreTile.row
        self.column = coreTile.column
        self.image = NSImage(
            cgImage: coreTile.cgImage,
            size: NSSize(width: coreTile.pixelWidth, height: coreTile.pixelHeight)
        )
        self.pixelWidth = coreTile.pixelWidth
        self.pixelHeight = coreTile.pixelHeight
        self.pngData = coreTile.pngData
    }
}

struct ImagePreviewCanvas: View {
    let image: NSImage
    let pixelSize: CGSize
    let cropRect: PixelRect?
    let cropOffset: CGSize
    let rows: Int
    let columns: Int
    let onCropOffsetChange: (CGSize) -> Void

    @State private var dragStartOffset: CGSize?

    var body: some View {
        GeometryReader { geometry in
            let fittedSize = fitSize(for: pixelSize, in: geometry.size)

            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color(nsColor: .controlBackgroundColor))

                VStack {
                    Spacer(minLength: 0)

                    ZStack {
                        Image(nsImage: image)
                            .resizable()
                            .interpolation(.high)
                            .aspectRatio(contentMode: .fit)

                        if let cropRect {
                            let previewCropRect = CGRect(
                                x: fittedSize.width * CGFloat(cropRect.x) / pixelSize.width,
                                y: fittedSize.height * CGFloat(cropRect.y) / pixelSize.height,
                                width: fittedSize.width * CGFloat(cropRect.width) / pixelSize.width,
                                height: fittedSize.height * CGFloat(cropRect.height) / pixelSize.height
                            )

                            CropShadeShape(cropRect: previewCropRect)
                                .fill(Color.black.opacity(0.34), style: FillStyle(eoFill: true))

                            CropGridShape(cropRect: previewCropRect, rows: rows, columns: columns)
                                .stroke(
                                    Color.accentColor.opacity(0.95),
                                    style: StrokeStyle(lineWidth: 1.2, dash: [7, 4])
                                )
                        }
                    }
                    .frame(width: fittedSize.width, height: fittedSize.height)
                    .contentShape(Rectangle())
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
                    }
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                if dragStartOffset == nil {
                                    dragStartOffset = cropOffset
                                }

                                let startOffset = dragStartOffset ?? cropOffset
                                let xScale = pixelSize.width / max(fittedSize.width, 1)
                                let yScale = pixelSize.height / max(fittedSize.height, 1)
                                let adjustedOffset = CGSize(
                                    width: startOffset.width + value.translation.width * xScale,
                                    height: startOffset.height + value.translation.height * yScale
                                )
                                onCropOffsetChange(adjustedOffset)
                            }
                            .onEnded { _ in
                                dragStartOffset = nil
                            }
                    )

                    Spacer(minLength: 0)
                }
                .padding(24)
            }
        }
    }

    private func fitSize(for imageSize: CGSize, in containerSize: CGSize) -> CGSize {
        guard imageSize.width > 0, imageSize.height > 0 else {
            return .zero
        }

        let horizontalPadding: CGFloat = 48
        let verticalPadding: CGFloat = 48
        let maxWidth = max(containerSize.width - horizontalPadding, 1)
        let maxHeight = max(containerSize.height - verticalPadding, 1)
        let aspectRatio = min(maxWidth / imageSize.width, maxHeight / imageSize.height)

        return CGSize(width: imageSize.width * aspectRatio, height: imageSize.height * aspectRatio)
    }
}

struct CropShadeShape: Shape {
    let cropRect: CGRect

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRoundedRect(in: rect, cornerSize: CGSize(width: 14, height: 14))
        path.addRect(cropRect)
        return path
    }
}

struct CropGridShape: Shape {
    let cropRect: CGRect
    let rows: Int
    let columns: Int

    func path(in rect: CGRect) -> Path {
        var path = Path()

        guard rows > 0, columns > 0 else {
            return path
        }

        path.addRoundedRect(in: cropRect, cornerSize: CGSize(width: 14, height: 14))

        for row in 1..<rows {
            let y = cropRect.minY + cropRect.height * CGFloat(row) / CGFloat(rows)
            path.move(to: CGPoint(x: cropRect.minX, y: y))
            path.addLine(to: CGPoint(x: cropRect.maxX, y: y))
        }

        for column in 1..<columns {
            let x = cropRect.minX + cropRect.width * CGFloat(column) / CGFloat(columns)
            path.move(to: CGPoint(x: x, y: cropRect.minY))
            path.addLine(to: CGPoint(x: x, y: cropRect.maxY))
        }

        return path
    }
}

struct TileCard: View {
    let tile: SplitTile

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.accentColor.opacity(0.15),
                                Color(nsColor: .controlBackgroundColor)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                Image(nsImage: tile.image)
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: .fit)
                    .padding(12)
            }
            .frame(height: 144)

            HStack {
                Text("R\(tile.row + 1)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("C\(tile.column + 1)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
            }

            Text("\(tile.pixelWidth) x \(tile.pixelHeight) px")
                .font(.headline)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(nsColor: .textBackgroundColor).opacity(0.9))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.06), radius: 12, y: 6)
    }
}

struct WelcomeDropView: View {
    let importAction: () -> Void

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color.accentColor.opacity(0.16),
                            Color(nsColor: .underPageBackgroundColor)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(alignment: .leading, spacing: 22) {
                Label("Image Splitter", systemImage: "photo.stack")
                    .font(.title.weight(.semibold))

                Text("Drop an image to preview the crop, tune the framing, and export a clean Instagram-ready grid.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 12) {
                    EmptyStateBadge(title: "Drag and drop", systemImage: "arrow.down.doc")
                    EmptyStateBadge(title: "Adjust crop", systemImage: "crop.rotate")
                    EmptyStateBadge(title: "Export PNG tiles", systemImage: "square.grid.3x3")
                }

                Button("Choose Image…", action: importAction)
                    .controlSize(.large)
            }
            .padding(34)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        }
    }
}

struct DropOverlayView: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 26, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, dash: [12, 8]))
            }
            .overlay {
                VStack(spacing: 10) {
                    Image(systemName: "arrow.down.doc.fill")
                        .font(.system(size: 26, weight: .semibold))
                    Text("Drop Image")
                        .font(.title2.weight(.semibold))
                    Text("Import to preview and split")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 18)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .padding(16)
            .allowsHitTesting(false)
    }
}

struct WindowBackdrop: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(nsColor: .windowBackgroundColor),
                Color.accentColor.opacity(0.06),
                Color(nsColor: .underPageBackgroundColor)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

struct HeroBanner: View {
    let source: SplitSourceImage?
    let tileCount: Int
    let importAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Image Splitter")
                .font(.title2.weight(.semibold))

            Text(source == nil ? "Import one image and turn it into an Instagram-ready portrait grid." : "Adjust the crop, check the tiles, and export the full set as PNG files.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 10) {
                StatPill(title: "Format", value: "3:4")
                StatPill(title: "Tiles", value: "\(tileCount)")
            }

            Button(source == nil ? "Choose Image…" : "Replace Image…", action: importAction)
                .controlSize(.large)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color.accentColor.opacity(0.18), Color(nsColor: .textBackgroundColor)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        }
    }
}

struct SidebarSection<Content: View>: View {
    let title: String
    let systemImage: String
    let content: Content

    init(title: String, systemImage: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        }
    }
}

struct PanelCard<Content: View>: View {
    let title: String
    let systemImage: String
    let content: Content

    init(title: String, systemImage: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        }
    }
}

struct PreviewSummaryBar: View {
    let source: SplitSourceImage
    let cropRect: PixelRect?
    let zoomScale: Double
    let rotationDescription: String

    var body: some View {
        HStack(spacing: 12) {
            StatPill(title: "Image", value: source.displayName)
            StatPill(title: "Zoom", value: String(format: "%.2fx", zoomScale))
            StatPill(title: "Rotation", value: rotationDescription)
            if let cropRect {
                StatPill(title: "Crop", value: "\(cropRect.width) x \(cropRect.height)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct StatPill: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: Capsule())
    }
}

struct DetailRow: View {
    let title: String
    let value: String
    var lineLimit: Int? = nil

    var body: some View {
        LabeledContent(title) {
            Text(value)
                .lineLimit(lineLimit)
        }
    }
}

struct EmptyStateBadge: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.regularMaterial, in: Capsule())
    }
}

struct ViewAlert: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

private extension NSImage {
    var pngData: Data? {
        guard
            let tiffRepresentation,
            let bitmap = NSBitmapImageRep(data: tiffRepresentation)
        else {
            return nil
        }

        return bitmap.representation(using: .png, properties: [:])
    }
}
