if eas build --platform android --profile production --auto-submit; then
  node ./scripts/updateVersion.js &
  echo "✅ Build Success (updateVersion.js is running in background)"
else
  echo "❌ Build failed. Skipping updateVersion.js"
fi