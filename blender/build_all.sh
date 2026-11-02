#!/bin/sh
# Regenera todos los assets 3D desde cero. Uso: sh blender/build_all.sh
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)

blender -b -P blender/build_assets.py
blender -b -P blender/bake_throws.py
blender -b -P blender/render_stills.py -- poster "$TMP/poster.png"
blender -b -P blender/render_stills.py -- icon "$TMP/icon.png"
blender -b -P blender/render_stills.py -- og "$TMP/og.png"
node blender/build_images.mjs "$TMP"
node blender/inspect_throws.mjs
rm -rf "$TMP"
