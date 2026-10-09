const express = require('express');
const db = require('../db');
const kpi = require('../lib/kpi');
const { buildWorkbook, monthLabel } = require('../lib/kpiExport');

const router = express.Router();

const ARCHIVED_MSG = '该月考核已归档，如需修改请先取消归档';

function monthParam(req, res) {
  const month = req.query.month || kpi.currentMonth();
  if (!kpi.MONTH_RE.test(month)) {
    res.status(400).json({ error: '月份格式应为 YYYY-MM' });
    return null;
  }
  return month;
}

function staffExists(id) {
  return !!db.prepare('SELECT 1 FROM staff WHERE id = ?').get(id);
}

// ---------- 考核项与扣分规则 ----------

// 校验并整理考核项的请求体，出错时返回错误信息字符串
function parseItem(body) {
  const name = (body.name || '').trim();
  if (!name) return { error: '考核项名称不能为空' };
  const max_score = Number(body.max_score);
  if (!(max_score > 0)) return { error: '分值必须大于 0' };
  const method = kpi.METHODS.includes(body.method) ? body.method : null;
  if (!method) return { error: '计分方式无效' };
  let pass_line = null;
  if (method === 'ratio' && body.pass_line !== '' && body.pass_line != null) {
    pass_line = Number(body.pass_line);
    if (!(pass_line >= 0 && pass_line <= 100)) return { error: '及格线应在 0~100 之间' };
  }
  const rules = [];
  for (const r of body.rules || []) {
    const ruleName = (r.name || '').trim();
    const points = Number(r.points);
    const unit = (r.unit || '').trim() || '次';
    if (!ruleName) return { error: '扣分规则名称不能为空' };
    if (!(points > 0)) return { error: `「${ruleName}」的扣分必须大于 0` };
    rules.push({ id: r.id ? Number(r.id) : null, name: ruleName, points, unit: unit.slice(0, 4) });
  }
  return {
    item: {
      name,
      content: body.content || null,
      target: body.target || null,
      criteria: body.criteria || null,
      max_score,
      method,
      pass_line,
    },
    rules,
  };
}

// 按请求同步某考核项的扣分规则：有 id 的更新，没有 id 的新建，请求里没有的删除（已被使用的不能删）
function syncRules(itemId, rules) {
  const existing = db.prepare('SELECT id, name FROM kpi_rules WHERE item_id = ?').all(itemId);
  const keepIds = new Set(rules.filter((r) => r.id).map((r) => r.id));
  for (const old of existing) {
    if (keepIds.has(old.id)) continue;
    const used = db.prepare('SELECT COUNT(*) AS n FROM kpi_deductions WHERE rule_id = ?').get(old.id).n;
    if (used) throw Object.assign(new Error(`「${old.name}」已有 ${used} 条扣分记录，不能删除`), { status: 409 });
    db.prepare('DELETE FROM kpi_rules WHERE id = ?').run(old.id);
  }
  for (const r of rules) {
    if (r.id) {
      if (!existing.some((e) => e.id === r.id)) throw Object.assign(new Error('扣分规则不存在'), { status: 400 });
      db.prepare('UPDATE kpi_rules SET name = ?, points = ?, unit = ? WHERE id = ?').run(r.name, r.points, r.unit, r.id);
    } else {
      db.prepare('INSERT INTO kpi_rules (item_id, name, points, unit) VALUES (?, ?, ?, ?)').run(itemId, r.name, r.points, r.unit);
    }
  }
}

function runWrite(res, fn) {
  try {
    return db.transaction(fn)();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}

router.get('/items', (req, res) => {
  res.json(kpi.loadItems(db));
});

router.post('/items', (req, res) => {
  const parsed = parseItem(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  runWrite(res, () => {
    const nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM kpi_items').get().n;
    const info = db.prepare(`
      INSERT INTO kpi_items (sort_order, name, content, target, criteria, max_score, method, pass_line)
      VALUES (@sort_order, @name, @content, @target, @criteria, @max_score, @method, @pass_line)
    `).run({ ...parsed.item, sort_order: nextOrder });
    syncRules(info.lastInsertRowid, parsed.rules.map((r) => ({ ...r, id: null })));
    res.status(201).json(kpi.loadItems(db).find((it) => it.id === info.lastInsertRowid));
  });
});

router.put('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM kpi_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '未找到该考核项' });
  const parsed = parseItem(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  runWrite(res, () => {
    // 换计分方式会让已录入的分数含义变掉（百分制 vs 直接打分），有分数记录时不允许
    if (existing.method !== parsed.item.method) {
      const used = db.prepare('SELECT COUNT(*) AS n FROM kpi_scores WHERE item_id = ?').get(id).n;
      if (used) throw Object.assign(new Error(`该项已有 ${used} 条得分记录，不能更改计分方式`), { status: 409 });
    }
    db.prepare(`
      UPDATE kpi_items SET name = @name, content = @content, target = @target, criteria = @criteria,
        max_score = @max_score, method = @method, pass_line = @pass_line
      WHERE id = @id
    `).run({ ...parsed.item, id });
    syncRules(id, parsed.rules);
    res.json(kpi.loadItems(db).find((it) => it.id === id));
  });
});

router.delete('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const scores = db.prepare('SELECT COUNT(*) AS n FROM kpi_scores WHERE item_id = ?').get(id).n;
  const deductions = db.prepare(`
    SELECT COUNT(*) AS n FROM kpi_deductions d JOIN kpi_rules r ON r.id = d.rule_id WHERE r.item_id = ?
  `).get(id).n;
  if (scores + deductions) {
    return res.status(409).json({ error: `该项已有 ${scores + deductions} 条考核记录，不能删除` });
  }
  const info = db.prepare('DELETE FROM kpi_items WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: '未找到该考核项' });
  res.status(204).end();
});

// ---------- 扣分记录与得分录入 ----------

router.get('/records', (req, res) => {
  const month = monthParam(req, res);
  if (!month) return;
  res.json(kpi.loadMonthRecords(db, month));
});

router.post('/deductions', (req, res) => {
  const { staff_id, rule_id, date, note } = req.body;
  const quantity = Number(req.body.quantity ?? 1);
  if (!staff_id || !staffExists(staff_id)) return res.status(400).json({ error: '请选择教辅人员' });
  if (!db.prepare('SELECT 1 FROM kpi_rules WHERE id = ?').get(rule_id)) return res.status(400).json({ error: '请选择扣分项' });
  if (!kpi.DATE_RE.test(date || '')) return res.status(400).json({ error: '请选择日期' });
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: '数量应为正整数' });
  if (kpi.isArchived(db, date.slice(0, 7))) return res.status(409).json({ error: ARCHIVED_MSG });

  const info = db.prepare(`
    INSERT INTO kpi_deductions (staff_id, rule_id, date, quantity, note) VALUES (?, ?, ?, ?, ?)
  `).run(staff_id, rule_id, date, quantity, (note || '').trim() || null);
  res.status(201).json(db.prepare('SELECT * FROM kpi_deductions WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/deductions/:id', (req, res) => {
  const row = db.prepare('SELECT date FROM kpi_deductions WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '未找到该记录' });
  if (kpi.isArchived(db, row.date.slice(0, 7))) return res.status(409).json({ error: ARCHIVED_MSG });
  db.prepare('DELETE FROM kpi_deductions WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

router.post('/scores', (req, res) => {
  const { staff_id, item_id, date, note } = req.body;
  const score = Number(req.body.score);
  if (!staff_id || !staffExists(staff_id)) return res.status(400).json({ error: '请选择教辅人员' });
  const item = db.prepare('SELECT * FROM kpi_items WHERE id = ?').get(item_id);
  if (!item || item.method === 'deduct') return res.status(400).json({ error: '请选择需要录入分数的考核项' });
  if (!kpi.DATE_RE.test(date || '')) return res.status(400).json({ error: '请选择日期' });
  const max = item.method === 'ratio' ? 100 : item.max_score;
  if (req.body.score === '' || req.body.score == null || !(score >= 0 && score <= max)) {
    return res.status(400).json({ error: `分数应在 0~${max} 之间` });
  }
  if (kpi.isArchived(db, date.slice(0, 7))) return res.status(409).json({ error: ARCHIVED_MSG });

  const info = db.prepare(`
    INSERT INTO kpi_scores (staff_id, item_id, date, score, note) VALUES (?, ?, ?, ?, ?)
  `).run(staff_id, item_id, date, score, (note || '').trim() || null);
  res.status(201).json(db.prepare('SELECT * FROM kpi_scores WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/scores/:id', (req, res) => {
  const row = db.prepare('SELECT date FROM kpi_scores WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '未找到该记录' });
  if (kpi.isArchived(db, row.date.slice(0, 7))) return res.status(409).json({ error: ARCHIVED_MSG });
  db.prepare('DELETE FROM kpi_scores WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

// ---------- 月度结果、归档、历史、导出 ----------

router.get('/results', (req, res) => {
  const month = monthParam(req, res);
  if (!month) return;
  res.json(kpi.getMonthResult(db, month));
});

router.post('/archive', (req, res) => {
  const month = req.body.month;
  if (!kpi.MONTH_RE.test(month || '')) return res.status(400).json({ error: '月份格式应为 YYYY-MM' });
  if (kpi.isArchived(db, month)) return res.status(409).json({ error: '该月已经归档' });
  const result = kpi.computeMonth(db, month);
  if (!result.staff.length) return res.status(400).json({ error: '还没有教辅人员，无法归档' });
  db.prepare('INSERT INTO kpi_archives (month, data) VALUES (?, ?)').run(month, JSON.stringify(result));
  res.status(201).json(kpi.getMonthResult(db, month));
});

router.delete('/archive/:month', (req, res) => {
  const info = db.prepare('DELETE FROM kpi_archives WHERE month = ?').run(req.params.month);
  if (info.changes === 0) return res.status(404).json({ error: '该月未归档' });
  res.status(204).end();
});

// GET /api/kpi/history?end=YYYY-MM&months=6 -> 每人近几个月的总分（没有任何记录的月份为 null）
router.get('/history', (req, res) => {
  const end = req.query.end || kpi.currentMonth();
  if (!kpi.MONTH_RE.test(end)) return res.status(400).json({ error: '月份格式应为 YYYY-MM' });
  const count = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);

  const months = [];
  let [y, m] = end.split('-').map(Number);
  for (let i = 0; i < count; i++) {
    months.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }

  const byStaff = new Map();
  for (const s of db.prepare('SELECT id, name FROM staff ORDER BY name COLLATE NOCASE').all()) {
    byStaff.set(s.id, { staff_id: s.id, name: s.name, totals: {} });
  }
  for (const month of months) {
    const result = kpi.getMonthResult(db, month);
    for (const s of result.staff) {
      if (!byStaff.has(s.staff_id)) byStaff.set(s.staff_id, { staff_id: s.staff_id, name: s.name, totals: {} });
      byStaff.get(s.staff_id).totals[month] = s.has_records ? s.total : null;
    }
  }
  res.json({ months, staff: [...byStaff.values()] });
});

router.get('/export', async (req, res, next) => {
  const month = monthParam(req, res);
  if (!month) return;
  try {
    const result = kpi.getMonthResult(db, month);
    if (!result.staff.length) return res.status(400).json({ error: '还没有教辅人员，没有可导出的内容' });
    const buffer = await buildWorkbook(result);
    const filename = `绩效考核_${monthLabel(month)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kpi-${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
