function createSysmlWorkspace({ navigate, mount, activeModule }) {
  const { limits, modelKinds } = SysmlModel;
  const saveButton = mount.querySelector('#save-project');
  const saveStatus = mount.querySelector('#project-save-status');
  let focusedInput = null;
  mount.addEventListener('focusin', event => {
    const control = event.target;
    focusedInput = control.matches?.('.sysml-editor :is(input, textarea), .mission-editor input, .markov-editor :is(input, textarea)')
      ? { control, value: control.value }
      : null;
  });
  saveButton.addEventListener('click', () => void save());
  const navigation = sysmlElement('div', 'sysml-navigation');
  const modelLinks = sysmlElement('div', 'sysml-model-links');
  modelLinks.setAttribute('aria-label', 'SysML 모델');
  const newModelLink = sysmlButton('SysML 모델 추가', requestNewModel, { icon: 'plus', className: 'sysml-new-model' });
  navigation.append(newModelLink, modelLinks);
  const projects = sysmlElement('div', 'sysml-projects');
  const projectList = sysmlElement('div', 'sysml-project-list');
  const projectPlaceholder = sysmlElement('p', 'sysml-prompt');
  const projectHeading = sysmlElement('h2', '', '내 프로젝트');
  const dashboard = sysmlElement('div', 'sysml-dashboard');
  dashboard.append(projectHeading, projectList, projectPlaceholder);
  const sysml = sysmlElement('div', 'sysml-workspace');
  const empty = sysmlElement('div', 'sysml-empty');
  const emptyTitle = sysmlElement('h2');
  const emptyMessage = sysmlElement('p');
  const emptyAction = sysmlButton('SysML 모델 추가', requestNewModel, { icon: 'plus', className: 'sysml-primary' });
  empty.append(createSysmlIcon('model'), emptyTitle, emptyMessage, emptyAction);
  const file = sysmlElement('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  const dialog = sysmlElement('dialog', 'sysml-dialog');
  mount.append(dialog, file);

  let store = null;
  let history = null;
  let remoteStamp = '';
  let modelNavigationStamp = '';
  let projectListStamp = '';
  let records = [];
  let pendingSave = null;
  let switching = false;
  let projectListLoading = false;
  let projectListError = '';
  let statusMessage = '';
  let conflictDraft = null;
  let focusBeforeDialog = null;
  let dialogAction = null;
  let draftAvailable = true;

  const treeStates = new Map();
  const branchStates = new Map();
  const editor = createSysmlEditor({ edit: editModel, refreshSelection() {
    for (const button of modelLinks.querySelectorAll('[data-item-id]')) {
      button.setAttribute('aria-pressed', String(button.closest('[data-model-id]').dataset.modelId === model()?.id && button.dataset.itemId === editor.selectedId()));
    }
  }, renameModel: () => showModelDialog(model()), removeModel: () => removeModel() });
  const fta = createFaultTreeEditor({ project, edit, navigate, showModelDialog: showFtaModelDialog });
  const req = createReqWorkspace({ project, edit, navigate, renameModel: showReqModelDialog, removeModel: removeReqModel,
    requestModel() {
      if (project()) showReqModelDialog();
      else showProjectDialog(showReqModelDialog);
    }
  });
  const reqBar = createBar(false);
  req.element.prepend(reqBar.element);
  const ftaBar = createBar(false);
  fta.element.prepend(ftaBar.element);
  const projectBar = createBar(true);
  const editorBar = createBar(false);
  projects.append(projectBar.element, dashboard);
  sysml.append(editorBar.element, empty, editor.element);

  function createBar(isProjectPage) {
    const element = sysmlElement('section', 'sysml-project-bar');
    const identity = sysmlElement('div', 'sysml-project-identity');
    const title = sysmlElement('strong');
    const status = sysmlElement('span', 'sysml-save-status');
    status.setAttribute('role', 'status');
    identity.append(title, status);
    const actions = sysmlElement('div', 'sysml-actions');
    const json = sysmlButton('JSON 저장', () => exportProject());
    const conflict = sysmlButton('충돌 초안 JSON 저장', () => exportProject(conflictDraft));
    actions.append(json, conflict);
    let undoButton;
    let redoButton;
    if (isProjectPage) {
      actions.append(
        sysmlButton('JSON 열기', () => file.click()),
        sysmlButton('새 프로젝트', () => showProjectDialog(), { icon: 'plus' })
      );
    } else {
      undoButton = sysmlButton('실행 취소', () => undo(), { icon: 'undo' });
      redoButton = sysmlButton('다시 실행', () => redo(), { icon: 'redo' });
      undoButton.title = '실행 취소 (Ctrl+Z)';
      redoButton.title = '다시 실행 (Ctrl+Shift+Z)';
      actions.prepend(undoButton, redoButton);
      actions.append(sysmlButton('프로젝트 열기', () => navigate('projects')));
    }
    element.append(identity, actions);
    return { element, title, status, json, conflict, undoButton, redoButton };
  }

  function project() {
    return history?.value ?? null;
  }

  function model(projectValue = project()) {
    return projectValue ? SysmlModel.getModel(projectValue) : null;
  }

  function dirty() {
    return Boolean(project() && SysmlModel.contentStamp(project()) !== remoteStamp);
  }

  function writeDraft() {
    if (!project() || !store) return;
    if (dirty() || pendingSave) draftAvailable = store.writeDraft(project());
    else store.clearDraft(project().id);
  }

  function captureView() {
    const current = model();
    const center = editor.captureView();
    if (current && center) {
      current.viewCenter = { x: Math.round(center.x), y: Math.round(center.y) };
    }
  }

  function beforeReplacingProject() {
    if (switching || pendingSave) return false;
    if (!history) return true;
    if (!req.flushPending()) return false;
    captureView();
    writeDraft();
    return !dirty() || window.confirm(draftAvailable
      ? 'Supabase에 저장하지 않은 변경이 있습니다. 초안을 이 브라우저에 두고 다른 프로젝트로 이동할까요?'
      : '저장하지 않은 변경의 초안을 보관할 수 없습니다. 다른 프로젝트로 이동할까요?');
  }

  function openInWorkspace(nextProject, showProject = true) {
    const remote = SysmlModel.normalizeProject(nextProject);
    const workspaceData = { ...store.legacyWorkspaceData(), ...remote.workspaceData };
    history = SysmlModel.createHistory({ ...remote, workspaceData });
    remoteStamp = nextProject.isDraft || nextProject.revision === 0 ? '' : SysmlModel.contentStamp(remote);
    draftAvailable = true;
    conflictDraft = nextProject.conflictDraft ?? null;
    statusMessage = nextProject.storageError ?? (conflictDraft ? '서버에 더 최신 버전이 있습니다. 이전 초안을 JSON 파일로 저장할 수 있습니다.' : '');
    if (dirty()) writeDraft();
    if (showProject) navigate(model() ? 'sysml' : 'projects');
    render();
  }

  async function refreshProjects() {
    const currentStore = store;
    if (!currentStore || projectListLoading) return;
    projectListError = '';
    projectListLoading = true;
    render();
    try {
      const list = await currentStore.list();
      if (store === currentStore) records = list;
    } catch (error) {
      if (store === currentStore) {
        records = currentStore.listDrafts();
        projectListError = error.message;
      }
    } finally {
      if (store === currentStore) {
        projectListLoading = false;
        render();
      }
    }
  }

  async function openProject(id) {
    if (!store || !beforeReplacingProject()) return;
    switching = true;
    statusMessage = '';
    const currentStore = store;
    render();
    try {
      const nextProject = await currentStore.open(id);
      if (store !== currentStore) return;
      if (!nextProject) throw new Error('선택한 프로젝트를 열 수 없습니다.');
      openInWorkspace(nextProject);
      void currentStore.setLastProject(id, nextProject.revision > 0 && !nextProject.isDraft);
    } catch (error) {
      if (store === currentStore) statusMessage = error.message;
    } finally {
      if (store === currentStore) {
        switching = false;
        render();
      }
    }
  }

  async function importProject() {
    const selected = file.files?.[0];
    file.value = '';
    if (!selected || !store || !beforeReplacingProject()) return;
    switching = true;
    const currentStore = store;
    render();
    try {
      const imported = await currentStore.importFile(selected);
      if (store === currentStore) {
        openInWorkspace(imported);
        statusMessage = '프로젝트 JSON을 열었습니다. 이 사본을 Supabase에 저장할 수 있습니다.';
      }
    } catch (error) {
      if (store === currentStore) statusMessage = error.message;
    } finally {
      if (store === currentStore) {
        switching = false;
        render();
      }
    }
  }
  file.addEventListener('change', () => void importProject());

  function exportProject(snapshot) {
    if (!store || !project()) return;
    if (!snapshot) captureView();
    try {
      store.exportFile(snapshot ?? project());
    } catch (error) {
      statusMessage = error.message;
      render();
    }
  }

  function save() {
    if (pendingSave) return pendingSave;
    if (!project() || !store || switching) return Promise.resolve(false);
    if (document.activeElement?.matches('input, textarea, select, [contenteditable]')) document.activeElement.blur();
    if (!req.flushPending()) return Promise.resolve(false);
    captureView();
    writeDraft();
    const snapshot = structuredClone(project());
    const currentStore = store;
    statusMessage = '';
    pendingSave = saveSnapshot();
    render();
    return pendingSave;

    async function saveSnapshot() {
      let confirmed = false;
      try {
        const saved = await currentStore.save(snapshot);
        if (store !== currentStore || project()?.id !== saved.id) return false;
        project().revision = saved.revision;
        remoteStamp = SysmlModel.contentStamp(saved);
        const updated = { id: saved.id, title: saved.title, revision: saved.revision, updatedAt: saved.updatedAt };
        records = [updated, ...records.filter((item) => item.id !== saved.id)];
        confirmed = true;
        return true;
      } catch (error) {
        if (store === currentStore) {
          statusMessage = error.message;
          writeDraft();
        }
        return false;
      } finally {
        if (store === currentStore) {
          pendingSave = null;
          if (confirmed) writeDraft();
          render();
        }
      }
    }
  }

  function openDialog(title, initialName, kind, onApply, { derive = false, onDelete } = {}) {
    if (!store || switching || dialog.open) return;
    focusBeforeDialog = document.activeElement;
    dialogAction = onApply;
    const form = sysmlElement('form');
    const heading = sysmlElement('h2', '', title);
    heading.id = 'sysml-dialog-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    const name = sysmlElement('input');
    name.type = 'text';
    name.value = initialName;
    name.maxLength = limits.maxNameLength;
    name.required = true;
    name.autofocus = true;
    const nameLabel = sysmlElement('label', 'sysml-field', '이름');
    nameLabel.append(name);
    form.append(heading, nameLabel);
    let kindInput;
    if (kind) {
      const typeLabel = sysmlElement('label', 'sysml-field', '모델 유형');
      kindInput = sysmlElement('select');
      for (const [key, label] of Object.entries(modelKinds)) {
        const option = sysmlElement('option', '', label);
        option.value = key;
        kindInput.append(option);
      }
      kindInput.value = kind;
      typeLabel.append(kindInput);
      form.append(typeLabel);
    }
    const controls = sysmlElement('div', 'sysml-actions');
    const apply = sysmlElement('button', 'sysml-primary', onDelete ? '적용' : '만들기');
    apply.type = 'submit';
    controls.append(sysmlButton('취소', () => dialog.close()), apply);
    if (onDelete) controls.prepend(sysmlButton('모델 삭제', () => {
      if (onDelete()) dialog.close();
    }, { className: 'sysml-delete' }));
    if (derive) {
      const status = sysmlElement('p');
      status.hidden = true;
      status.setAttribute('role', 'status');
      controls.prepend(sysmlButton('Work Sheet Derive', () => {
        status.hidden = false;
        status.textContent = '워크시트 생성 기능은 준비 중입니다.';
      }));
      form.append(status);
    }
    form.append(controls);
    name.addEventListener('input', () => name.setCustomValidity(''));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!name.value.trim()) {
        name.setCustomValidity('이름을 입력하세요.');
        name.reportValidity();
        return;
      }
      const action = dialogAction;
      dialog.close();
      action(name.value.trim(), kindInput?.value);
    });
    dialog.replaceChildren(form);
    dialog.showModal();
    name.select();
  }
  dialog.addEventListener('close', () => {
    if (!dialog.open && focusBeforeDialog?.isConnected) focusBeforeDialog.focus({ preventScroll: true });
  });

  function showProjectDialog(afterCreate = null) {
    openDialog('새 프로젝트', '', null, (name) => {
      if (!beforeReplacingProject()) return;
      openInWorkspace(store.create(name));
      afterCreate?.();
    });
  }

  function requestNewModel() {
    if (project()) showModelDialog();
    else showProjectDialog(showModelDialog);
  }

  function showModelDialog(existing = null) {
    openDialog(existing ? 'SysML 모델 편집' : 'SysML 모델 추가', existing?.name ?? 'New SysML 모델', existing?.kind ?? 'system', (name, kind) => {
      captureView();
      if (existing) edit((draft) => SysmlModel.renameModel(SysmlModel.getModel(draft, existing.id), name, kind));
      else edit((draft) => SysmlModel.addModel(draft, name, kind));
      navigate('sysml');
    }, existing ? { derive: true, onDelete: () => removeModel(existing.id) } : undefined);
  }

  function showReqModelDialog(existing = null) {
    openDialog(existing ? 'Req 모델 편집' : 'Req 모델 추가', existing?.title ?? 'New Req 모델', null, name => {
      const id = edit(draft => {
        if (!existing) return ReqModel.addModel(draft.requirements, name).id;
        const target = draft.requirements.models.find(item => item.id === existing.id);
        target.title = name;
        return target.id;
      });
      if (id) req.activate(id);
    }, existing ? { onDelete: () => removeReqModel(existing.id) } : undefined);
  }

  function showFtaModelDialog(existing) {
    openDialog('FTA 모델 편집', existing.name, null, name => {
      edit(draft => { draft.diagrams.find(item => item.id === existing.id).name = name; });
    }, { onDelete: () => {
      if (!window.confirm(`‘${existing.name}’ FTA 모델과 소유 기호를 삭제할까요?`)) return false;
      return edit(draft => {
        draft.diagrams = draft.diagrams.filter(item => item.id !== existing.id);
        return true;
      }) === true;
    } });
  }

  function removeModel(id = model()?.id) {
    const target = project()?.models.find(item => item.id === id);
    if (switching || !target || !window.confirm(`‘${target.name}’ 모델과 다이어그램을 삭제할까요?`)) return false;
    return edit(draft => {
      SysmlModel.removeModel(draft, id);
      return true;
    }) === true;
  }

  function removeReqModel(id) {
    const target = project()?.requirements.models.find(item => item.id === id);
    if (switching || !target || !window.confirm(`‘${target.title}’ 모델과 소유 항목을 삭제할까요?`)) return false;
    return edit(draft => {
      const data = draft.requirements;
      ReqModel.remove(data, new Set(data.entities.filter(item => item.modelId === id).map(item => item.id)));
      data.models = data.models.filter(item => item.id !== id);
      return true;
    }) === true;
  }

  function activateModel(id) {
    if (!project() || switching) return;
    if (id !== project().activeModelId) {
      captureView();
      project().activeModelId = id;
      writeDraft();
    }
    navigate('sysml');
  }

  function editModel(update) {
    return edit((draft) => update(SysmlModel.getModel(draft)));
  }

  function edit(update) {
    if (!history || switching) return undefined;
    try {
      const result = history.apply(update);
      statusMessage = '';
      writeDraft();
      render();
      return result;
    } catch (error) {
      statusMessage = error.message;
      render();
      return undefined;
    }
  }

  function undo() {
    if (!switching && history?.undo()) {
      writeDraft();
      render();
    }
  }

  function redo() {
    if (!switching && history?.redo()) {
      writeDraft();
      render();
    }
  }

  function render() {
    const current = project();
    const currentModel = model();
    const currentModule = activeModule();
    const status = pendingSave ? 'Supabase에 저장 중…'
      : switching ? '프로젝트를 여는 중…'
        : statusMessage || (current ? (dirty() ? (draftAvailable ? '미저장 · 이 브라우저에 초안 보관' : '미저장') : `저장 완료 · 리비전 ${current.revision}`) : '');
    for (const bar of [projectBar, editorBar, ftaBar, reqBar]) {
      bar.title.textContent = current?.title ?? '프로젝트';
      bar.status.textContent = status;
      bar.status.classList.toggle('sysml-status-error', Boolean(statusMessage && !pendingSave && !switching));

      bar.json.disabled = !current;
      bar.conflict.hidden = !conflictDraft;
    }
    saveButton.disabled = !current || switching || Boolean(pendingSave);
    saveButton.textContent = pendingSave ? '저장 중…' : 'Supabase 저장';
    saveStatus.textContent = statusMessage || (pendingSave ? '저장 중…' : current && (dirty() ? '미저장' : '저장 완료'));
    saveStatus.hidden = !saveStatus.textContent;
    saveButton.title = status ? `전체 프로젝트 저장 (Ctrl+S) · ${status}` : '전체 프로젝트 저장 (Ctrl+S)';
    editorBar.undoButton.disabled = switching || !history?.canUndo;
    editorBar.redoButton.disabled = switching || !history?.canRedo;
    newModelLink.disabled = switching || !store;
    empty.hidden = Boolean(currentModel);
    editor.element.hidden = !currentModel;
    emptyTitle.textContent = current ? 'SysML 모델을 추가하세요' : '프로젝트를 먼저 여세요';
    emptyMessage.textContent = current ? '하드웨어, 소프트웨어 등 여러 모델을 한 프로젝트에서 관리할 수 있습니다.' : '새 프로젝트를 만들거나 기존 프로젝트를 열어 모델링을 시작하세요.';
    emptyAction.lastChild.textContent = current ? 'SysML 모델 추가' : '새 프로젝트와 모델 만들기';
    emptyAction.disabled = switching || !store;
    if (currentModule === 'sysml' || !currentModel) editor.render(currentModel);

    ftaBar.undoButton.disabled = editorBar.undoButton.disabled;
    ftaBar.redoButton.disabled = editorBar.redoButton.disabled;
    reqBar.undoButton.disabled = editorBar.undoButton.disabled;
    reqBar.redoButton.disabled = editorBar.redoButton.disabled;
    req.render(current, switching || !store, currentModule === 'requirements');
    fta.render(current, switching, currentModule === 'safety-fta');
    const navigationStamp = JSON.stringify([current?.id, current?.activeModelId, currentModule, current?.models.map(m => [m.id, m.name, m.kind, m.nodes.map(n => [n.id,n.name,n.type,n.parentId,n.x === null]), m.connectors])]);
    if (modelNavigationStamp !== navigationStamp) {
      modelNavigationStamp = navigationStamp;
      modelLinks.replaceChildren();
      for (const item of current?.models ?? []) {
        const button = sysmlButton(item.name, () => activateModel(item.id), { icon: 'model' });
        button.title = `${item.name} · ${modelKinds[item.kind]}`;
        if (item.id === current.activeModelId && currentModule === 'sysml') button.setAttribute('aria-current', 'true');
        const editModelName = event => {
          event.preventDefault();
          showModelDialog(item);
        };
        button.addEventListener('contextmenu', editModelName);
        button.addEventListener('keydown', event => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) editModelName(event);
        });
        const branch = sysmlElement('div', 'sysml-nav-branch');
        branch.dataset.modelId = item.id;
        const tree = sysmlElement('div', 'sysml-tree');
        const key = current.id + '/' + item.id;
        if (!treeStates.has(key)) treeStates.set(key, new Set());
        const open = () => activateModel(item.id);
        const add = sysmlButton('항목 추가', event => { open(); editor.showMenu(event, null); }, { icon: 'plus', iconOnly: true });
        const header = sysmlElement('div', 'sysml-nav-model');
        const toggle = sysmlButton(item.name, () => {
          branchStates.set(key, !tree.hidden);
          updateBranch();
        }, { className: 'sysml-tree-toggle', iconOnly: true });
        function updateBranch() {
          tree.hidden = branchStates.get(key) === true;
          toggle.textContent = tree.hidden ? '▸' : '▾';
          toggle.setAttribute('aria-expanded', String(!tree.hidden));
        }
        updateBranch();
        header.append(toggle, button, add);
        renderSysmlNavigationTree({
          model: item, tree, projectId: current.id, collapsed: treeStates.get(key),
          selectedId: () => activeModule() === 'sysml' && model()?.id === item.id ? editor.selectedId() : null,
          systemMenu(event) {
            event.preventDefault();
            open();
            showModelDialog(item);
          },
          selectTree(selection) { open(); editor.selectTree(selection); },
          itemMenu(event, kind, id) { open(); editor.showMenu(event, kind === 'node' ? id : null, null, kind === 'edge' ? id : null); }
        });
        branch.append(header, tree);
        modelLinks.append(branch);
      }
    }

    const summaries = records.filter((item) => item.id !== current?.id);
    if (current) summaries.unshift({ id: current.id, title: current.title, revision: current.revision, isDraft: current.revision === 0 });
    const listStamp = JSON.stringify([summaries, switching, Boolean(pendingSave)]);
    if (projectListStamp !== listStamp) {
      projectListStamp = listStamp;
      projectList.replaceChildren();
      for (const item of summaries) {
        const row = sysmlElement('div', 'sysml-project-row');
        const details = sysmlElement('div');
        const title = sysmlElement('strong', '', item.title);
        let caption = item.isDraft ? '브라우저 초안' : `리비전 ${item.revision}`;
        if (item.id === current?.id) caption = `현재 프로젝트 · ${caption}`;
        details.append(title, sysmlElement('span', '', caption));
        const button = sysmlButton('열기', () => void openProject(item.id));
        button.disabled = switching || Boolean(pendingSave);
        button.setAttribute('aria-label', `${item.title} 열기`);
        row.append(createSysmlIcon('model'), details, button);
        projectList.append(row);
      }
    }
    projectPlaceholder.textContent = projectListError || (projectListLoading ? '프로젝트 목록을 불러오는 중…' : (summaries.length ? '' : '프로젝트를 만들거나 프로젝트 JSON 파일을 여세요.'));
    projectPlaceholder.hidden = !projectPlaceholder.textContent;
  }

  async function start(client, userId) {
    const currentStore = createSysmlProjectStore(client, userId);
    store = currentStore;
    switching = true;
    void refreshProjects();
    try {
      const restored = await currentStore.restore();
      if (store === currentStore && restored) openInWorkspace(restored, false);
    } catch (error) {
      if (store === currentStore) statusMessage = error.message;
    } finally {
      if (store === currentStore) {
        switching = false;
        render();
      }
    }
  }

  window.addEventListener('beforeunload', (event) => {
    const typing = focusedInput?.control === document.activeElement && focusedInput.value !== focusedInput.control.value;
    if (!dirty() && !pendingSave && !req.hasPending() && !typing) return;
    event.preventDefault();
    event.returnValue = '';
  });

  return {
    navigation, projects, sysml, start, fta, req,
    projectData() {
      const id = project()?.id;
      if (!id) return null;
      return {
        systemElement(modelId, nodeId, projectId = id) {
          if (project()?.id !== id || projectId !== id) return null;
          return SysmlModel.getModel(project(), modelId)?.nodes.find(node => node.id === nodeId && node.type === 'element');
        },
        read: key => project()?.id === id ? project().workspaceData[key] : undefined,
        write: (key, value) => project()?.id === id &&
          edit(draft => { draft.workspaceData[key] = structuredClone(value); return true; })
      };
    },
    render(active, entering) {
      render();
      if (entering && active === 'sysml' && model()) editor.restoreView();
      if (entering && active === 'projects') void refreshProjects();
    },
    leaveEditor() {
      captureView();
      writeDraft();
    },
    stop() {
      if (dialog.open) dialog.close();
      treeStates.clear();
      branchStates.clear();
      store = null;
      history = null;
      records = [];
      remoteStamp = '';
      pendingSave = null;
      statusMessage = '';
      projectListError = '';
      projectListLoading = false;
      switching = false;
      conflictDraft = null;
      render();
    },
    async beforeLogout() {
      if (pendingSave) await pendingSave;
      const applied = req.flushPending();
      captureView();
      writeDraft();
      if (!applied) return window.confirm('적용하지 못한 요구사항 입력이 있습니다. 로그아웃할까요?');
      if (!dirty()) return true;
      if (draftAvailable) return window.confirm('Supabase에 저장하지 않은 변경이 이 브라우저의 초안에 있습니다. 로그아웃할까요?');
      return window.confirm('Supabase에 저장하지 않은 변경이 있습니다. 로그아웃할까요?');
    },
    handleKey(event) {
      const key = event.key.toLowerCase();
      const command = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (dialog.open) return false;
      if (command && key === 's' && project()) {
        if (event.target.matches?.('input, textarea')) event.target.blur();
        void save();
        return true;
      }
      if (!['sysml', 'requirements'].includes(activeModule())) return false;
      if (activeModule() === 'sysml') {
        if (key === 'delete' && !event.target.closest('input, textarea, select, [contenteditable]')) return editor.deleteSelection();
        if (key === 'escape' && editor.cancel()) return true;
      }
      if (!command || !['z', 'y'].includes(key) || event.target.closest('input, textarea, select, [contenteditable]')) return false;
      if (key === 'y' || event.shiftKey) redo();
      else undo();
      return true;
    }
  };
}
