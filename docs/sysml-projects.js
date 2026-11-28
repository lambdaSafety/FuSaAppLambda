function createSysmlProjectStore(client, userId) {
  const summaries = 'id,title,revision,updated_at';
  const columns = `${summaries},schema_version,payload`;
  const draftPrefix = `fusa-sysml:${userId}:draft:`;
  const lastProjectKey = `fusa-sysml:${userId}:last`;
  const fileFormat = 'fusa-sysml-project';
  const workingCopies = new Map();
  const backups = new Map();

  function content(project) {
    return { title: project.title, schemaVersion: project.schemaVersion,
      activeModelId: project.activeModelId, models: project.models, diagrams: project.diagrams };
  }

  function sameContent(first, second) {
    return JSON.stringify(content(first)) === JSON.stringify(content(second));
  }

  function describeError(failure) {
    const code = {
      PT409: 'conflict', '42P01': 'setup', '42883': 'setup',
      PGRST202: 'setup', PGRST204: 'setup', PGRST205: 'setup'
    }[failure?.code] ?? 'storage';
    const message = {
      conflict: '서버에 더 최신 버전이 있습니다. 이 편집본을 JSON으로 저장한 뒤 서버 프로젝트를 다시 열 수 있습니다.',
      setup: 'Supabase에 프로젝트 저장용 마이그레이션을 적용해야 합니다.',
      storage: 'Supabase에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.'
    }[code];
    return Object.assign(new Error(message, { cause: failure }), { code });
  }

  function check({ data, error }) {
    if (error) throw describeError(error);
    return data;
  }

  function summary(row) {
    return { id: row.id, title: row.title, revision: row.revision, updatedAt: row.updated_at };
  }

  function fromRow(row) {
    return {
      ...SysmlModel.normalizeProject({ ...row.payload, ...summary(row), schemaVersion: row.schema_version }),
      updatedAt: row.updated_at
    };
  }

  function readLocal(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function writeLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function removeLocal(key) {
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // A blocked browser store cannot affect the remote save.
    }
  }

  function draftRecord(key) {
    const stored = readLocal(key);
    if (!stored?.project || !Number.isFinite(Date.parse(stored.draftAt))) return null;
    try {
      const project = SysmlModel.normalizeProject(stored.project);
      if (!key.startsWith(`${draftPrefix}${project.id}:`)) return null;
      return { key, project: { ...project, isDraft: true, draftAt: stored.draftAt } };
    } catch {
      return null;
    }
  }

  function drafts(id) {
    try {
      const prefix = id ? `${draftPrefix}${id}:` : draftPrefix;
      return Object.keys(localStorage).filter((key) => key.startsWith(prefix))
        .map(draftRecord).filter(Boolean)
        .sort((first, second) => Date.parse(second.project.draftAt) - Date.parse(first.project.draftAt));
    } catch {
      return [];
    }
  }

  function getDraft(id) {
    return drafts(id)[0]?.project ?? null;
  }

  function clearDraft(id) {
    removeLocal(workingCopies.get(id));
    workingCopies.delete(id);
  }

  function writeDraft(project) {
    const previousKey = workingCopies.get(project.id);
    const previous = previousKey ? draftRecord(previousKey)?.project : null;
    const key = `${draftPrefix}${project.id}:${SysmlModel.newId()}`;
    if (!writeLocal(key, { project, draftAt: new Date().toISOString() })) return false;

    // An immutable key lets another tab remove confirmed drafts without deleting a newer edit.
    workingCopies.set(project.id, key);
    if (previous && previous.revision < project.revision && !sameContent(previous, project)) {
      removeLocal(backups.get(project.id));
      backups.set(project.id, previousKey);
    } else {
      removeLocal(previousKey);
    }
    writeLocal(lastProjectKey, project.id);
    return true;
  }

  function pendingDrafts(project, records) {
    return records.filter((record) => {
      if (record.project.revision > project.revision || !sameContent(project, record.project)) return true;
      removeLocal(record.key);
      return false;
    }).map((record) => record.project);
  }

  function withDraft(project, records) {
    if (!project) return records[0]?.project ?? null;
    const pending = pendingDrafts(project, records);
    const latest = pending.find((draft) => draft.revision === project.revision);
    const conflict = pending.find((draft) => draft.revision < project.revision);
    const opened = latest ? { ...latest, updatedAt: project.updatedAt } : project;
    return conflict ? { ...opened, conflictDraft: conflict } : opened;
  }

  async function readProject(id) {
    const row = check(await client.from('projects').select(columns)
      .eq('owner_id', userId).eq('id', id).maybeSingle());
    return row ? fromRow(row) : null;
  }

  async function open(id) {
    try {
      const project = await readProject(id);
      return withDraft(project, drafts(id));
    } catch (error) {
      const draft = getDraft(id);
      if (draft) return { ...draft, storageError: error.message };
      throw error;
    }
  }

  async function setLastProject(id, remote = true) {
    writeLocal(lastProjectKey, id);
    if (!remote) return true;
    try {
      check(await client.rpc('remember_sysml_project', { p_user_id: userId, p_project_id: id }));
      return true;
    } catch {
      return false;
    }
  }

  async function restore() {
    const localId = readLocal(lastProjectKey);
    const draft = localId ? getDraft(localId) : null;
    try {
      const state = check(await client.from('workspace_state').select('project_id,opened_at')
        .eq('user_id', userId).maybeSingle());
      if (draft && localId !== state?.project_id && (!state || Date.parse(draft.draftAt) > Date.parse(state.opened_at))) {
        return await open(localId);
      }
      if (state) {
        const project = await open(state.project_id);
        if (project) return project;
      }
      const row = check(await client.from('projects').select(columns).eq('owner_id', userId)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle());
      return row ? withDraft(fromRow(row), drafts(row.id)) : null;
    } catch (error) {
      if (draft) return { ...draft, storageError: error.message };
      throw error;
    }
  }

  function listDrafts() {
    const projects = new Map();
    for (const { project } of drafts()) {
      if (!projects.has(project.id)) {
        const { id, title, revision, draftAt } = project;
        projects.set(id, { id, title, revision, updatedAt: draftAt, isDraft: true });
      }
    }
    return [...projects.values()];
  }

  async function list() {
    const rows = check(await client.from('projects').select(summaries)
      .eq('owner_id', userId).order('updated_at', { ascending: false }));
    const projects = new Map(listDrafts().map((draft) => [draft.id, draft]));
    for (const row of rows) projects.set(row.id, summary(row));
    return [...projects.values()].sort((first, second) =>
      Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
  }

  async function save(project) {
    const snapshot = SysmlModel.normalizeProject(project);
    const saved = fromRow(check(await client.rpc('save_sysml_project', {
      p_user_id: userId,
      p_project_id: snapshot.id,
      p_expected_revision: snapshot.revision,
      p_title: snapshot.title,
      p_schema_version: snapshot.schemaVersion,
      p_payload: { activeModelId: snapshot.activeModelId, models: snapshot.models, diagrams: snapshot.diagrams }
    }).single()));
    pendingDrafts(saved, drafts(saved.id));
    writeLocal(lastProjectKey, saved.id);
    return saved;
  }

  async function importFile(file) {
    let data;
    try {
      data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('프로젝트 JSON 파일을 읽을 수 없습니다.');
    }
    if (data?.format !== fileFormat || data.project?.schemaVersion !== 1) {
      throw new Error('지원하는 SysML 프로젝트 파일 형식이 아닙니다.');
    }
    return SysmlModel.normalizeProject({ ...data.project, id: SysmlModel.newId(), revision: 0 });
  }

  function exportFile(project) {
    const snapshot = SysmlModel.normalizeProject(project);
    const file = new Blob([JSON.stringify({ format: fileFormat, project: content(snapshot) }, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    const filename = snapshot.title.replace(/[<>:"/\\|?*]/g, '_').trim();
    link.href = url;
    link.download = `${filename || 'sysml-project'}.sysml-project.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    create: (title) => SysmlModel.createProject(title), open, restore, save, list, listDrafts,
    importFile, exportFile, setLastProject, writeDraft, getDraft, clearDraft
  };
}
