// 数据库用的是 Node.js 自带的 SQLite，需要 22.13 / 23.4 及以上版本
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13) || (major === 23 && minor < 4)) {
  console.error(`需要 Node.js 22.13 或更高版本，当前是 ${process.versions.node}。`);
  console.error('请到 https://nodejs.org/zh-cn 下载安装 LTS 版本后再启动。');
  process.exit(1);
}

const path = require('path');
const { exec } = require('child_process');
const express = require('express');

const staffRouter = require('./routes/staff');
const tasksRouter = require('./routes/tasks');
const statsRouter = require('./routes/stats');
const kpiRouter = require('./routes/kpi');

const app = express();
const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;

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

// 双击启动脚本会设置 OPEN_BROWSER=1，启动后自动打开浏览器；打不开也没关系，地址已打印在窗口里
function openBrowser() {
  if (!process.env.OPEN_BROWSER) return;
  const cmd = process.platform === 'win32' ? `start "" "${URL}"`
    : process.platform === 'darwin' ? `open "${URL}"`
      : `xdg-open "${URL}"`;
  exec(cmd, () => {});
}

const server = app.listen(PORT, () => {
  console.log(`教辅管理工具已启动：${URL}`);
  openBrowser();
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`端口 ${PORT} 已被占用，工具可能已经在另一个窗口里运行了。`);
  console.error(`直接在浏览器打开 ${URL} 即可；或者关掉之前那个窗口再重新启动。`);
  openBrowser();
  process.exitCode = 1;
});
