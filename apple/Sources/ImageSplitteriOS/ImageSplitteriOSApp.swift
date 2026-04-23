import ImageSplitterCore
import PhotosUI
import SwiftUI
import UIKit

@main
struct ImageSplitteriOSApp: App {
    var body: some Scene {
        WindowGroup {
            IOSContentView()
        }
    }
}

struct IOSContentView: View {
    @StateObject private var viewModel = IOSImageSplitterViewModel()
    @State private var selectedPhoto: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.source == nil {
                    emptyState
                } else {
                    editorView
                }
            }
            .navigationTitle("Image Splitter")
            .toolbar {
                if viewModel.source != nil {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button {
                            viewModel.rotateLeft()
                        } label: {
                            Image(systemName: "rotate.left")
                        }

                        Button {
                            viewModel.rotateRight()
                        } label: {
                            Image(systemName: "rotate.right")
                        }

                        Button {
                            viewModel.prepareShare()
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .disabled(!viewModel.canShare)
                    }
                }
            }
        }
        .alert("Image Splitter", isPresented: $viewModel.isShowingAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(viewModel.alertMessage)
        }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task {
                await viewModel.loadPhoto(item)
            }
        }
        .sheet(item: $viewModel.sharePayload) { payload in
            ActivityView(activityItems: payload.urls)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Get Started")
                        .font(.headline)

                    Text("Import a photo to crop and split it into Instagram-ready 3∶4 tiles.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)

                importButton(title: "Import from Photos", systemImage: "photo.on.rectangle")
            }

            Section {
                EmptyStateFeatureRow(
                    title: "Instagram-ready output",
                    detail: "Every tile exports at a portrait 3∶4 ratio.",
                    systemImage: "rectangle.split.3x3"
                )
                EmptyStateFeatureRow(
                    title: "Crop before you split",
                    detail: "Move, zoom, and rotate the image before export.",
                    systemImage: "crop.rotate"
                )
                EmptyStateFeatureRow(
                    title: "Share all tiles at once",
                    detail: "Generate PNG tiles and send them straight from iPhone.",
                    systemImage: "square.and.arrow.up"
                )
            } header: {
                Text("Features")
            }
        }
    }

    // MARK: - Editor

    private var editorView: some View {
        List {
            // Preview
            Section {
                if let source = viewModel.source {
                    IOSImagePreview(
                        source: source,
                        cropRect: viewModel.cropRect,
                        cropOffset: viewModel.cropOffset,
                        rows: viewModel.rows,
                        columns: viewModel.columns,
                        onCropOffsetChange: viewModel.updateCropOffset
                    )
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }
            } footer: {
                if let source = viewModel.source, let cropRect = viewModel.cropRect {
                    Text("\(source.pixelWidth)×\(source.pixelHeight) → \(cropRect.width)×\(cropRect.height) · Drag to reposition")
                }
            }

            // Grid + Adjust combined
            Section {
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

                HStack {
                    Text("Zoom")
                    Slider(
                        value: Binding(
                            get: { viewModel.zoomScale },
                            set: { viewModel.setZoom($0) }
                        ),
                        in: 1...4
                    )
                    Text(String(format: "%.1f×", viewModel.zoomScale))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .frame(width: 38, alignment: .trailing)
                }

                if viewModel.zoomScale > 1.01 || abs(viewModel.cropOffset.width) > 1 || abs(viewModel.cropOffset.height) > 1 {
                    Button("Reset Crop") {
                        viewModel.resetCropAdjustments()
                    }
                    .foregroundStyle(.red)
                }
            } header: {
                Text("Grid · \(viewModel.tileCount) tiles")
            } footer: {
                Text("Each tile exports at portrait 3∶4.")
            }

            // Tiles
            if !viewModel.tiles.isEmpty {
                Section("Tiles") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), spacing: 8)], spacing: 8) {
                        ForEach(viewModel.tiles) { tile in
                            Image(uiImage: UIImage(cgImage: tile.cgImage))
                                .resizable()
                                .scaledToFit()
                                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            bottomBar
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(spacing: 12) {
                importButton(title: "Replace", systemImage: "photo")

                Button {
                    viewModel.prepareShare()
                } label: {
                    Label("Share Tiles", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!viewModel.canShare)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
        }
        .background(.bar)
    }

    // MARK: - Shared Components

    private func importButton(title: String, systemImage: String) -> some View {
        PhotosPicker(selection: $selectedPhoto, matching: .images) {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
    }
}

// MARK: - View Model

@MainActor
final class IOSImageSplitterViewModel: ObservableObject {
    @Published var rows = 1 {
        didSet { rebuildTiles() }
    }

    @Published var columns = 3 {
        didSet { rebuildTiles() }
    }

    @Published private(set) var source: ImageSource?
    @Published private(set) var cropRect: PixelRect?
    @Published private(set) var cropOffset = CGSize.zero
    @Published private(set) var rotationQuarterTurns = 0
    @Published private(set) var tiles: [ImageTile] = []
    @Published private(set) var zoomScale = 1.0
    @Published var isShowingAlert = false
    @Published var alertMessage = ""
    @Published var sharePayload: SharePayload?

    var canShare: Bool {
        !tiles.isEmpty
    }

    var tileCount: Int {
        rows * columns
    }

    func loadPhoto(_ item: PhotosPickerItem) async {
        do {
            guard
                let data = try await item.loadTransferable(type: Data.self),
                let image = UIImage(data: data),
                let cgImage = image.normalizedCGImage()
            else {
                showAlert("The selected image could not be loaded.")
                return
            }

            source = ImageSource(cgImage: cgImage, displayName: "Imported Image")
            cropOffset = .zero
            zoomScale = 1
            rotationQuarterTurns = 0
            rebuildTiles()
        } catch {
            showAlert(error.localizedDescription)
        }
    }

    func rotateLeft() {
        rotate(clockwise: false)
    }

    func rotateRight() {
        rotate(clockwise: true)
    }

    func setZoom(_ newValue: Double) {
        zoomScale = min(max(newValue, 1), 4)
        rebuildTiles()
    }

    func updateCropOffset(_ newOffset: CGSize) {
        cropOffset = newOffset
        rebuildTiles()
    }

    func resetCropAdjustments() {
        cropOffset = .zero
        zoomScale = 1
        rebuildTiles()
    }

    func prepareShare() {
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

            let urls = try tiles.map { tile in
                let url = folder.appendingPathComponent("tile_r\(tile.row + 1)_c\(tile.column + 1).png")
                try tile.pngData.write(to: url, options: .atomic)
                return url
            }

            sharePayload = SharePayload(urls: urls)
        } catch {
            showAlert(error.localizedDescription)
        }
    }

    private func rebuildTiles() {
        guard let source else {
            cropRect = nil
            tiles = []
            return
        }

        do {
            let result = try ImageSplitterEngine.split(
                source: source,
                rows: rows,
                columns: columns,
                zoomScale: zoomScale,
                cropOffset: cropOffset
            )
            cropRect = result.cropRect
            cropOffset = result.clampedOffset
            tiles = result.tiles
        } catch {
            showAlert(error.localizedDescription)
            tiles = []
        }
    }

    private func rotate(clockwise: Bool) {
        guard let source else { return }

        do {
            self.source = try ImageSplitterEngine.rotated(source, clockwise: clockwise)
            rotationQuarterTurns += clockwise ? 1 : -1
            cropOffset = .zero
            rebuildTiles()
        } catch {
            showAlert(error.localizedDescription)
        }
    }

    private func showAlert(_ message: String) {
        alertMessage = message
        isShowingAlert = true
    }
}

// MARK: - Image Preview

struct IOSImagePreview: View {
    let source: ImageSource
    let cropRect: PixelRect?
    let cropOffset: CGSize
    let rows: Int
    let columns: Int
    let onCropOffsetChange: (CGSize) -> Void

    @State private var dragStartOffset: CGSize?

    var body: some View {
        GeometryReader { geometry in
            let imageSize = source.pixelSize
            let fittedSize = fitSize(for: imageSize, in: geometry.size)

            ZStack {
                Color(.secondarySystemGroupedBackground)

                ZStack {
                    Image(uiImage: UIImage(cgImage: source.cgImage))
                        .resizable()
                        .interpolation(.high)
                        .aspectRatio(contentMode: .fit)

                    if let cropRect {
                        let previewCropRect = CGRect(
                            x: fittedSize.width * CGFloat(cropRect.x) / imageSize.width,
                            y: fittedSize.height * CGFloat(cropRect.y) / imageSize.height,
                            width: fittedSize.width * CGFloat(cropRect.width) / imageSize.width,
                            height: fittedSize.height * CGFloat(cropRect.height) / imageSize.height
                        )

                        CropShadeShape(cropRect: previewCropRect)
                            .fill(Color.black.opacity(0.45), style: FillStyle(eoFill: true))

                        CropGridShape(cropRect: previewCropRect, rows: rows, columns: columns)
                            .stroke(
                                Color.white,
                                style: StrokeStyle(lineWidth: 0.8)
                            )

                        // Crop border
                        Rectangle()
                            .stroke(Color.white, lineWidth: 1.5)
                            .frame(
                                width: previewCropRect.width,
                                height: previewCropRect.height
                            )
                            .position(
                                x: previewCropRect.midX,
                                y: previewCropRect.midY
                            )
                    }
                }
                .frame(width: fittedSize.width, height: fittedSize.height)
                .clipShape(Rectangle())
                .contentShape(Rectangle())
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            if dragStartOffset == nil {
                                dragStartOffset = cropOffset
                            }

                            let startOffset = dragStartOffset ?? cropOffset
                            let xScale = imageSize.width / max(fittedSize.width, 1)
                            let yScale = imageSize.height / max(fittedSize.height, 1)
                            onCropOffsetChange(
                                CGSize(
                                    width: startOffset.width + value.translation.width * xScale,
                                    height: startOffset.height + value.translation.height * yScale
                                )
                            )
                        }
                        .onEnded { _ in
                            dragStartOffset = nil
                        }
                )
            }
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func fitSize(for imageSize: CGSize, in containerSize: CGSize) -> CGSize {
        guard imageSize.width > 0, imageSize.height > 0 else {
            return .zero
        }

        let aspectRatio = min(containerSize.width / imageSize.width, containerSize.height / imageSize.height)
        return CGSize(width: imageSize.width * aspectRatio, height: imageSize.height * aspectRatio)
    }
}

// MARK: - Shapes

struct CropShadeShape: Shape {
    let cropRect: CGRect

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRect(rect)
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

// MARK: - Share

struct SharePayload: Identifiable {
    let id = UUID()
    let urls: [URL]
}

struct ActivityView: UIViewControllerRepresentable {
    let activityItems: [URL]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) { }
}

// MARK: - Supporting Views

struct EmptyStateFeatureRow: View {
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)

                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: systemImage)
                .foregroundStyle(.tint)
                .frame(width: 24)
        }
    }
}

// MARK: - UIImage Extension

private extension UIImage {
    func normalizedCGImage() -> CGImage? {
        if imageOrientation == .up, let cgImage {
            return cgImage
        }

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.cgImage
    }
}
