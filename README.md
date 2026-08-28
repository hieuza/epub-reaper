# 🦖 EPUB Reaper

**EPUB Reaper** is a fast, ultra-lightweight, 100% private native macOS desktop EPUB reader app.

---

## ✨ Features

- ⚡ **Ultra-Lightweight Native App**: Built in Swift with macOS WKWebView (~2MB app bundle, ~35MB RAM, instant cold startup).
- 🛡️ **100% Private & Air-Gapped**: Zero network requests, zero telemetry, zero analytics. All book data stays strictly on your machine.
- 📖 **1-Page & 2-Page Spreads**: Instant toggle between Single Page (`1P`) and Classic Side-by-Side (`2P`) reading modes.
- 📏 **Adjustable Column Width**: Narrow (speed reading), Normal, or Wide.
- 🎨 **Reading Themes**: Built-in Dark 🌙, Light ☀️, and Sepia 📜 color schemes with forced text-color override for books with embedded styles.
- ⭐ **Book Favorites**: Star your favorite books and jump to them in one click from the Favorites drawer.
- 📑 **Table of Contents & Chapter Search**: Fast chapter navigation with real-time keyword filtering.
- 🔍 **Full-Text In-Book Search (`⌘F`)**: Non-blocking search across all chapters with highlighted excerpt previews.
- 🔖 **Bookmarks Manager**: Save favorite reading locations with chapter titles.
- 🕐 **Reading History**: Quick-switch sidebar drawer for previously opened books.
- 🎚️ **Progress Scrubber & Jump %**: Drag slider or jump to any exact percentage in the book.
- 🔤 **Typography Sizing**: Quick font scaling (`A-` / `A+`).
- ⛶ **Fullscreen Mode (`F` / `⌃⌘F`)**: Immersive, distraction-free reading.
- ⌨️ **Keyboard Navigation**: Smooth page turns with `←` / `→` arrow keys, `PageUp` / `PageDown`, and `Space`.
- 📂 **Finder & macOS Integration**: Double-click `.epub` files in Finder, drag & drop onto the app/dock, or press `⌘O`.

---

## 🚀 Building & Running

### 1. Build the App
Compile `EPUB Reaper.app` directly using macOS's built-in Swift compiler (zero dependencies required):

```bash
cd /Users/hieuza/code/epub-reaper
./build.sh
```

### 2. Launch the App
```bash
# Open the reader
open "EPUB Reaper.app"

# Open a specific book directly
open -a "EPUB Reaper.app" /path/to/book.epub
```

### 3. (Optional) Install to Applications
```bash
cp -R "EPUB Reaper.app" /Applications/
```

---

## ⚙️ Setting EPUB Reaper as Default App for `.epub` Files

### Option A: Via Finder
1. Right-click (or `Control` + click) any `.epub` file in Finder.
2. Select **Get Info** (`⌘I`).
3. Under **"Open with:"**, select **EPUB Reaper**.
4. Click **"Change All..."** and confirm.

### Option B: Via Terminal
```bash
brew install duti
duti -s com.hieuza.epub-reaper .epub all
```

---

## 📁 Project Structure

```
epub-reaper/
├── App/                          # Native macOS Swift shell
│   ├── main.swift                # App lifecycle, NSApplicationDelegate, window setup
│   ├── Info.plist                # App bundle metadata, .epub document type association
│   └── AppIcon.icns              # Multi-resolution macOS app icon
├── Resources/                    # Web Reader Assets
│   ├── index.html                # Reader canvas & UI
│   ├── app.css                   # Stylesheet & themes
│   ├── app.js                    # Reader engine & storage controller
│   ├── lib/
│   │   ├── epub.min.js
│   │   └── jszip.min.js
│   └── icons/                    # App asset icons
├── build.sh                      # One-command build script
├── sample_book.epub              # Sample book for testing
└── README.md
```

---

## 📜 License
MIT License.
