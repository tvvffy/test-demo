(() => {
  'use strict';

  const state = {
    staff: [],
    tasks: [],
    stats: null,
    taskTypes: [],
    filters: { assignee_id: '', status: '' },
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
    await Promise.all([loadTasks(), loadStats()]);
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
            if (!confirm(`删除教辅人员「${s.name}」？其名下任务会变为未分配，不会被删除。`)) return;
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
    $('#taskType').value = task ? task.type : (state.taskTypes[0] || '其他');
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

  // ---------- init ----------

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initStaffModal();
    initTaskModal();
    initTaskFilters();
    refreshAll().catch((err) => console.error(err));
  });
})();
