# Image Splitter

Image Splitter is a browser-based tool for turning one image into a clean multi-tile grid. It is built for Instagram-style carousels, profile grids, posters, story layouts, and any workflow where a single image needs to be cropped into multiple high-quality pieces.

The app runs entirely in the browser. Images are processed locally with Canvas APIs and are not uploaded to a server.

![Image Splitter preview](public/hero.png)

## Features

- Split images into configurable row and column grids.
- Quick grid presets: `1x3`, `2x3`, `3x3`, and `4x3`.
- Aspect ratio presets: `3:4`, `1:1`, `9:16`, and custom ratios.
- Drag the crop area directly on the preview.
- Pinch to zoom on touch devices.
- Rotate images left or right.
- High-DPI canvas preview for sharper mobile rendering.
- Export all tiles as a ZIP file on desktop.
- Save/share PNG tiles on mobile through the native share sheet.
- Progressive Web App support with a manifest and service worker.

## Why This Exists

Most image splitting tools either upload your image to a remote server, hide useful options behind a poor mobile UI, or export with awkward sizing. This project is meant to be fast, private, mobile-friendly, and simple enough to self-host.

## Tech Stack

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [JSZip](https://stuk.github.io/jszip/)
- Browser Canvas APIs
- Web Share API for mobile save/share behavior

## Getting Started

### Requirements

- Node.js 20 or newer recommended
- npm

### Install

```sh
npm install
```

### Run Locally

```sh
npm run dev
```

Open:

```txt
http://127.0.0.1:3000
```

### Production Build

```sh
npm run build
npm run start
```

### Lint

```sh
npm run lint
```

## Usage

1. Choose an image.
2. Pick a grid preset or set rows and columns manually.
3. Choose a tile aspect ratio.
4. Drag the preview to position the crop.
5. Pinch on mobile to zoom in or out.
6. Rotate if needed.
7. Export or save the generated tiles.

On desktop, the app exports a ZIP containing all PNG tiles. On mobile, the app attempts to use the native share sheet with PNG files so the operating system can offer actions such as saving images.

## Browser Notes

Mobile browsers do not allow websites to silently write images directly to the camera roll. The app uses the Web Share API where available, which opens the native share sheet. From there, iOS or Android controls the final save action.

If file sharing is not supported by the browser, the app falls back to ZIP download behavior.

## Privacy

Image Splitter is designed as a client-side app:

- Images are loaded in your browser.
- Cropping, previewing, rotating, and tile generation happen locally.
- No image upload API is used by the app.
- No backend server is required for image processing.

If you deploy a modified version with analytics, storage, or server-side processing, document that clearly for your users.

## Project Structure

```txt
app/
  layout.jsx        Next.js root layout and metadata
  page.jsx          App route

public/
  app-icon.svg      PWA/app icon
  favicon.svg       Browser favicon
  hero.png          README/manifest preview image
  manifest.webmanifest
  sw.js             Service worker

src/
  App.jsx           Main image splitting UI and canvas logic
  App.css           App-specific styles
  index.css         Global styles
```

## Scripts

```sh
npm run dev      # Start the local Next.js dev server
npm run build    # Create a production build
npm run start    # Serve the production build
npm run lint     # Run ESLint
```

## Contributing

Contributions are welcome. Good first areas to improve:

- Better keyboard accessibility for controls.
- Export order labels or an upload-order guide.
- Tile-by-tile preview before export.
- More aspect/grid presets.
- Browser compatibility improvements for mobile save/share flows.
- Automated tests for crop math and tile generation.

Before opening a pull request:

1. Run `npm run lint`.
2. Run `npm run build`.
3. Test image import, crop dragging, pinch zoom on mobile if possible, and export/save behavior.

## Development Notes

The preview canvas is drawn at device-pixel-ratio scale so it looks sharp on Retina/high-DPI screens. Exported tiles are generated from the original image pixels, not from the preview canvas.

The crop rectangle is derived from:

- source image dimensions
- selected rows and columns
- selected per-tile aspect ratio
- zoom
- X/Y crop offset

Keeping that crop math centralized makes preview, ZIP export, and mobile save output consistent.

## Deployment

This is a standard Next.js app. It can be deployed to platforms such as Vercel, Netlify, Render, or any Node-capable host.

For static-only hosting, review the service worker and sharing behavior carefully before switching to static export.

## License

Add a license before publishing this as an open-source project. MIT is a common default for small web utilities, but choose the license that matches your goals.
