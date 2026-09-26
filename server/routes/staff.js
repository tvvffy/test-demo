const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/staff -> list all staff with task counts
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.created_at,
           COUNT(t.id) AS task_count
    FROM staff s
    LEFT JOIN tasks t ON t.assignee_id = s.id
    GROUP BY s.id
    ORDER BY s.name COLLATE NOCASE
  `).all();
  res.json(rows);
});

// POST /api/staff { name }
router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '姓名不能为空' });
  try {
    const info = db.prepare('INSERT INTO staff (name) VALUES (?)').run(name);
    const row = db.prepare('SELECT id, name, created_at FROM staff WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: '该教辅人员已存在' });
    }
    res.status(500).json({ error: '创建失败' });
  }
});

// DELETE /api/staff/:id -> also unassigns their tasks (kept, just unassigned)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM staff WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: '未找到该人员' });
  res.status(204).end();
});

module.exports = router;
