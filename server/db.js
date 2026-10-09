const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// 用 Node.js 自带的 SQLite（node:sqlite），不需要另外编译安装数据库组件。
// 这里包一层，让各路由的写法保持简单：
//   - 命名参数（@name）只取 SQL 里用到的字段，对象里多余的字段忽略
//   - undefined 当作 NULL
//   - db.transaction(fn) 返回一个在事务里执行 fn 的函数，出错自动回滚
function bindArgs(sql, args) {
  const [first] = args;
  if (args.length === 1 && first && typeof first === 'object' && !Array.isArray(first) && !ArrayBuffer.isView(first)) {
    const params = {};
    for (const [, name] of sql.matchAll(/@([A-Za-z_]\w*)/g)) params[name] = first[name] === undefined ? null : first[name];
    return [params];
  }
  return args.map((v) => (v === undefined ? null : v));
}

function openDatabase(file) {
  const raw = new DatabaseSync(file);
  return {
    exec: (sql) => raw.exec(sql),
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        all: (...args) => stmt.all(...bindArgs(sql, args)),
        get: (...args) => stmt.get(...bindArgs(sql, args)),
        run: (...args) => stmt.run(...bindArgs(sql, args)),
      };
    },
    transaction(fn) {
      return (...args) => {
        raw.exec('BEGIN');
        try {
          const result = fn(...args);
          raw.exec('COMMIT');
          return result;
        } catch (e) {
          raw.exec('ROLLBACK');
          throw e;
        }
      };
    },
  };
}

const db = openDatabase(path.join(dataDir, 'jiaofu.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '其他',
    assignee_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    scheduled_date TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT '待开始',
    notes TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- 绩效考核项（对应考核表的一行）。method:
  --   deduct = 扣分制，满分起扣；ratio = 比例制，百分制分数换算；manual = 直接打分
  CREATE TABLE IF NOT EXISTS kpi_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    content TEXT,
    target TEXT,
    criteria TEXT,
    max_score REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'deduct',
    pass_line REAL
  );

  CREATE TABLE IF NOT EXISTS kpi_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES kpi_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    points REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT '次'
  );

  CREATE TABLE IF NOT EXISTS kpi_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    rule_id INTEGER NOT NULL REFERENCES kpi_rules(id),
    date TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kpi_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES kpi_items(id),
    date TEXT NOT NULL,
    score REAL NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 归档后的月度结果快照，之后改规则不会影响已归档月份
  CREATE TABLE IF NOT EXISTS kpi_archives (
    month TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    archived_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_kpi_deductions_date ON kpi_deductions(date);
  CREATE INDEX IF NOT EXISTS idx_kpi_scores_date ON kpi_scores(date);
`);

// 首次启动时按《绩效考核表（9月份暂行）》写入默认考核项，之后都在页面「考核规则」里改
const DEFAULT_KPI_ITEMS = [
  {
    name: '资料完成度',
    content: '组卷+校对（结合晚辅、巩固练习、测评和模考决定）；\n扣题组成题库，提交；',
    target: '要求资料\n100%完成',
    criteria: '晚辅资料18点前准备完毕；巩固练习、测评、模考试卷前一天晚上准备完毕；未及时完成每次扣3分；\n每月将课堂使用的晚辅题、巩固题、测评题及模考题提交，其中模考以套卷形式提交，以周为单位进行，未及时提交每次扣罚3分。',
    max_score: 15,
    method: 'deduct',
    rules: [['资料未按时准备', 3, '次'], ['题库未按时提交', 3, '次']],
  },
  {
    name: '带班、讲课完成度',
    content: '学员疑问解答、跟进，作业批改加分析\n主讲沟通',
    target: '①晚辅、巩固、测评、模考的学员要在主讲老师所在工作群内要进行说明；依托智慧批改，后台数据分析；\n②每次晚辅、巩固、模块测评至少添加2个学员微信，在讲解后做复盘，微信发送给学员。',
    criteria: '学员情况汇报（后台+沟通辅导整合一起）少1次扣3分；\n学员微信添加缺少1人扣2分；',
    max_score: 15,
    method: 'deduct',
    rules: [['学员情况汇报缺少', 3, '次'], ['学员微信添加缺少', 2, '人']],
  },
  {
    name: '跟进学员',
    content: '每天线上沟通3名同学',
    target: '包括主动询问学习情况、难点痛点、智慧教辅后台学习数据、情绪疏导、问题解答等',
    criteria: '有效沟通少1人扣1分；以周为单位进行追溯；日报中体现每天沟通人员。',
    max_score: 15,
    method: 'deduct',
    rules: [['有效沟通缺少', 1, '人']],
  },
  {
    name: '学员满意度',
    content: '包括教学辅助态度、题目讲解清晰、响应及时性、作业布置匹配度',
    target: '80+',
    criteria: '70分以下0分，其余按比例得分',
    max_score: 15,
    method: 'ratio',
    pass_line: 70,
    rules: [],
  },
  {
    name: '月度能力测评',
    content: '每月组织科目测评及讲课考核，题目从试卷随机抽取试讲并打分。',
    target: '80分+',
    criteria: '80分以下0分；其余按比例得分。',
    max_score: 15,
    method: 'ratio',
    pass_line: 80,
    rules: [],
  },
  {
    name: '磨课完成',
    content: '每周随机挑取1天进行集中磨课试讲；磨课内容选自晚辅题目，巩固练习，模块测评及模考题目；组织至少2名工作人员进行旁听打分',
    target: '要求提交视频材料验证材料',
    criteria: '缺少1次扣罚5分；85分以下0分；其余按比例得分。',
    max_score: 15,
    method: 'ratio',
    pass_line: 85,
    rules: [['缺少磨课', 5, '次']],
  },
  {
    name: '其他工作响应',
    content: '服从部门安排，配合完成其他相关工作',
    target: '90分+',
    criteria: '根据平时工作具体打分，未配合一次扣3分',
    max_score: 10,
    method: 'manual',
    rules: [['未配合工作安排', 3, '次']],
  },
];

const seeded = db.prepare("SELECT value FROM app_meta WHERE key = 'kpi_seeded'").get();
if (!seeded) {
  const insertItem = db.prepare(`
    INSERT INTO kpi_items (sort_order, name, content, target, criteria, max_score, method, pass_line)
    VALUES (@sort_order, @name, @content, @target, @criteria, @max_score, @method, @pass_line)
  `);
  const insertRule = db.prepare('INSERT INTO kpi_rules (item_id, name, points, unit) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    DEFAULT_KPI_ITEMS.forEach((item, i) => {
      const info = insertItem.run({ ...item, sort_order: i + 1, pass_line: item.pass_line ?? null });
      for (const [name, points, unit] of item.rules) insertRule.run(info.lastInsertRowid, name, points, unit);
    });
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('kpi_seeded', '1')").run();
  })();
}

module.exports = db;
