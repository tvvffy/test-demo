// 绩效考核计分逻辑。
// 每个考核项的得分 = max(0, 基础分 − 扣分)：
//   deduct（扣分制）：基础分 = 满分
//   ratio （比例制）：本月录入分数（百分制）取平均，低于及格线记 0，否则 平均分 ÷ 100 × 满分
//   manual（直接打分）：本月录入分数取平均（录入时已按 0~满分）
// 扣分 = Σ 扣分规则分值 × 数量。比例制/直接打分项本月没有录入分数时记 0 分并标记「未录入」。

const METHODS = ['deduct', 'ratio', 'manual'];
const METHOD_LABELS = { deduct: '扣分制', ratio: '比例制', manual: '直接打分' };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function loadItems(db) {
  const items = db.prepare('SELECT * FROM kpi_items ORDER BY sort_order, id').all();
  const rules = db.prepare('SELECT * FROM kpi_rules ORDER BY id').all();
  return items.map((item) => ({ ...item, rules: rules.filter((r) => r.item_id === item.id) }));
}

function loadMonthRecords(db, month) {
  const deductions = db.prepare(`
    SELECT d.*, s.name AS staff_name, r.name AS rule_name, r.points, r.unit, r.item_id, i.name AS item_name
    FROM kpi_deductions d
    JOIN staff s ON s.id = d.staff_id
    JOIN kpi_rules r ON r.id = d.rule_id
    JOIN kpi_items i ON i.id = r.item_id
    WHERE substr(d.date, 1, 7) = ?
    ORDER BY d.date, d.id
  `).all(month);
  const scores = db.prepare(`
    SELECT sc.*, s.name AS staff_name, i.name AS item_name, i.method, i.max_score
    FROM kpi_scores sc
    JOIN staff s ON s.id = sc.staff_id
    JOIN kpi_items i ON i.id = sc.item_id
    WHERE substr(sc.date, 1, 7) = ?
    ORDER BY sc.date, sc.id
  `).all(month);
  return { deductions, scores };
}

function scoreItem(item, scoreEntries, deductionEntries) {
  const deduction = deductionEntries.reduce((sum, d) => sum + d.points * d.quantity, 0);
  const parts = [];
  let base;
  let missing = false;

  if (item.method === 'deduct') {
    base = item.max_score;
  } else if (!scoreEntries.length) {
    base = 0;
    missing = true;
    parts.push('未录入分数');
  } else {
    const avg = scoreEntries.reduce((sum, s) => sum + s.score, 0) / scoreEntries.length;
    const avgLabel = scoreEntries.length > 1 ? `${scoreEntries.length} 次平均 ${round2(avg)} 分` : `${round2(avg)} 分`;
    if (item.method === 'ratio') {
      if (item.pass_line != null && avg < item.pass_line) {
        base = 0;
        parts.push(`${avgLabel}，低于 ${item.pass_line} 分记 0 分`);
      } else {
        base = (avg / 100) * item.max_score;
        parts.push(`${avgLabel} → ${round2(base)} 分`);
      }
    } else {
      base = avg;
      parts.push(`打分 ${avgLabel}`);
    }
  }

  // 同一规则的多条记录合并展示
  const byRule = new Map();
  for (const d of deductionEntries) {
    const entry = byRule.get(d.rule_id) || { name: d.rule_name, unit: d.unit, quantity: 0, points: 0 };
    entry.quantity += d.quantity;
    entry.points += d.points * d.quantity;
    byRule.set(d.rule_id, entry);
  }
  for (const r of byRule.values()) parts.push(`${r.name} ${r.quantity}${r.unit} 扣 ${round2(r.points)} 分`);
  if (item.method === 'deduct' && !byRule.size) parts.push('无扣分');

  const score = round2(Math.min(item.max_score, Math.max(0, base - deduction)));
  return {
    item_id: item.id,
    score,
    deduction: round2(deduction),
    missing,
    detail: parts.join('；'),
  };
}

// 计算某月全部人员的考核结果（不读归档）
function computeMonth(db, month) {
  const items = loadItems(db);
  const staffRows = db.prepare('SELECT id, name FROM staff ORDER BY name COLLATE NOCASE').all();
  const { deductions, scores } = loadMonthRecords(db, month);

  const staff = staffRows.map((s) => {
    const myDeductions = deductions.filter((d) => d.staff_id === s.id);
    const myScores = scores.filter((sc) => sc.staff_id === s.id);
    const itemResults = items.map((item) => ({
      ...scoreItem(
        item,
        myScores.filter((sc) => sc.item_id === item.id),
        myDeductions.filter((d) => d.item_id === item.id),
      ),
      records: [
        ...myScores.filter((sc) => sc.item_id === item.id).map((sc) => ({ kind: 'score', ...sc })),
        ...myDeductions.filter((d) => d.item_id === item.id).map((d) => ({ kind: 'deduction', ...d })),
      ].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
    }));
    const missingItems = items.filter((_, i) => itemResults[i].missing).map((it) => it.name);
    return {
      staff_id: s.id,
      name: s.name,
      items: itemResults,
      total: round2(itemResults.reduce((sum, r) => sum + r.score, 0)),
      missing_items: missingItems,
      has_records: myDeductions.length + myScores.length > 0,
    };
  });

  // 并列同分同名次（1, 2, 2, 4）
  const sorted = [...staff].sort((a, b) => b.total - a.total);
  sorted.forEach((s, i) => {
    s.rank = i > 0 && s.total === sorted[i - 1].total ? sorted[i - 1].rank : i + 1;
  });

  return {
    month,
    archived: false,
    archived_at: null,
    max_total: round2(items.reduce((sum, it) => sum + it.max_score, 0)),
    items,
    staff,
  };
}

function getArchive(db, month) {
  return db.prepare('SELECT * FROM kpi_archives WHERE month = ?').get(month);
}

// 已归档的月份返回快照，否则实时计算
function getMonthResult(db, month) {
  const archive = getArchive(db, month);
  if (archive) return { ...JSON.parse(archive.data), archived: true, archived_at: archive.archived_at };
  return computeMonth(db, month);
}

function isArchived(db, month) {
  return !!getArchive(db, month);
}

module.exports = {
  METHODS,
  METHOD_LABELS,
  MONTH_RE,
  DATE_RE,
  round2,
  currentMonth,
  loadItems,
  loadMonthRecords,
  computeMonth,
  getMonthResult,
  isArchived,
};
