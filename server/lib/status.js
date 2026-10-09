// Shared status helpers.
// Stored statuses are: 待开始 / 进行中 / 已完成
// "已逾期" (overdue) is never stored — it's derived: not completed AND past due date.

// 按《绩效考核表》里的实际工作划分。早期版本的类型（备课、上课等）仍保留在已有任务上，不会被改掉。
const TASK_TYPES = ['晚辅', '巩固练习', '测评', '模考', '组卷校对', '题库提交', '作业批改', '学员跟进', '磨课', '其他'];
const STORED_STATUSES = ['待开始', '进行中', '已完成'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(task, today = todayStr()) {
  return task.status !== '已完成' && !!task.due_date && task.due_date < today;
}

// The status the UI should show: the stored status, or 已逾期 if applicable.
function effectiveStatus(task, today = todayStr()) {
  return isOverdue(task, today) ? '已逾期' : task.status;
}

module.exports = { TASK_TYPES, STORED_STATUSES, todayStr, isOverdue, effectiveStatus };
