const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const SysmlModel = require('../docs/sysml-model.js');

test('a reordered Supabase JSON response clears the saved draft and preserves newer edits', async () => {
  const localStorage = Object.create(null);
  Object.defineProperties(localStorage, {
    getItem: { value: key => localStorage[key] ?? null },
    setItem: { value: (key, value) => { localStorage[key] = value; } },
    removeItem: { value: key => { delete localStorage[key]; } }
  });
  const script = fs.readFileSync(path.join(__dirname, '../docs/sysml-projects.js'), 'utf8');
  const runtime = vm.createContext({ SysmlModel, localStorage });
  vm.runInContext(script, runtime);

  let confirmSave;
  const client = {
    rpc(name, payload) {
      assert.equal(name, 'save_sysml_project');
      return { single: () => new Promise(resolve => {
        confirmSave = () => resolve({ data: {
          id: payload.p_project_id, title: payload.p_title,
          revision: payload.p_expected_revision + 1, schema_version: payload.p_schema_version,
          payload: { ...payload.p_payload, workspaceData: { fmea: [{ a: 1, z: 2 }] } }
        } });
      }) };
    }
  };
  const store = runtime.createSysmlProjectStore(client, 'test-user');
  const project = SysmlModel.normalizeProject({ ...store.create('프로젝트'), workspaceData: { fmea: [{ z: 2, a: 1 }] } });
  store.writeDraft(project);
  const saving = store.save(project);
  confirmSave();
  const saved = await saving;
  assert.equal(SysmlModel.contentStamp(project), SysmlModel.contentStamp(saved));
  assert.equal(store.getDraft(project.id), null);

  const savingAgain = store.save(saved);
  const newer = { ...saved, workspaceData: { fmea: [{ a: 3, z: 2 }] } };
  store.writeDraft(newer);
  confirmSave();
  const savedAgain = await savingAgain;
  assert.notEqual(SysmlModel.contentStamp(newer), SysmlModel.contentStamp(savedAgain));
  assert.equal(store.getDraft(project.id).workspaceData.fmea[0].a, 3);
});

test('legacy FTA and project placeholder names get descriptive labels', () => {
  const placeholder = '**ㅇㄴㅇㄹㄴㅇㄹ**';
  const project = SysmlModel.createProject(placeholder);
  project.diagrams = [{ id: 'fta', name: placeholder,
    nodes: [{ id: 'top', type: 'event', name: placeholder, x: 0, y: 0 }] }];
  const normalized = SysmlModel.normalizeProject(project);
  assert.equal(normalized.title, '안전 분석 프로젝트');
  assert.equal(normalized.diagrams[0].name, 'FTA 1');
  assert.equal(normalized.diagrams[0].nodes[0].name, '최상위 이벤트');
});
