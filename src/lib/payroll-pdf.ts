import "server-only";

import bidiFactory from "bidi-js";
import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { weeklyByWorker, sumPayable, type ConfirmedAttendance } from "@/lib/payroll";
import { formatTryFromKurus } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { getMessages } from "@/lib/i18n";
import type { Locale } from "@/types/domain";

const COLORS = {
  brand: "#D71920",
  text: "#333333",
  muted: "#626B73",
  line: "#E2E5E9",
  soft: "#F3F4F6",
  white: "#FFFFFF",
};

const PAGE_MARGIN = 34;
const FOOTER_HEIGHT = 28;

type PayrollPdfInput = {
  records: ConfirmedAttendance[];
  weekStart: string;
  weekEnd: string;
  supervisorName: string;
  locale: Locale;
};

type TextAlign = "left" | "right" | "center";
type TextDirection = "ltr" | "rtl";

type PdfFontName = "latin" | "latinBold" | "latinExt" | "latinExtBold" | "arabic" | "arabicBold";

const bidi = bidiFactory();

function fontForText(text: string, bold = false): PdfFontName {
  if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(text)) return bold ? "arabicBold" : "arabic";
  if (/[\u0100-\u024f\u1e00-\u1eff\u20ba]/u.test(text)) return bold ? "latinExtBold" : "latinExt";
  return bold ? "latinBold" : "latin";
}

function textRuns(text: string, direction: TextDirection): string[] {
  const normalizedText = text.normalize("NFC");
  let visualText = normalizedText;

  if (direction === "rtl" && normalizedText) {
    const embedding = bidi.getEmbeddingLevels(normalizedText, "rtl");
    const mirrored = bidi.getMirroredCharactersMap(normalizedText, embedding.levels);
    const visualCharacters = bidi.getReorderedIndices(normalizedText, embedding).map((index) => ({
      character: mirrored.get(index) ?? normalizedText[index],
      isRtl: Boolean(embedding.levels[index] & 1),
    }));
    const directionalRuns: string[] = [];
    let currentRun = "";
    let currentIsRtl = visualCharacters[0]?.isRtl ?? false;
    const flushRun = () => {
      if (currentRun) directionalRuns.push(currentIsRtl ? Array.from(currentRun).reverse().join("") : currentRun);
      currentRun = "";
    };

    for (const item of visualCharacters) {
      if (item.isRtl !== currentIsRtl) {
        flushRun();
        currentIsRtl = item.isRtl;
      }
      currentRun += item.character;
    }
    flushRun();
    visualText = directionalRuns.join("");
  }

  return visualText.match(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]+|[\u0100-\u024f\u1e00-\u1eff\u20ba]+|[^\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\u0100-\u024f\u1e00-\u1eff\u20ba]+/gu) ?? [visualText];
}

function measureText(doc: PDFKit.PDFDocument, text: string, fontSize: number, bold = false, direction: TextDirection = "ltr"): number {
  let width = 0;
  doc.fontSize(fontSize);
  for (const run of textRuns(text, direction)) {
    doc.font(fontForText(run, bold));
    width += doc.widthOfString(run);
  }
  return width;
}

function wrapText(doc: PDFKit.PDFDocument, text: string, width: number, fontSize: number, direction: TextDirection): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.normalize("NFC").split(/\s+/u).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measureText(doc, candidate, fontSize, false, direction) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of Array.from(word)) {
      if (line && measureText(doc, `${line}${character}`, fontSize, false, direction) > width) {
        lines.push(line);
        line = character;
      } else {
        line += character;
      }
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: { fontSize?: number; color?: string; align?: TextAlign; bold?: boolean; direction?: TextDirection } = {},
) {
  const fontSize = options.fontSize ?? 9;
  const align = options.align ?? "left";
  const direction = options.direction ?? "ltr";
  const maxWidth = Math.max(0, width);
  const normalizedText = text.normalize("NFC");
  const ellipsis = "…";
  const characters = Array.from(normalizedText);
  let fittedText = normalizedText;

  if (measureText(doc, fittedText, fontSize, options.bold, direction) > maxWidth) {
    while (characters.length > 1 && measureText(doc, `${characters.join("")}${ellipsis}`, fontSize, options.bold, direction) > maxWidth) {
      characters.pop();
    }
    fittedText = `${characters.join("")}${ellipsis}`;
  }

  const fittedWidth = measureText(doc, fittedText, fontSize, options.bold, direction);
  let cursorX = align === "right" ? x + maxWidth - fittedWidth : x;
  if (align === "center") cursorX = x + (maxWidth - fittedWidth) / 2;

  doc.fillColor(options.color ?? COLORS.text).fontSize(fontSize);
  for (const run of textRuns(fittedText, direction)) {
    doc.font(fontForText(run, options.bold));
    doc.text(run, cursorX, y, { lineBreak: false });
    cursorX += doc.widthOfString(run);
  }
  return fittedWidth;
}

function shortWorkDates(dates: string[], locale: Locale): string {
  return dates.map((date) => {
    const parsed = new Date(`${date}T12:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "tr-TR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Europe/Istanbul",
    }).format(parsed);
  }).join(", ");
}

function formatGeneratedAt(locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

export async function createWeeklyPayrollPdf(input: PayrollPdfInput): Promise<Buffer> {
  const t = getMessages(input.locale);
  const workers = weeklyByWorker(input.records);
  const totalPayable = sumPayable(input.records);
  const totalWorkDays = workers.reduce((total, worker) => total + worker.present, 0);
  const logoPath = path.join(process.cwd(), "public", "brand", "happy-center-logo.png");
  const logo = await readFile(logoPath);
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN + FOOTER_HEIGHT, left: PAGE_MARGIN },
    bufferPages: true,
    info: {
      Title: `${t.payrollStatement} — Happy Center`,
      Author: "Happy Center Workforce",
      Subject: `${input.weekStart} - ${input.weekEnd}`,
    },
  });

  doc.registerFont("latin", path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"));
  doc.registerFont("latinBold", path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff"));
  doc.registerFont("latinExt", path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff"));
  doc.registerFont("latinExtBold", path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff"));
  doc.registerFont("arabic", path.join(process.cwd(), "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"));
  doc.registerFont("arabicBold", path.join(process.cwd(), "node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff"));

  const isArabic = input.locale === "ar";
  const textDirection: TextDirection = isArabic ? "rtl" : "ltr";
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const columns = [
    { label: t.csvWorkerCode, width: 66, align: "left" as const },
    { label: t.worker, width: 107, align: "left" as const },
    { label: t.workDates, width: 132, align: "left" as const },
    { label: t.absenceDates, width: 124, align: "left" as const },
    { label: t.csvPresentDays, width: 48, align: "center" as const },
    { label: t.csvAbsentDays, width: 48, align: "center" as const },
    { label: t.workedDays, width: 49, align: "center" as const },
    { label: t.dailyRate, width: 82, align: "right" as const },
    { label: t.amountDue, width: 91, align: "right" as const },
  ];
  const displayColumns = isArabic ? [...columns].reverse() : columns;
  const columnAlign = (align: TextAlign): TextAlign => {
    if (!isArabic || align === "center") return align;
    return "right";
  };
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const tableX = PAGE_MARGIN + Math.max(0, (contentWidth - tableWidth) / 2);

  const drawHeader = () => {
    const logoX = isArabic ? doc.page.width - PAGE_MARGIN - 160 : PAGE_MARGIN;
    doc.image(logo, logoX, 28, { width: 144 });
    const titleX = isArabic ? PAGE_MARGIN : PAGE_MARGIN + 165;
    const titleWidth = contentWidth - 165;
    drawText(doc, t.payrollStatement, titleX, 29, titleWidth, {
      fontSize: 18,
      color: COLORS.text,
      align: "right",
      bold: true,
      direction: textDirection,
    });
    drawText(doc, `${t.weekRange}: ${formatDate(input.weekStart, input.locale)} — ${formatDate(input.weekEnd, input.locale)}`, titleX, 55, titleWidth, {
      fontSize: 9,
      color: COLORS.muted,
      align: "right",
      direction: textDirection,
    });
    doc.save().moveTo(PAGE_MARGIN, 86).lineTo(doc.page.width - PAGE_MARGIN, 86).lineWidth(2).strokeColor(COLORS.brand).stroke().restore();

    const metaY = 98;
    const metaGap = 12;
    const metaWidth = (contentWidth - metaGap * 3) / 4;
    const metadata = [
      [t.supervisor, input.supervisorName],
      [t.generatedAt, formatGeneratedAt(input.locale)],
      [t.reportTotalWorkers, String(workers.length)],
      [t.totalWorkDays, String(totalWorkDays)],
    ];
    metadata.forEach(([label, value], index) => {
      const visualIndex = isArabic ? metadata.length - index - 1 : index;
      const x = PAGE_MARGIN + visualIndex * (metaWidth + metaGap);
      doc.roundedRect(x, metaY, metaWidth, 38, 6).fill(COLORS.soft);
      drawText(doc, label, x + 9, metaY + 6, metaWidth - 18, {
        fontSize: 7,
        color: COLORS.muted,
        align: isArabic ? "right" : "left",
        direction: textDirection,
      });
      drawText(doc, value, x + 9, metaY + 19, metaWidth - 18, {
        fontSize: 9,
        bold: true,
        align: isArabic ? "right" : "left",
        direction: textDirection,
      });
    });

    const totalY = metaY + 48;
    doc.roundedRect(PAGE_MARGIN, totalY, contentWidth, 36, 6).fill(COLORS.brand);
    drawText(doc, t.grandTotal, PAGE_MARGIN + 12, totalY + 11, contentWidth - 24, {
      fontSize: 12,
      color: COLORS.white,
      align: isArabic ? "right" : "left",
      bold: true,
      direction: textDirection,
    });
    drawText(doc, formatTryFromKurus(totalPayable, input.locale), PAGE_MARGIN + 12, totalY + 8, contentWidth - 24, {
      fontSize: 15,
      color: COLORS.white,
      align: isArabic ? "left" : "right",
      bold: true,
      direction: textDirection,
    });
    drawText(doc, t.payrollDisclaimer, PAGE_MARGIN, totalY + 43, contentWidth, {
      fontSize: 7,
      color: COLORS.muted,
      align: isArabic ? "right" : "left",
      direction: textDirection,
    });
  };

  const drawTableHeader = () => {
    const y = doc.y;
    const rowHeight = 27;
    doc.rect(tableX, y, tableWidth, rowHeight).fill(COLORS.soft);
    let x = tableX;
    displayColumns.forEach((column) => {
      drawText(doc, column.label, x + 4, y + 8, column.width - 8, {
        fontSize: 7,
        color: COLORS.text,
        align: columnAlign(column.align),
        bold: true,
        direction: textDirection,
      });
      x += column.width;
    });
    doc.y = y + rowHeight;
  };

  const drawFooter = (pageNumber: number, pageCount: number) => {
    const currentY = doc.y;
    const footerY = doc.page.height - PAGE_MARGIN - 12;
    doc.save().moveTo(PAGE_MARGIN, footerY - 8).lineTo(doc.page.width - PAGE_MARGIN, footerY - 8).lineWidth(0.5).strokeColor(COLORS.line).stroke().restore();
    drawText(doc, `Happy Center Workforce · ${pageNumber} / ${pageCount}`, PAGE_MARGIN, footerY, contentWidth, {
      fontSize: 7,
      color: COLORS.muted,
      align: input.locale === "ar" ? "right" : "left",
      direction: textDirection,
    });
    doc.y = currentY;
  };

  const chunks: Buffer[] = [];
  const pdf = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  drawHeader();
  doc.y = 198;
  drawTableHeader();

  if (!workers.length) {
    doc.y += 18;
    drawText(doc, t.noPayrollRecords, tableX + 8, doc.y, tableWidth - 16, {
      fontSize: 10,
      color: COLORS.muted,
      align: input.locale === "ar" ? "right" : "left",
      direction: textDirection,
    });
    doc.y += 24;
  } else {
    for (const [rowIndex, worker] of workers.entries()) {
      const workLines = wrapText(doc, shortWorkDates(worker.workDates, input.locale) || "—", columns[2].width - 8, 7.5, textDirection);
      const absenceLines = wrapText(doc, shortWorkDates(worker.absentDates, input.locale) || "—", columns[3].width - 8, 7.5, textDirection);
      const nameLines = wrapText(doc, worker.fullName, columns[1].width - 8, 7.5, textDirection);
      const lineCount = Math.max(workLines.length, absenceLines.length, nameLines.length);
      const rowHeight = Math.max(31, lineCount * 10 + 14);
      if (doc.y + rowHeight > doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT) {
        doc.addPage();
        doc.y = PAGE_MARGIN;
        drawTableHeader();
      }
      const rowY = doc.y;
      if (rowIndex % 2 === 1) doc.rect(tableX, rowY, tableWidth, rowHeight).fill("#FAFAFB");
      doc.save().moveTo(tableX, rowY + rowHeight).lineTo(tableX + tableWidth, rowY + rowHeight).lineWidth(0.4).strokeColor(COLORS.line).stroke().restore();
      const values = [
        worker.workerCode,
        nameLines,
        workLines,
        absenceLines,
        [String(worker.present)],
        [String(worker.absent)],
        [String(worker.present)],
        [formatTryFromKurus(worker.latestSnapshotKurus, input.locale)],
        [formatTryFromKurus(worker.earningsKurus, input.locale)],
      ];
      let x = tableX;
      const displayValues = isArabic ? [...values].reverse() : values;
      displayValues.forEach((value, index) => {
        const column = displayColumns[index];
        const lines = Array.isArray(value) ? value : [value];
        lines.forEach((line, lineIndex) => {
          drawText(doc, line, x + 4, rowY + 7 + lineIndex * 10, column.width - 8, {
            fontSize: 7.5,
            color: COLORS.text,
            align: columnAlign(column.align),
            bold: index === (isArabic ? 0 : displayValues.length - 1),
            direction: textDirection,
          });
        });
        x += column.width;
      });
      doc.y = rowY + rowHeight;
    }
  }

  const totalY = doc.y + 10;
  if (totalY + 45 > doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  } else {
    doc.y = totalY;
  }
  doc.roundedRect(tableX, doc.y, tableWidth, 30, 5).fill(COLORS.soft);
  const totals = [
    t.csvTotal,
    "",
    "",
    "",
    String(workers.reduce((sum, worker) => sum + worker.present, 0)),
    String(workers.reduce((sum, worker) => sum + worker.absent, 0)),
    String(totalWorkDays),
    "",
    formatTryFromKurus(totalPayable, input.locale),
  ];
  let totalX = tableX;
  const displayTotals = isArabic ? [...totals].reverse() : totals;
  displayTotals.forEach((value, index) => {
    const column = displayColumns[index];
    drawText(doc, value, totalX + 4, doc.y + 10, column.width - 8, {
      fontSize: 8,
      color: COLORS.text,
      align: columnAlign(column.align),
      bold: true,
      direction: textDirection,
    });
    totalX += column.width;
  });
  doc.y += 44;

  const signatureY = Math.min(doc.y + 20, doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT - 28);
  const signatureX = isArabic ? tableX + tableWidth - 110 : tableX;
  drawText(doc, t.payrollApproval, signatureX, signatureY, 110, {
    fontSize: 8,
    color: COLORS.muted,
    align: isArabic ? "right" : "left",
    direction: textDirection,
  });
  if (isArabic) {
    doc.save().moveTo(signatureX - 165, signatureY + 13).lineTo(signatureX - 5, signatureY + 13).lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
  } else {
    doc.save().moveTo(tableX + 115, signatureY + 13).lineTo(tableX + 280, signatureY + 13).lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
  }

  const pageRange = doc.bufferedPageRange();
  for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
    doc.switchToPage(page);
    drawFooter(page + 1, pageRange.count);
  }
  doc.end();
  return pdf;
}
