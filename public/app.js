(() => {
  'use strict';

  const state = {
    staff: [],
    tasks: [],
    stats: null,
    taskTypes: [],
    filters: { assignee_id: '', status: '' },
    kpi: {
      month: new Date().toISOString().slice(0, 7),
      items: [],
      result: null,
      records: { deductions: [], scores: [] },
      history: null,
      recordFilter: '',
    },
  };

  const STATUS_META = {
    '待开始': { dot: 'dot-not-started' },
    '进行中': { dot: 'dot-in-progress' },
    '已完成': { dot: 'dot-completed' },
    '已逾期': { dot: 'dot-overdue' },
  };

  // ---------- utilities ----------

  function $(sel) { return document.querySelector(sel); }
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) {
      let msg = '请求失败';
      try { msg = (await res.json()).error || msg; } catch (_) {}
      toast(msg);
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function fmtDate(d) {
    if (!d) return '—';
    return d;
  }

  // ---------- theme ----------

  function initTheme() {
    const saved = localStorage.getItem('jf-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    $('#themeBtn').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme')
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('jf-theme', next);
    });
  }

  // ---------- tabs ----------

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        btn.classList.add('active');
        $(`#view-${btn.dataset.view}`).classList.add('active');
      });
    });
  }

  // ---------- data loading ----------

  async function loadStaff() {
    state.staff = await api('/api/staff');
    renderStaffSelects();
    renderStaffList();
  }

  async function loadTaskTypes() {
    state.taskTypes = await api('/api/tasks/meta/types');
    const sel = $('#taskType');
    sel.innerHTML = '';
    state.taskTypes.forEach((t) => sel.appendChild(el('option', { value: t }, t)));
  }

  async function loadTasks() {
    const params = new URLSearchParams();
    if (state.filters.assignee_id) params.set('assignee_id', state.filters.assignee_id);
    if (state.filters.status) params.set('status', state.filters.status);
    state.tasks = await api(`/api/tasks?${params.toString()}`);
    renderTasks();
  }

  async function loadStats() {
    state.stats = await api('/api/stats');
    renderStats();
  }

  async function refreshAll() {
    await Promise.all([loadStaff(), loadTaskTypes()]);
    await Promise.all([loadTasks(), loadStats(), loadKpi()]);
  }

  // ---------- render: staff selects & modal ----------

  function renderStaffSelects() {
    const filterSel = $('#filterAssignee');
    const taskSel = $('#taskAssignee');
    const prevFilter = filterSel.value;
    const prevTask = taskSel.value;

    filterSel.innerHTML = '';
    filterSel.appendChild(el('option', { value: '' }, '全部人员'));
    state.staff.forEach((s) => filterSel.appendChild(el('option', { value: s.id }, s.name)));
    filterSel.value = prevFilter;

    taskSel.innerHTML = '';
    taskSel.appendChild(el('option', { value: '' }, '未分配'));
    state.staff.forEach((s) => taskSel.appendChild(el('option', { value: s.id }, s.name)));
    taskSel.value = prevTask;
  }

  function renderStaffList() {
    const list = $('#staffList');
    list.innerHTML = '';
    if (!state.staff.length) {
      list.appendChild(el('li', {}, el('span', { style: 'color:var(--text-muted)' }, '还没有教辅人员，先在下面添加吧')));
      return;
    }
    state.staff.forEach((s) => {
      const li = el('li', {}, [
        el('span', {}, `${s.name}（${s.task_count} 个任务）`),
        el('button', {
          class: 'btn-text btn-danger-text',
          onclick: async () => {
            if (!confirm(`删除教辅人员「${s.name}」？\n其名下任务会变为未分配，不会被删除；\n其绩效考核记录会一并删除（已归档月份的结果不受影响）。`)) return;
            await api(`/api/staff/${s.id}`, { method: 'DELETE' });
            toast('已删除');
            await refreshAll();
          },
        }, '删除'),
      ]);
      list.appendChild(li);
    });
  }

  function initStaffModal() {
    const backdrop = $('#staffModalBackdrop');
    $('#staffBtn').addEventListener('click', () => backdrop.classList.add('open'));
    $('#staffCloseBtn').addEventListener('click', () => backdrop.classList.remove('open'));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.remove('open'); });

    $('#addStaffBtn').addEventListener('click', async () => {
      const input = $('#newStaffName');
      const name = input.value.trim();
      if (!name) return;
      try {
        await api('/api/staff', { method: 'POST', body: JSON.stringify({ name }) });
      } catch (_) { return; }
      input.value = '';
      toast('已添加');
      await refreshAll();
    });
    $('#newStaffName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('#addStaffBtn').click(); }
    });
  }

  // ---------- render: dashboard ----------

  function statTile(label, value, unit, accentClass) {
    return el('div', { class: `stat-tile ${accentClass || ''}` }, [
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, [value, unit ? el('span', { class: 'unit' }, unit) : null]),
    ]);
  }

  function renderStats() {
    const s = state.stats;
    if (!s) return;

    const tiles = $('#statTiles');
    tiles.innerHTML = '';
    tiles.appendChild(statTile('总任务数', String(s.total), null, ''));
    tiles.appendChild(statTile('完成率', String(s.completion_rate), '%', 'accent-good'));
    tiles.appendChild(statTile('进行中', String(s.in_progress), null, 'accent-blue'));
    tiles.appendChild(statTile('已逾期', String(s.overdue), null, s.overdue > 0 ? 'accent-critical' : ''));

    // per-staff meters
    const meters = $('#staffMeters');
    meters.innerHTML = '';
    if (!s.by_staff.length) {
      meters.appendChild(el('div', { class: 'empty-state' }, '还没有教辅人员，点右上角「👥」添加'));
    } else {
      s.by_staff.forEach((row) => {
        const pct = row.total ? row.completion_rate : 0;
        meters.appendChild(el('div', { class: 'meter-row' }, [
          el('div', { class: 'meter-name' }, [
            row.name,
            el('span', { class: 'sub' }, `${row.total}项`),
          ]),
          el('div', { class: 'meter-track' }, el('div', { class: 'meter-fill', style: `width:${pct}%` })),
          el('div', { class: 'meter-value' }, `${pct}%`),
        ]));
      });
      if (s.unassigned > 0) {
        meters.appendChild(el('div', { class: 'meter-row' }, [
          el('div', { class: 'meter-name' }, [
            '未分配',
            el('span', { class: 'sub' }, `${s.unassigned}项`),
          ]),
          el('div', { class: 'meter-track' }, el('div', { class: 'meter-fill', style: 'width:0%;background:var(--status-muted)' })),
          el('div', { class: 'meter-value' }, '—'),
        ]));
      }
    }

    // overdue list
    const overdueEl = $('#overdueList');
    overdueEl.innerHTML = '';
    if (!s.overdue_list.length) {
      overdueEl.appendChild(el('div', { class: 'empty-state' }, '目前没有逾期任务 🎉'));
    } else {
      s.overdue_list.forEach((t) => {
        overdueEl.appendChild(el('div', { class: 'overdue-item' }, [
          el('div', { class: 'title' }, t.title),
          el('div', { class: 'meta' }, `${t.assignee_name || '未分配'} · 截止 ${fmtDate(t.due_date)}`),
        ]));
      });
    }

    // type table
    const typeTable = $('#typeTable');
    typeTable.innerHTML = '';
    if (!s.by_type.length) {
      typeTable.appendChild(el('tr', {}, el('td', { colspan: '3', class: 'empty-state' }, '暂无数据')));
    } else {
      s.by_type.forEach((t) => {
        const pct = t.total ? Math.round((t.completed / t.total) * 100) : 0;
        typeTable.appendChild(el('tr', {}, [
          el('td', { class: 't-name' }, t.type),
          el('td', { class: 't-bar-cell' }, el('div', { class: 'mini-track' }, el('div', { class: 'mini-fill', style: `width:${pct}%` }))),
          el('td', { class: 't-count' }, `${t.completed}/${t.total}`),
        ]));
      });
    }
  }

  // ---------- render: tasks ----------

  function statusBadge(status) {
    const meta = STATUS_META[status] || STATUS_META['待开始'];
    return el('span', { class: 'badge' }, [
      el('span', { class: `dot ${meta.dot}` }),
      status,
    ]);
  }

  function renderTasks() {
    const wrap = $('#taskTableWrap');
    wrap.innerHTML = '';

    if (!state.tasks.length) {
      wrap.appendChild(el('div', { class: 'empty-state' }, '没有符合条件的任务。点右上「+ 新建任务」开始安排吧。'));
      return;
    }

    const table = el('table', { class: 'task-table' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { class: 'col-title' }, '任务'),
      el('th', {}, '类型'),
      el('th', {}, '负责人'),
      el('th', {}, '排期'),
      el('th', {}, '截止'),
      el('th', {}, '状态'),
      el('th', { class: 'col-actions' }, '操作'),
    ])));

    const tbody = el('tbody');
    state.tasks.forEach((t) => {
      const dueCell = el('td', {}, el('span', { class: t.effective_status === '已逾期' ? 'due-overdue' : '' }, fmtDate(t.due_date)));
      const titleCell = el('td', { class: 'col-title' }, [
        el('div', {}, t.title),
        t.notes ? el('div', { class: 'notes-hint' }, t.notes) : null,
      ]);

      const actions = el('td', { class: 'col-actions' });
      if (t.status !== '已完成') {
        actions.appendChild(el('button', {
          class: 'btn-text',
          title: '标记完成',
          onclick: async () => { await api(`/api/tasks/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: '已完成' }) }); toast('已标记完成'); await Promise.all([loadTasks(), loadStats()]); },
        }, '✅完成'));
      }
      actions.appendChild(el('button', { class: 'btn-text', onclick: () => openTaskModal(t) }, '编辑'));
      actions.appendChild(el('button', {
        class: 'btn-text btn-danger-text',
        onclick: async () => {
          if (!confirm(`删除任务「${t.title}」？`)) return;
          await api(`/api/tasks/${t.id}`, { method: 'DELETE' });
          toast('已删除');
          await Promise.all([loadTasks(), loadStats()]);
        },
      }, '删除'));

      tbody.appendChild(el('tr', {}, [
        titleCell,
        el('td', {}, el('span', { class: 'type-tag' }, t.type)),
        el('td', {}, t.assignee_name || '—'),
        el('td', {}, fmtDate(t.scheduled_date)),
        dueCell,
        el('td', {}, statusBadge(t.effective_status)),
        actions,
      ]));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function initTaskFilters() {
    $('#filterAssignee').addEventListener('change', (e) => { state.filters.assignee_id = e.target.value; loadTasks(); });
    $('#filterStatus').addEventListener('change', (e) => { state.filters.status = e.target.value; loadTasks(); });
  }

  // ---------- task modal ----------

  function openTaskModal(task) {
    $('#taskModalTitle').textContent = task ? '编辑任务' : '新建任务';
    $('#taskId').value = task ? task.id : '';
    $('#taskTitle').value = task ? task.title : '';
    const typeSel = $('#taskType');
    typeSel.querySelectorAll('option[data-legacy]').forEach((o) => o.remove());
    if (task && task.type && !state.taskTypes.includes(task.type)) {
      // 早期版本的任务类型不在新列表里，临时加一个选项，保存时原样保留
      typeSel.appendChild(el('option', { value: task.type, 'data-legacy': '1' }, task.type));
    }
    typeSel.value = task ? task.type : (state.taskTypes[0] || '其他');
    $('#taskAssignee').value = task && task.assignee_id ? task.assignee_id : '';
    $('#taskScheduled').value = task && task.scheduled_date ? task.scheduled_date : '';
    $('#taskDue').value = task && task.due_date ? task.due_date : '';
    $('#taskStatus').value = task ? task.status : '待开始';
    $('#taskNotes').value = task && task.notes ? task.notes : '';
    $('#taskModalBackdrop').classList.add('open');
    $('#taskTitle').focus();
  }

  function closeTaskModal() { $('#taskModalBackdrop').classList.remove('open'); }

  function initTaskModal() {
    $('#newTaskBtn').addEventListener('click', () => openTaskModal(null));
    $('#taskCancelBtn').addEventListener('click', closeTaskModal);
    $('#taskModalBackdrop').addEventListener('click', (e) => { if (e.target === $('#taskModalBackdrop')) closeTaskModal(); });

    $('#taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('#taskId').value;
      const payload = {
        title: $('#taskTitle').value.trim(),
        type: $('#taskType').value,
        assignee_id: $('#taskAssignee').value ? Number($('#taskAssignee').value) : null,
        scheduled_date: $('#taskScheduled').value || null,
        due_date: $('#taskDue').value || null,
        status: $('#taskStatus').value,
        notes: $('#taskNotes').value.trim() || null,
      };
      if (!payload.title) return;
      try {
        if (id) {
          await api(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          toast('已保存');
        } else {
          await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
          toast('已创建');
        }
      } catch (_) { return; }
      closeTaskModal();
      await Promise.all([loadTasks(), loadStats()]);
    });
  }

  // ---------- KPI: 绩效考核 ----------

  const METHOD_LABELS = { deduct: '扣分制（满分起扣）', ratio: '比例制（百分制换算）', manual: '直接打分' };

  function monthLabel(month) {
    const [y, m] = month.split('-');
    return `${y}年${Number(m)}月`;
  }

  function shiftMonth(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
  }

  // 新记录的默认日期：查看的是本月就用今天，否则用该月最后一天
  function defaultDateFor(month) {
    const today = new Date().toISOString().slice(0, 10);
    if (today.startsWith(month)) return today;
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  async function loadKpi() {
    const month = state.kpi.month;
    const [items, result, records, history] = await Promise.all([
      api('/api/kpi/items'),
      api(`/api/kpi/results?month=${month}`),
      api(`/api/kpi/records?month=${month}`),
      api(`/api/kpi/history?end=${month}&months=6`),
    ]);
    state.kpi.items = items;
    state.kpi.result = result;
    state.kpi.records = records;
    state.kpi.history = history;
    renderKpi();
  }

  function renderKpi() {
    const { month, result } = state.kpi;
    if (!result) return;
    $('#kpiMonth').value = month;
    $('#kpiArchiveBadge').hidden = !result.archived;
    $('#kpiArchiveBtn').textContent = result.archived ? '取消归档' : '归档本月';
    $('#kpiAddDeductionBtn').disabled = result.archived;
    $('#kpiAddScoreBtn').disabled = result.archived;
    $('#kpiResultsTitle').textContent = `${monthLabel(month)}考核结果`;

    const hint = $('#kpiResultsHint');
    const incomplete = result.staff.filter((s) => s.missing_items.length);
    if (result.archived) {
      hint.textContent = `本月已于 ${result.archived_at} 归档，结果已锁定。如需增删记录，请先取消归档。`;
    } else if (incomplete.length) {
      hint.textContent = `有 ${incomplete.length} 人存在未录入分数的项目（标「未录入」），未录入的项目按 0 分计入总分。`;
    } else {
      hint.textContent = '';
    }

    renderKpiResults();
    renderKpiRecords();
    renderKpiHistory();
  }

  function renderKpiResults() {
    const { result } = state.kpi;
    const wrap = $('#kpiResults');
    wrap.innerHTML = '';
    if (!result.staff.length) {
      wrap.appendChild(el('div', { class: 'empty-state' }, '还没有教辅人员，点右上角「👥」添加'));
      return;
    }

    const table = el('table', { class: 'kpi-table' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { class: 'num' }, '排名'),
      el('th', {}, '姓名'),
      ...result.items.map((it) => el('th', { class: 'num' }, [it.name, el('div', { class: 'sub' }, `满分 ${it.max_score}`)])),
      el('th', { class: 'num' }, ['总分', el('div', { class: 'sub' }, `满分 ${result.max_total}`)]),
    ])));

    const tbody = el('tbody');
    [...result.staff].sort((a, b) => a.rank - b.rank).forEach((s) => {
      tbody.appendChild(el('tr', { class: 'clickable', title: '点击查看明细', onclick: () => openKpiDetail(s.staff_id) }, [
        el('td', { class: 'num' }, String(s.rank)),
        el('td', { class: 'name' }, s.name),
        ...s.items.map((r) => el('td', { class: 'num' }, r.missing
          ? el('span', { class: 'pill-missing' }, '未录入')
          : [String(r.score), r.deduction > 0 ? el('div', { class: 'deduct' }, `扣 ${r.deduction}`) : null])),
        el('td', { class: 'num total' }, String(s.total)),
      ]));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // 台账里的一条记录（扣分或得分），返回 [考核项, 内容, 分数单元格]
  function describeRecord(r) {
    if (r.kind === 'deduction') {
      return [r.item_name, `${r.rule_name} ×${r.quantity}${r.unit}`, el('span', { class: 'deduct' }, `−${round2(r.points * r.quantity)}`)];
    }
    return [r.item_name, '录入得分', r.method === 'ratio' ? `${r.score}（百分制）` : String(r.score)];
  }

  async function deleteKpiRecord(r) {
    const label = r.kind === 'deduction' ? `${r.staff_name} ${r.date} 的「${r.rule_name}」扣分` : `${r.staff_name} ${r.date} 的「${r.item_name}」得分`;
    if (!confirm(`删除${label}记录？`)) return false;
    await api(`/api/kpi/${r.kind === 'deduction' ? 'deductions' : 'scores'}/${r.id}`, { method: 'DELETE' });
    toast('已删除');
    await loadKpi();
    return true;
  }

  function renderKpiRecords() {
    const { records, result, recordFilter } = state.kpi;
    const filterSel = $('#kpiRecordFilter');
    const prev = filterSel.value;
    filterSel.innerHTML = '';
    filterSel.appendChild(el('option', { value: '' }, '全部人员'));
    state.staff.forEach((s) => filterSel.appendChild(el('option', { value: s.id }, s.name)));
    filterSel.value = prev;

    const all = [
      ...records.deductions.map((d) => ({ kind: 'deduction', ...d })),
      ...records.scores.map((sc) => ({ kind: 'score', ...sc })),
    ]
      .filter((r) => !recordFilter || String(r.staff_id) === String(recordFilter))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));

    const wrap = $('#kpiRecords');
    wrap.innerHTML = '';
    if (!all.length) {
      wrap.appendChild(el('div', { class: 'empty-state' }, '本月还没有记录。遇到要扣分的事点「+ 记扣分」，满意度、测评、磨课分数点「+ 录入得分」。'));
      return;
    }

    const table = el('table', { class: 'task-table' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', {}, '日期'), el('th', {}, '人员'), el('th', {}, '考核项'), el('th', {}, '内容'),
      el('th', {}, '分数'), el('th', {}, '备注'), el('th', { class: 'col-actions' }, ''),
    ])));
    const tbody = el('tbody');
    all.forEach((r) => {
      const [itemName, content, scoreCell] = describeRecord(r);
      tbody.appendChild(el('tr', {}, [
        el('td', {}, r.date),
        el('td', {}, r.staff_name),
        el('td', {}, el('span', { class: 'type-tag' }, itemName)),
        el('td', {}, content),
        el('td', {}, scoreCell),
        el('td', { class: 'notes-cell' }, r.note || ''),
        el('td', { class: 'col-actions' }, result.archived ? null : el('button', {
          class: 'btn-text btn-danger-text', onclick: () => deleteKpiRecord(r),
        }, '删除')),
      ]));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function renderKpiHistory() {
    const { history } = state.kpi;
    const wrap = $('#kpiHistory');
    wrap.innerHTML = '';
    if (!history || !history.staff.length) {
      wrap.appendChild(el('div', { class: 'empty-state' }, '暂无数据'));
      return;
    }
    const months = history.months;
    const last = months[months.length - 1];
    const prev = months[months.length - 2];

    const table = el('table', { class: 'kpi-table' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', {}, '姓名'),
      ...months.map((m) => el('th', { class: 'num' }, `${Number(m.slice(5))}月`)),
      el('th', { class: 'num' }, '较上月'),
    ])));
    const tbody = el('tbody');
    history.staff.forEach((s) => {
      const cur = s.totals[last];
      const before = s.totals[prev];
      let delta = '—';
      let deltaClass = '';
      if (cur != null && before != null) {
        const d = round2(cur - before);
        delta = d > 0 ? `↑ ${d}` : d < 0 ? `↓ ${Math.abs(d)}` : '持平';
        deltaClass = d > 0 ? 'up' : d < 0 ? 'down' : '';
      }
      tbody.appendChild(el('tr', {}, [
        el('td', { class: 'name' }, s.name),
        ...months.map((m) => el('td', { class: 'num' }, s.totals[m] == null ? '—' : String(s.totals[m]))),
        el('td', { class: `num delta ${deltaClass}` }, delta),
      ]));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function openKpiDetail(staffId) {
    const { result, month } = state.kpi;
    const s = result.staff.find((x) => x.staff_id === staffId);
    if (!s) return;
    $('#kpiDetailTitle').textContent = `${s.name} · ${monthLabel(month)}绩效明细（总分 ${s.total} / ${result.max_total}）`;
    const body = $('#kpiDetailBody');
    body.innerHTML = '';
    result.items.forEach((item, i) => {
      const r = s.items[i];
      const recordList = el('ul', { class: 'detail-records' });
      r.records.forEach((rec) => {
        const [, content, scoreCell] = describeRecord({ ...rec, item_name: item.name, method: item.method });
        recordList.appendChild(el('li', {}, [
          el('span', { class: 'date' }, rec.date),
          el('span', { class: 'content' }, [content, rec.note ? el('span', { class: 'note' }, ` · ${rec.note}`) : null]),
          el('span', { class: 'score' }, scoreCell),
          result.archived ? null : el('button', {
            class: 'btn-text btn-danger-text',
            onclick: async () => {
              if (await deleteKpiRecord({ ...rec, staff_name: s.name, rule_name: rec.rule_name, item_name: item.name })) {
                openKpiDetail(staffId);
              }
            },
          }, '删除'),
        ]));
      });
      body.appendChild(el('div', { class: 'detail-item' }, [
        el('div', { class: 'detail-head' }, [
          el('span', { class: 'name' }, item.name),
          el('span', { class: 'score' }, r.missing ? el('span', { class: 'pill-missing' }, '未录入') : `${r.score} / ${item.max_score}`),
        ]),
        el('div', { class: 'detail-text' }, r.detail),
        r.records.length ? recordList : null,
      ]));
    });
    openModal('#kpiDetailBackdrop');
  }

  // ----- 记扣分 -----

  function fillStaffSelect(sel, keep) {
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '' }, '请选择'));
    state.staff.forEach((s) => sel.appendChild(el('option', { value: s.id }, s.name)));
    if (keep && state.staff.some((s) => String(s.id) === String(keep))) sel.value = keep;
  }

  function findRule(ruleId) {
    for (const item of state.kpi.items) {
      const rule = item.rules.find((r) => String(r.id) === String(ruleId));
      if (rule) return { item, rule };
    }
    return null;
  }

  function updateDeductionPreview() {
    const found = findRule($('#deductionRule').value);
    $('#deductionUnit').textContent = found ? found.rule.unit : '次';
    const expected = $('#deductionExpected').value;
    const actual = $('#deductionActual').value;
    if (expected !== '' && actual !== '') {
      $('#deductionQty').value = Math.max(0, Number(expected) - Number(actual));
    }
    const qty = Number($('#deductionQty').value);
    const preview = $('#deductionPreview');
    if (!found) { preview.textContent = ''; return; }
    if (!(qty >= 1)) {
      preview.textContent = expected !== '' && actual !== '' ? '没有缺少，无需扣分' : '';
      return;
    }
    preview.textContent = `将从「${found.item.name}」扣 ${round2(found.rule.points * qty)} 分`;
  }

  function openDeductionModal() {
    const sel = $('#deductionRule');
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '' }, '请选择'));
    state.kpi.items.filter((it) => it.rules.length).forEach((item) => {
      sel.appendChild(el('optgroup', { label: item.name }, item.rules.map((r) => (
        el('option', { value: r.id }, `${r.name}（每${r.unit}扣 ${r.points} 分）`)
      ))));
    });
    fillStaffSelect($('#deductionStaff'), $('#deductionStaff').value);
    $('#deductionDate').value = defaultDateFor(state.kpi.month);
    $('#deductionQty').value = 1;
    $('#deductionExpected').value = '';
    $('#deductionActual').value = '';
    $('#deductionNote').value = '';
    updateDeductionPreview();
    openModal('#deductionModalBackdrop');
  }

  async function submitDeduction(e) {
    e.preventDefault();
    const found = findRule($('#deductionRule').value);
    const qty = Number($('#deductionQty').value);
    if (!(qty >= 1)) { toast('数量至少为 1'); return; }
    const expected = $('#deductionExpected').value;
    const actual = $('#deductionActual').value;
    let note = $('#deductionNote').value.trim();
    if (!note && expected !== '' && actual !== '' && found) {
      note = `应${expected}${found.rule.unit}，实际${actual}${found.rule.unit}`;
    }
    const date = $('#deductionDate').value;
    try {
      await api('/api/kpi/deductions', {
        method: 'POST',
        body: JSON.stringify({
          staff_id: Number($('#deductionStaff').value) || null,
          rule_id: Number($('#deductionRule').value) || null,
          date,
          quantity: qty,
          note,
        }),
      });
    } catch (_) { return; }
    closeModal('#deductionModalBackdrop');
    toast(date.startsWith(state.kpi.month) ? '已记录' : `已记到 ${monthLabel(date.slice(0, 7))}`);
    await loadKpi();
  }

  // ----- 录入得分 -----

  function scoreItems() {
    return state.kpi.items.filter((it) => it.method !== 'deduct');
  }

  function updateScorePreview() {
    const item = scoreItems().find((it) => String(it.id) === $('#scoreItem').value);
    const input = $('#scoreValue');
    const label = $('#scoreValueLabel');
    const preview = $('#scorePreview');
    if (!item) { label.textContent = '分数'; preview.textContent = ''; return; }

    const max = item.method === 'ratio' ? 100 : item.max_score;
    input.max = max;
    label.textContent = item.method === 'ratio' ? '分数（百分制 0~100）' : `分数（0~${max}）`;

    const parts = [];
    const v = input.value === '' ? null : Number(input.value);
    if (v != null && item.method === 'ratio') {
      parts.push(item.pass_line != null && v < item.pass_line
        ? `低于 ${item.pass_line} 分，记 0 分`
        : `折合 ${round2((v / 100) * item.max_score)} / ${item.max_score} 分`);
    }
    const staffId = $('#scoreStaff').value;
    const existing = state.kpi.records.scores.filter((sc) => String(sc.staff_id) === staffId && sc.item_id === item.id).length;
    if (staffId && existing) parts.push(`本月已录入 ${existing} 条，将按平均分计算`);
    preview.textContent = parts.join('；');
  }

  function openScoreModal() {
    const sel = $('#scoreItem');
    const prev = sel.value;
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '' }, '请选择'));
    scoreItems().forEach((it) => {
      const desc = it.method === 'ratio'
        ? `百分制${it.pass_line != null ? `，${it.pass_line}分以下记0分` : ''}`
        : `直接打分，满分${it.max_score}`;
      sel.appendChild(el('option', { value: it.id }, `${it.name}（${desc}）`));
    });
    if (scoreItems().some((it) => String(it.id) === prev)) sel.value = prev;
    fillStaffSelect($('#scoreStaff'), $('#scoreStaff').value);
    $('#scoreDate').value = defaultDateFor(state.kpi.month);
    $('#scoreValue').value = '';
    $('#scoreNote').value = '';
    updateScorePreview();
    openModal('#scoreModalBackdrop');
  }

  async function submitScore(e) {
    e.preventDefault();
    const date = $('#scoreDate').value;
    try {
      await api('/api/kpi/scores', {
        method: 'POST',
        body: JSON.stringify({
          staff_id: Number($('#scoreStaff').value) || null,
          item_id: Number($('#scoreItem').value) || null,
          date,
          score: $('#scoreValue').value,
          note: $('#scoreNote').value.trim(),
        }),
      });
    } catch (_) { return; }
    closeModal('#scoreModalBackdrop');
    toast(date.startsWith(state.kpi.month) ? '已录入' : `已录入到 ${monthLabel(date.slice(0, 7))}`);
    await loadKpi();
  }

  // ----- 考核规则 -----

  function ruleRow(rule) {
    const row = el('div', { class: 'rule-row' }, [
      el('input', { type: 'text', class: 'r-name', placeholder: '扣分项名称，如：资料未按时准备' }),
      el('span', { class: 'r-label' }, '每'),
      el('input', { type: 'text', class: 'r-unit', placeholder: '次' }),
      el('span', { class: 'r-label' }, '扣'),
      el('input', { type: 'number', class: 'r-points', min: '0', step: '0.5' }),
      el('span', { class: 'r-label' }, '分'),
      el('button', { type: 'button', class: 'btn-text btn-danger-text', onclick: () => row.remove() }, '移除'),
    ]);
    if (rule && rule.id) row.dataset.id = rule.id;
    row.querySelector('.r-name').value = rule ? rule.name : '';
    row.querySelector('.r-unit').value = rule ? rule.unit : '次';
    row.querySelector('.r-points').value = rule ? rule.points : '';
    return row;
  }

  function itemCard(item) {
    const card = el('form', { class: 'rule-card' });
    const field = (label, input, cls = '') => el('div', { class: `field ${cls}` }, [el('label', {}, label), input]);

    const name = el('input', { type: 'text', required: 'required' });
    const maxScore = el('input', { type: 'number', min: '0', step: '0.5', required: 'required' });
    const method = el('select', {}, Object.entries(METHOD_LABELS).map(([v, l]) => el('option', { value: v }, l)));
    const passLine = el('input', { type: 'number', min: '0', max: '100', step: '0.5', placeholder: '不设则留空' });
    const passField = field('及格线（低于记 0 分）', passLine, 'f-pass');
    const content = el('textarea', { rows: '2' });
    const target = el('textarea', { rows: '2' });
    const criteria = el('textarea', { rows: '3' });
    const rulesBox = el('div', { class: 'rules-box' });

    name.value = item ? item.name : '';
    maxScore.value = item ? item.max_score : '';
    method.value = item ? item.method : 'deduct';
    passLine.value = item && item.pass_line != null ? item.pass_line : '';
    content.value = item && item.content ? item.content : '';
    target.value = item && item.target ? item.target : '';
    criteria.value = item && item.criteria ? item.criteria : '';
    (item ? item.rules : []).forEach((r) => rulesBox.appendChild(ruleRow(r)));

    const syncMethod = () => { passField.style.display = method.value === 'ratio' ? '' : 'none'; };
    method.addEventListener('change', syncMethod);
    syncMethod();

    card.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field grow' }, [el('label', {}, '考核项'), name]),
      field('分值', maxScore, 'f-score'),
      field('计分方式', method, 'f-method'),
      passField,
    ]));
    card.appendChild(el('div', { class: 'rules-title' }, '扣分规则'));
    card.appendChild(rulesBox);
    card.appendChild(el('button', { type: 'button', class: 'btn-text', onclick: () => rulesBox.appendChild(ruleRow(null)) }, '+ 添加扣分规则'));
    card.appendChild(el('details', {}, [
      el('summary', {}, '考核表文字（导出 Excel 时使用）'),
      field('具体内容', content),
      field('目标', target),
      field('评价标准', criteria),
    ]));

    const actions = el('div', { class: 'rule-card-actions' });
    if (item) {
      actions.appendChild(el('button', {
        type: 'button',
        class: 'btn-text btn-danger-text',
        onclick: async () => {
          if (!confirm(`删除考核项「${item.name}」？`)) return;
          try { await api(`/api/kpi/items/${item.id}`, { method: 'DELETE' }); } catch (_) { return; }
          toast('已删除');
          card.remove();
          await loadKpi();
          updateRulesTotal();
        },
      }, '删除此项'));
    } else {
      actions.appendChild(el('button', { type: 'button', class: 'btn-text', onclick: () => { card.remove(); updateRulesTotal(); } }, '取消'));
    }
    actions.appendChild(el('button', { type: 'submit', class: 'btn btn-primary' }, item ? '保存' : '添加'));
    card.appendChild(actions);

    card.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: name.value.trim(),
        max_score: maxScore.value,
        method: method.value,
        pass_line: method.value === 'ratio' ? passLine.value : null,
        content: content.value.trim(),
        target: target.value.trim(),
        criteria: criteria.value.trim(),
        rules: [...rulesBox.querySelectorAll('.rule-row')]
          .map((row) => ({
            id: row.dataset.id ? Number(row.dataset.id) : null,
            name: row.querySelector('.r-name').value.trim(),
            unit: row.querySelector('.r-unit').value.trim(),
            points: row.querySelector('.r-points').value,
          }))
          .filter((r) => r.id || r.name || r.points !== ''),
      };
      let saved;
      try {
        saved = await api(item ? `/api/kpi/items/${item.id}` : '/api/kpi/items', {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        });
      } catch (_) { return; }
      toast('已保存');
      // 只替换这一张卡片，其他卡片里没保存的修改不受影响
      card.replaceWith(itemCard(saved));
      await loadKpi();
      updateRulesTotal();
    });
    return card;
  }

  function updateRulesTotal() {
    const total = round2(state.kpi.items.reduce((sum, it) => sum + it.max_score, 0));
    const elTotal = $('#kpiRulesTotal');
    elTotal.textContent = `分值合计 ${total} 分${total === 100 ? '' : '（注意：不是 100 分）'}`;
    elTotal.className = total === 100 ? '' : 'warn';
  }

  function renderRulesModal() {
    const body = $('#kpiRulesBody');
    body.innerHTML = '';
    state.kpi.items.forEach((item) => body.appendChild(itemCard(item)));
    updateRulesTotal();
  }

  // ----- 导出 / 归档 / 初始化 -----

  async function exportKpi() {
    const month = state.kpi.month;
    const res = await fetch(`/api/kpi/export?month=${month}`);
    if (!res.ok) {
      let msg = '导出失败';
      try { msg = (await res.json()).error || msg; } catch (_) {}
      toast(msg);
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = el('a', { href: url, download: `绩效考核_${monthLabel(month)}.xlsx` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function toggleArchive() {
    const { month, result } = state.kpi;
    if (result.archived) {
      if (!confirm(`取消归档后，${monthLabel(month)}的得分会按当前规则重新计算。确定取消归档？`)) return;
      await api(`/api/kpi/archive/${month}`, { method: 'DELETE' });
      toast('已取消归档');
    } else {
      if (!confirm(`归档后${monthLabel(month)}的结果会被锁定：不能再增删记录，之后修改考核规则也不影响本月。确定归档？`)) return;
      await api('/api/kpi/archive', { method: 'POST', body: JSON.stringify({ month }) });
      toast('已归档');
    }
    await loadKpi();
  }

  function setKpiMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    state.kpi.month = month;
    loadKpi().catch((err) => console.error(err));
  }

  function initKpi() {
    $('#kpiMonth').value = state.kpi.month;
    $('#kpiMonth').addEventListener('change', (e) => setKpiMonth(e.target.value));
    $('#kpiPrevMonth').addEventListener('click', () => setKpiMonth(shiftMonth(state.kpi.month, -1)));
    $('#kpiNextMonth').addEventListener('click', () => setKpiMonth(shiftMonth(state.kpi.month, 1)));
    $('#kpiRecordFilter').addEventListener('change', (e) => { state.kpi.recordFilter = e.target.value; renderKpiRecords(); });

    $('#kpiAddDeductionBtn').addEventListener('click', openDeductionModal);
    $('#kpiAddScoreBtn').addEventListener('click', openScoreModal);
    $('#kpiExportBtn').addEventListener('click', () => exportKpi().catch((err) => console.error(err)));
    $('#kpiArchiveBtn').addEventListener('click', () => toggleArchive().catch((err) => console.error(err)));
    $('#kpiRulesBtn').addEventListener('click', () => { renderRulesModal(); openModal('#kpiRulesBackdrop'); });
    $('#kpiAddItemBtn').addEventListener('click', () => {
      const card = itemCard(null);
      $('#kpiRulesBody').appendChild(card);
      card.querySelector('input').focus();
    });

    $('#deductionForm').addEventListener('submit', submitDeduction);
    ['#deductionRule', '#deductionExpected', '#deductionActual'].forEach((id) => {
      $(id).addEventListener('input', updateDeductionPreview);
    });
    $('#deductionQty').addEventListener('input', () => {
      // 手动改数量时，清掉应完成/实际完成，避免数量又被自动算回去
      $('#deductionExpected').value = '';
      $('#deductionActual').value = '';
      updateDeductionPreview();
    });

    $('#scoreForm').addEventListener('submit', submitScore);
    ['#scoreItem', '#scoreValue', '#scoreStaff'].forEach((id) => $(id).addEventListener('input', updateScorePreview));

    // 绩效相关弹窗：点遮罩或「取消/关闭」关闭
    ['#deductionModalBackdrop', '#scoreModalBackdrop', '#kpiDetailBackdrop', '#kpiRulesBackdrop'].forEach((id) => {
      const backdrop = $(id);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(id); });
      backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(id)));
    });
  }

  // ---------- init ----------

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initStaffModal();
    initTaskModal();
    initTaskFilters();
    initKpi();
    refreshAll().catch((err) => console.error(err));
  });
})();
