import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Convert DOCX base64 to sanitized-ish HTML via mammoth. */
export async function docxBase64ToHtml(base64: string): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: base64ToArrayBuffer(base64) });
  return result.value || "<p>（文档无可见文本）</p>";
}

/** Extract slide text from PPTX and render as simple HTML sections. */
export async function pptxBase64ToHtml(base64: string): Promise<string> {
  const zip = await JSZip.loadAsync(base64ToArrayBuffer(base64));
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] ?? 0);
      return na - nb;
    });

  if (slideNames.length === 0) {
    return "<p>（未找到幻灯片内容）</p>";
  }

  const parts: string[] = [];
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.file(slideNames[i]!)!.async("string");
    const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXmlEntities(match[1] ?? "").trim())
      .filter(Boolean);
    const body =
      texts.length > 0
        ? texts.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
        : "<p class='office-preview__muted'>（本页无文本）</p>";
    parts.push(`<section class="office-preview__slide"><h3>幻灯片 ${i + 1}</h3>${body}</section>`);
  }
  return parts.join("");
}

/** Convert XLSX base64 to HTML tables (first several sheets). */
export async function xlsxBase64ToHtml(base64: string): Promise<string> {
  const workbook = XLSX.read(base64ToArrayBuffer(base64), { type: "array" });
  const names = workbook.SheetNames ?? [];
  if (names.length === 0) return "<p>（工作簿为空）</p>";

  const maxSheets = 8;
  const parts: string[] = [];
  for (const name of names.slice(0, maxSheets)) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const html = XLSX.utils.sheet_to_html(sheet, { id: `sheet-${encodeURIComponent(name)}` });
    parts.push(
      `<section class="office-preview__sheet"><h3>${escapeHtml(name)}</h3>${html}</section>`,
    );
  }
  if (names.length > maxSheets) {
    parts.push(`<p class="office-preview__muted">仅预览前 ${maxSheets} 个工作表…</p>`);
  }
  return parts.join("");
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}
