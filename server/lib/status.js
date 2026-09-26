// Shared status helpers.
// Stored statuses are: 待开始 / 进行中 / 已完成
// "已逾期" (overdue) is never stored — it's derived: not completed AND past due date.

const TASK_TYPES = ['备课', '上课', '批改作业', '家长沟通', '教研', '其他'];
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
