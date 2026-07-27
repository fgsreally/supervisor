const CODEX_IMAGE_TAG_RE =
  /<image\b[^>]*\bname=(?:\[([^\]]+)\]|"([^"]+)"|'([^']+)')[^>]*\bpath="([^"]*)"[^>]*\/?\s*>\s*(?:<\/image\s*>)?/gi;

function strip(text) {
  const images = [];
  let cleaned = text.replace(CODEX_IMAGE_TAG_RE, (_full, n1, n2, n3, path) => {
    images.push({ name: n1 || n2 || n3, path });
    return "";
  });
  cleaned = cleaned
    .replace(/<\/image\s*>/gi, "")
    .replace(/(^|\n)\s*>\s*(?=\n|$)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { images, cleaned };
}

const samples = [
  '<image name=[Image #1] path="C:\\Temp\\a.png">\n</image>\nhello',
  '<image name=[Image #1] path="/tmp/a.png"></image>\n[Image #1] text',
  '<image name=[Image #2] path="/x.png" />',
  ">\n</image>\n>\n</image>\n[Image #1]\n[Image #2]\n正文",
];

for (const s of samples) {
  console.log(JSON.stringify(strip(s), null, 2));
  console.log("---");
}
