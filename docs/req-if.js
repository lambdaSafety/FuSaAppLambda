const ReqIf = (() => {
  const namespace = 'http://www.omg.org/spec/ReqIF/20110401/reqif.xsd';
  const fields = ['Title', 'Description', 'Status', 'Version', 'Domain', 'Kind', 'Attributes', 'Undeveloped'];
  const escape = value => String(value).replace(/[&<>"'\r\n\t]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\r': '&#13;', '\n': '&#10;', '\t': '&#9;' })[ch]);
  const child = (element, name) => [...(element?.children ?? [])].find(node => node.localName === name);
  const descendants = (element, name) => [...element.getElementsByTagNameNS('*', name)];

  function exportModel(data, model) {
    const owned = new Set(data.entities.filter(entity => entity.modelId === model.id).map(entity => entity.id));
    const edges = data.links.filter(link => owned.has(link.sourceId) && owned.has(link.targetId));
    const entities = data.entities.filter(entity => owned.has(entity.id));
    const date = new Date().toISOString();
    const meta = (id, name) => `IDENTIFIER="${escape(id)}" LAST-CHANGE="${date}" LONG-NAME="${escape(name)}"`;
    const ref = (tag, id) => `<${tag}-REF>${escape(id)}</${tag}-REF>`;
    const definitions = fields.map(field => `<ATTRIBUTE-DEFINITION-STRING ${meta('_field_' + field, field)}><TYPE>${ref('DATATYPE-DEFINITION-STRING', '_string')}</TYPE></ATTRIBUTE-DEFINITION-STRING>`).join('');
    const value = (field, text) => `<ATTRIBUTE-VALUE-STRING THE-VALUE="${escape(text)}"><DEFINITION>${ref('ATTRIBUTE-DEFINITION-STRING', '_field_' + field)}</DEFINITION></ATTRIBUTE-VALUE-STRING>`;
    const objects = entities.map(entity => {
      const values = [entity.title, entity.description, entity.status, entity.version, entity.domain, entity.kind,
        JSON.stringify(entity.attributes), String(entity.undeveloped)];
      return `<SPEC-OBJECT ${meta('_object_' + entity.id, entity.title)}><VALUES>${fields.map((field, i) => value(field, values[i])).join('')}</VALUES><TYPE>${ref('SPEC-OBJECT-TYPE', '_object_type')}</TYPE></SPEC-OBJECT>`;
    }).join('\n');
    const relations = edges.map(edge => `<SPEC-RELATION ${meta('_link_' + edge.id, edge.type)}><SOURCE>${ref('SPEC-OBJECT', '_object_' + edge.sourceId)}</SOURCE><TARGET>${ref('SPEC-OBJECT', '_object_' + edge.targetId)}</TARGET><TYPE>${ref('SPEC-RELATION-TYPE', '_relation_' + edge.type)}</TYPE></SPEC-RELATION>`).join('\n');
    const entries = entities.map(entity => `<SPEC-HIERARCHY ${meta('_entry_' + entity.id, entity.title)}><OBJECT>${ref('SPEC-OBJECT', '_object_' + entity.id)}</OBJECT></SPEC-HIERARCHY>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="${namespace}">
<THE-HEADER><REQ-IF-HEADER IDENTIFIER="_header"><CREATION-TIME>${date}</CREATION-TIME><REQ-IF-TOOL-ID>FuSaAppLambda</REQ-IF-TOOL-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION><SOURCE-TOOL-ID>FuSaAppLambda</SOURCE-TOOL-ID><TITLE>${escape(model.title)}</TITLE></REQ-IF-HEADER></THE-HEADER>
<CORE-CONTENT><REQ-IF-CONTENT>
<DATATYPES><DATATYPE-DEFINITION-STRING ${meta('_string', 'Text')} MAX-LENGTH="2147483647"/></DATATYPES>
<SPEC-TYPES><SPEC-OBJECT-TYPE ${meta('_object_type', 'Model entity')}><SPEC-ATTRIBUTES>${definitions}</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>
${ReqModel.linkTypes.map(type => `<SPEC-RELATION-TYPE ${meta('_relation_' + type, type)}/>`).join('\n')}
<SPECIFICATION-TYPE ${meta('_spec_type', 'Requirements model')}/></SPEC-TYPES>
<SPEC-OBJECTS>${objects}</SPEC-OBJECTS>
<SPEC-RELATIONS>${relations}</SPEC-RELATIONS>
<SPECIFICATIONS><SPECIFICATION ${meta('_spec_' + model.id, model.title)}><TYPE>${ref('SPECIFICATION-TYPE', '_spec_type')}</TYPE><CHILDREN>${entries}</CHILDREN></SPECIFICATION></SPECIFICATIONS>
</REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`;
  }

  function importModel(data, xml, fallbackTitle) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCTYPE과 XML 엔티티 선언은 지원하지 않습니다.');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.documentElement.localName !== 'REQ-IF' || doc.documentElement.namespaceURI !== namespace) {
      throw new Error('ReqIF XML 파일을 확인하세요.');
    }
    const objects = descendants(doc, 'SPEC-OBJECT');
    if (!objects.length) throw new Error('ReqIF에 가져올 SPEC-OBJECT가 없습니다.');
    const header = descendants(doc, 'REQ-IF-HEADER')[0];
    const model = ReqModel.addModel(data, (child(header, 'TITLE')?.textContent.trim() || fallbackTitle).slice(0, 120));
    const definitions = new Map();
    for (const node of descendants(doc, 'SPEC-TYPES')[0]?.querySelectorAll('*') ?? []) {
      if (node.localName.startsWith('ATTRIBUTE-DEFINITION-')) definitions.set(node.getAttribute('IDENTIFIER'), node.getAttribute('LONG-NAME'));
    }
    const enumNames = new Map(descendants(doc, 'ENUM-VALUE').map(node => [node.getAttribute('IDENTIFIER'), node.getAttribute('LONG-NAME')]));
    const ids = new Map();
    for (const object of objects) {
      const entries = [];
      for (const value of child(object, 'VALUES')?.children ?? []) {
        const definition = child(value, 'DEFINITION')?.firstElementChild?.textContent.trim();
        const key = definitions.get(definition) || definition;
        const text = value.getAttribute('THE-VALUE') ?? child(value, 'THE-VALUE')?.textContent ??
          [...(child(value, 'VALUES')?.children ?? [])].map(ref => enumNames.get(ref.textContent.trim()) || ref.textContent.trim()).join(', ');
        if (key) entries.push([key, text]);
      }
      const values = Object.fromEntries(entries);
      const label = values.Title || values['ReqIF.Name'] || object.getAttribute('LONG-NAME') || object.getAttribute('IDENTIFIER') || '요구사항';
      const kind = Object.hasOwn(ReqModel.kinds, values.Kind) ? values.Kind : 'requirement';
      const entity = ReqModel.addEntity(data, model.id, kind, label.trim().slice(0, 120) || '요구사항');
      entity.description = values.Description || values['ReqIF.Text'] || '';
      entity.status = values.Status;
      entity.version = Number(values.Version);
      entity.domain = values.Domain;
      entity.undeveloped = values.Undeveloped === 'true';
      let attributes = {};
      try {
        const parsed = JSON.parse(values.Attributes ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          attributes = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key.trim() && typeof value === 'string'));
        }
      } catch {
        attributes = { Attributes: values.Attributes };
      }
      entity.attributes = { ...attributes, ...Object.fromEntries(entries.filter(([key]) => !fields.includes(key))) };
      const externalId = object.getAttribute('IDENTIFIER');
      if (!externalId || ids.has(externalId)) throw new Error('ReqIF SPEC-OBJECT 식별자가 없거나 중복됩니다.');
      if (!externalId.startsWith('_object_')) entity.attributes['ReqIF Identifier'] = externalId;
      ids.set(externalId, entity);
      ReqModel.place(model.diagrams.find(diagram => (diagram.type === 'gsn') === ReqModel.isGsn(entity)), entity.id, undefined, entity.kind);
    }
    const typeNames = new Map(descendants(doc, 'SPEC-RELATION-TYPE').map(type => [
      type.getAttribute('IDENTIFIER'), type.getAttribute('LONG-NAME')
    ]));
    const seen = new Set();
    function add(source, target, type) {
      if (!ReqModel.canLink(type, source, target)) return;
      const signature = JSON.stringify([source.id, type, target.id]);
      if (seen.has(signature)) return;
      seen.add(signature);
      ReqModel.link(data, source.id, target.id, type);
    }
    for (const edge of descendants(doc, 'SPEC-RELATION')) {
      const endpoint = key => ids.get(child(edge, key)?.firstElementChild?.textContent.trim());
      const typeRef = child(edge, 'TYPE')?.firstElementChild?.textContent.trim();
      const declared = typeNames.get(typeRef);
      add(endpoint('SOURCE'), endpoint('TARGET'), ReqModel.linkTypes.includes(declared) ? declared : 'TRACE');
    }
    for (const hierarchy of descendants(doc, 'SPEC-HIERARCHY')) {
      const source = ids.get(child(hierarchy.parentElement?.parentElement, 'OBJECT')?.firstElementChild?.textContent.trim());
      const target = ids.get(child(hierarchy, 'OBJECT')?.firstElementChild?.textContent.trim());
      add(source, target, 'DECOMPOSES');
    }
    return model;
  }

  return { exportModel, importModel };
})();

