#!/usr/bin/env bash
set -e

# ==============================================================================
# Build Script for EPUB Reaper (Native macOS Standalone App)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="EPUB Reaper"
BUILD_DIR="$SCRIPT_DIR/build"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
CONTENTS="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RESOURCES_DIR="$CONTENTS/Resources"

echo "🦖 Building $APP_NAME for macOS..."

# 1. Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# 2. Compile Swift binary
echo "  [1/4] Compiling Swift source..."
swiftc -O \
  -target arm64-apple-macos12.0 \
  -sdk "$(xcrun --show-sdk-path)" \
  "$SCRIPT_DIR/App/main.swift" \
  -o "$MACOS_DIR/$APP_NAME" \
  2>/dev/null || \
swiftc -O \
  "$SCRIPT_DIR/App/main.swift" \
  -o "$MACOS_DIR/$APP_NAME"

# 3. Copy Bundle Metadata & Icons
echo "  [2/4] Copying Info.plist and AppIcon..."
cp "$SCRIPT_DIR/App/Info.plist" "$CONTENTS/Info.plist"
if [ -f "$SCRIPT_DIR/App/AppIcon.icns" ]; then
  cp "$SCRIPT_DIR/App/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"
fi

# 4. Copy Web Reader Assets
echo "  [3/4] Packaging web reader resources..."
cp -R "$SCRIPT_DIR/Resources/"* "$RESOURCES_DIR/"

# 5. Ad-hoc codesign
echo "  [4/4] Ad-hoc codesigning app bundle..."
codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null 2>&1 || true

# 6. Copy final app to project root for easy access
cp -R "$APP_BUNDLE" "$SCRIPT_DIR/"

echo "✅ Build complete! App created at:"
echo "   $SCRIPT_DIR/$APP_NAME.app"
echo ""
echo "🚀 To run:"
echo "   open \"$SCRIPT_DIR/$APP_NAME.app\""
echo "   open -a \"$SCRIPT_DIR/$APP_NAME.app\" /path/to/book.epub"
