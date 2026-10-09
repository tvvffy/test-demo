const path = require('path');
const express = require('express');

const staffRouter = require('./routes/staff');
const tasksRouter = require('./routes/tasks');
const statsRouter = require('./routes/stats');
const kpiRouter = require('./routes/kpi');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/staff', staffRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/stats', statsRouter);
app.use('/api/kpi', kpiRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`教辅管理工具已启动：http://localhost:${PORT}`);
});
