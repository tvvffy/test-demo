// 把某月考核结果导出成 Excel：第一页汇总，之后每人一页，版式沿用《绩效考核表》。
const ExcelJS = require('exceljs');

const THIN = { style: 'thin', color: { argb: 'FF999999' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const WRAP = { wrapText: true, vertical: 'middle' };
const CENTER = { wrapText: true, vertical: 'middle', horizontal: 'center' };

function monthLabel(month) {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

// Excel 工作表名不能含 []:*?/\，最长 31 个字符，且不能重名
function sheetName(name, used) {
  const base = (name.replace(/[[\]:*?/\\]/g, '_').slice(0, 28) || '未命名');
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}(${n})`;
  used.add(candidate);
  return candidate;
}

function addSummarySheet(wb, result) {
  const ws = wb.addWorksheet('汇总');
  const colCount = result.items.length + 4;

  ws.mergeCells(1, 1, 1, colCount);
  const title = ws.getCell(1, 1);
  title.value = `绩效考核汇总（${monthLabel(result.month)}）`;
  title.font = { bold: true, size: 14 };
  title.alignment = CENTER;
  ws.getRow(1).height = 24;

  const header = ['排名', '姓名', ...result.items.map((it) => `${it.name}（${it.max_score}）`), `总分（${result.max_total}）`, '未录入项'];
  const headerRow = ws.addRow(header);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER;
    cell.border = BORDER;
  });

  [...result.staff].sort((a, b) => a.rank - b.rank).forEach((s) => {
    const row = ws.addRow([s.rank, s.name, ...s.items.map((r) => r.score), s.total, s.missing_items.join('、')]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BORDER;
      cell.alignment = col === colCount ? WRAP : CENTER;
    });
  });

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 12;
  for (let c = 3; c <= colCount - 2; c++) ws.getColumn(c).width = 12;
  ws.getColumn(colCount - 1).width = 10;
  ws.getColumn(colCount).width = 24;
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function addStaffSheet(wb, result, s, used) {
  const ws = wb.addWorksheet(sheetName(s.name, used));
  ws.columns = [
    { width: 14.7 }, { width: 36 }, { width: 34 }, { width: 6 }, { width: 38 }, { width: 7 }, { width: 30 },
  ];

  ws.mergeCells('A1:G1');
  const title = ws.getCell('A1');
  title.value = `绩效考核表（${monthLabel(result.month)}）—— ${s.name}`;
  title.font = { bold: true, size: 14 };
  title.alignment = CENTER;
  ws.getRow(1).height = 24;

  const headerRow = ws.addRow(['评价项目', '具体内容', '目标', '分值', '评价标准', '评分', '得分说明']);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = CENTER;
    cell.border = BORDER;
  });

  const firstItemRow = headerRow.number + 1;
  result.items.forEach((item, i) => {
    const r = s.items[i];
    const row = ws.addRow([item.name, item.content || '', item.target || '', item.max_score, item.criteria || '', r.score, r.detail]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BORDER;
      cell.alignment = col === 1 || col === 4 || col === 6 ? CENTER : WRAP;
    });
    // 按最长一格的文字量估一个行高，避免打印时文字被截断
    const longest = Math.max(
      ...[[item.content, 36], [item.target, 34], [item.criteria, 38], [r.detail, 30]]
        .map(([text, width]) => (text || '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil((line.length * 2) / width)), 0)),
    );
    row.height = Math.max(28, longest * 15);
  });
  const lastItemRow = firstItemRow + result.items.length - 1;

  const totalRow = ws.addRow(['总分', '', '', '', '', { formula: `SUM(F${firstItemRow}:F${lastItemRow})`, result: s.total }, s.missing_items.length ? `未录入：${s.missing_items.join('、')}` : '']);
  ws.mergeCells(totalRow.number, 1, totalRow.number, 5);
  totalRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = BORDER;
    cell.font = { bold: col <= 6 };
    cell.alignment = col === 7 ? WRAP : CENTER;
  });

  ws.addRow([]);
  const signRow = ws.addRow(['考核人签字：', '', '被考核人签字：', '', '人力资源签字：']);
  signRow.height = 30;
  signRow.eachCell((cell) => { cell.alignment = { vertical: 'middle' }; });

  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

async function buildWorkbook(result) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '教辅工作管理';
  addSummarySheet(wb, result);
  const used = new Set(['汇总']);
  [...result.staff].sort((a, b) => a.rank - b.rank).forEach((s) => addStaffSheet(wb, result, s, used));
  return wb.xlsx.writeBuffer();
}

module.exports = { buildWorkbook, monthLabel };
