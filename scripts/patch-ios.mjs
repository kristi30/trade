import fs from "node:fs";
import path from "node:path";

const plistPath = path.resolve("ios/App/App/Info.plist");

if (!fs.existsSync(plistPath)) {
  console.error("iOS project not found. Run: npx cap add ios");
  process.exit(1);
}

let plist = fs.readFileSync(plistPath, "utf8");

const entries = [
  [
    "NSLocationWhenInUseUsageDescription",
    "BlindSpark uses your location to suggest nearby matches and prefill your city.",
  ],
  [
    "NSLocationAlwaysAndWhenInUseUsageDescription",
    "BlindSpark uses your location to suggest nearby matches and prefill your city.",
  ],
  [
    "NSPhotoLibraryUsageDescription",
    "BlindSpark lets you choose a photo to share in chat after photo sharing unlocks.",
  ],
  [
    "NSCameraUsageDescription",
    "BlindSpark can use the camera when you choose to take a photo to share in chat.",
  ],
];

const xmlEscape = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

for (const [key, value] of entries) {
  if (plist.includes(`<key>${key}</key>`)) continue;
  const insertion = `\n\t<key>${key}</key>\n\t<string>${xmlEscape(value)}</string>`;
  plist = plist.replace(/\n<\/dict>\s*<\/plist>\s*$/, `${insertion}\n</dict>\n</plist>\n`);
}

if (!plist.includes("<key>ITSAppUsesNonExemptEncryption</key>")) {
  const insertion = `\n\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>`;
  plist = plist.replace(/\n<\/dict>\s*<\/plist>\s*$/, `${insertion}\n</dict>\n</plist>\n`);
}

fs.writeFileSync(plistPath, plist);
console.log("✓ iOS privacy descriptions added to Info.plist");
