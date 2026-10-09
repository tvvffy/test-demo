const express = require('express');
const db = require('../db');
const { TASK_TYPES, STORED_STATUSES, todayStr, effectiveStatus } = require('../lib/status');

const router = express.Router();

function serialize(row, today) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    assignee_id: row.assignee_id,
    assignee_name: row.assignee_name,
    scheduled_date: row.scheduled_date,
    due_date: row.due_date,
    status: row.status,
    effective_status: effectiveStatus(row, today),
    notes: row.notes,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// GET /api/tasks?assignee_id=&status=&from=&to=
router.get('/', (req, res) => {
  const { assignee_id, status, from, to } = req.query;
  const clauses = [];
  const params = {};

  if (assignee_id) {
    clauses.push('t.assignee_id = @assignee_id');
    params.assignee_id = Number(assignee_id);
  }
  if (from) {
    clauses.push('(t.due_date IS NULL OR t.due_date >= @from)');
    params.from = from;
  }
  if (to) {
    clauses.push('(t.due_date IS NULL OR t.due_date <= @to)');
    params.to = to;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT t.*, s.name AS assignee_name
    FROM tasks t
    LEFT JOIN staff s ON s.id = t.assignee_id
    ${where}
    ORDER BY
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      t.created_at DESC
  `).all(params);

  const today = todayStr();
  let result = rows.map((r) => serialize(r, today));

  // status filter applies to the *effective* status (so 已逾期 works even though it's not stored)
  if (status) {
    result = result.filter((r) => r.effective_status === status);
  }

  res.json(result);
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { title, type, assignee_id, scheduled_date, due_date, notes } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '任务标题不能为空' });
  const finalType = TASK_TYPES.includes(type) ? type : '其他';

  const info = db.prepare(`
    INSERT INTO tasks (title, type, assignee_id, scheduled_date, due_date, notes, status, created_at, updated_at)
    VALUES (@title, @type, @assignee_id, @scheduled_date, @due_date, @notes, '待开始', datetime('now'), datetime('now'))
  `).run({
    title: title.trim(),
    type: finalType,
    assignee_id: assignee_id || null,
    scheduled_date: scheduled_date || null,
    due_date: due_date || null,
    notes: notes || null,
  });

  const row = db.prepare(`
    SELECT t.*, s.name AS assignee_name FROM tasks t
    LEFT JOIN staff s ON s.id = t.assignee_id WHERE t.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(serialize(row, todayStr()));
});

// PUT /api/tasks/:id  (partial update; used for edits and for status changes / mark complete)
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '未找到该任务' });

  const fields = ['title', 'type', 'assignee_id', 'scheduled_date', 'due_date', 'status', 'notes'];
  const next = { ...existing };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, f)) next[f] = req.body[f];
  }
  // 未改动的旧类型原样保留，只有传入了不认识的新类型才归为「其他」
  if (next.type && !TASK_TYPES.includes(next.type) && next.type !== existing.type) next.type = '其他';
  if (next.status && !STORED_STATUSES.includes(next.status)) next.status = existing.status;

  const completed_at =
    next.status === '已完成'
      ? (existing.status === '已完成' ? existing.completed_at : new Date().toISOString())
      : null;

  db.prepare(`
    UPDATE tasks SET
      title = @title, type = @type, assignee_id = @assignee_id,
      scheduled_date = @scheduled_date, due_date = @due_date,
      status = @status, notes = @notes, completed_at = @completed_at,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...next, completed_at, id });

  const row = db.prepare(`
    SELECT t.*, s.name AS assignee_name FROM tasks t
    LEFT JOIN staff s ON s.id = t.assignee_id WHERE t.id = ?
  `).get(id);
  res.json(serialize(row, todayStr()));
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: '未找到该任务' });
  res.status(204).end();
});

router.get('/meta/types', (req, res) => res.json(TASK_TYPES));

module.exports = router;
