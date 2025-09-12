if eas build --platform android --profile production --auto-submit; then
  node ./scripts/updateVersion.js
else
  echo "❌ Build failed. Skipping updateVersion.js"
fi