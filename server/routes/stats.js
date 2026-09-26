const express = require('express');
const db = require('../db');
const { todayStr, effectiveStatus } = require('../lib/status');

const router = express.Router();

function loadAllTasks() {
  return db.prepare(`
    SELECT t.*, s.id AS s_id, s.name AS s_name
    FROM tasks t
    LEFT JOIN staff s ON s.id = t.assignee_id
  `).all();
}

// GET /api/stats -> overall + per-staff + per-type completion picture
router.get('/', (req, res) => {
  const today = todayStr();
  const tasks = loadAllTasks().map((t) => ({ ...t, effective: effectiveStatus(t, today) }));

  const total = tasks.length;
  const completed = tasks.filter((t) => t.effective === '已完成').length;
  const inProgress = tasks.filter((t) => t.effective === '进行中').length;
  const notStarted = tasks.filter((t) => t.effective === '待开始').length;
  const overdue = tasks.filter((t) => t.effective === '已逾期').length;
  const completionRate = total ? Math.round((completed / total) * 1000) / 10 : 0;

  // per-staff breakdown, including staff with zero tasks
  const staffRows = db.prepare('SELECT id, name FROM staff ORDER BY name COLLATE NOCASE').all();
  const byStaff = staffRows.map((s) => {
    const mine = tasks.filter((t) => t.s_id === s.id);
    const mineCompleted = mine.filter((t) => t.effective === '已完成').length;
    const mineOverdue = mine.filter((t) => t.effective === '已逾期').length;
    return {
      staff_id: s.id,
      name: s.name,
      total: mine.length,
      completed: mineCompleted,
      overdue: mineOverdue,
      completion_rate: mine.length ? Math.round((mineCompleted / mine.length) * 1000) / 10 : 0,
    };
  });
  const unassigned = tasks.filter((t) => !t.s_id).length;

  // per-type breakdown
  const typeMap = new Map();
  for (const t of tasks) {
    const key = t.type || '其他';
    if (!typeMap.has(key)) typeMap.set(key, { type: key, total: 0, completed: 0 });
    const entry = typeMap.get(key);
    entry.total += 1;
    if (t.effective === '已完成') entry.completed += 1;
  }
  const byType = [...typeMap.values()].sort((a, b) => b.total - a.total);

  // overdue list (for a "needs attention" panel)
  const overdueList = tasks
    .filter((t) => t.effective === '已逾期')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    .map((t) => ({
      id: t.id,
      title: t.title,
      assignee_name: t.s_name,
      due_date: t.due_date,
      type: t.type,
    }));

  res.json({
    total,
    completed,
    in_progress: inProgress,
    not_started: notStarted,
    overdue,
    completion_rate: completionRate,
    unassigned,
    by_staff: byStaff,
    by_type: byType,
    overdue_list: overdueList,
  });
});

module.exports = router;
