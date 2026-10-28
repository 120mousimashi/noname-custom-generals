game.import("extension", function(lib, game, ui, get, ai, _status) {
  "use strict";
  const context = {lib, game, ui, get, ai, _status};
  const createCore = (function createHuazhangCore(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  const initialDefinitions = options.definitions === undefined ? [] : options.definitions;
  if (!Array.isArray(initialDefinitions)) throw new TypeError('definitions must be an array');
  if (options.authorsFor !== undefined && typeof options.authorsFor !== 'function') {
    throw new TypeError('authorsFor must be a function');
  }
  if (options.foreignLimitFor !== undefined && typeof options.foreignLimitFor !== 'function') {
    throw new TypeError('foreignLimitFor must be a function');
  }
  if (options.onChange !== undefined && typeof options.onChange !== 'function') {
    throw new TypeError('onChange must be a function');
  }
  if (options.random !== undefined && typeof options.random !== 'function') throw new TypeError('random must be a function');

  const authorsFor = options.authorsFor || function () { return []; };
  const onChange = options.onChange;
  const random = options.random || Math.random;
  const works = new Map();
  let records = new Map();
  let pending = new Map();
  let drafts = new Map();
  let effects = new Map();
  let sequence = 0;
  let revision = 0;

  function validId(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function counter(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function definitionCopy(definition) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)
      || !validId(definition.id) || !validId(definition.title) || !validId(definition.author)
      || (definition.text !== undefined && typeof definition.text !== 'string')
      || (definition.testOnly !== undefined && typeof definition.testOnly !== 'boolean')) {
      throw new TypeError('work requires id, title, author strings and optional text/string, testOnly/boolean');
    }
    const copy = { id: definition.id, title: definition.title, author: definition.author };
    if (definition.text !== undefined) copy.text = definition.text;
    if (definition.testOnly !== undefined) copy.testOnly = definition.testOnly;
    return copy;
  }

  function itemCopy(item) {
    return item ? {
      workId: item.workId, ownerId: item.ownerId,
      instanceId: item.instanceId, status: item.status, ...(item.exempt ? {exempt:true} : {}),
    } : null;
  }

  function tokenCopy(token) {
    return { id: token.id, ownerId: token.ownerId, workIds: token.workIds.slice() };
  }

  function jsonCopy(value, ancestors) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') throw new TypeError('delay data must contain finite JSON values');
    const seen = ancestors || new Set();
    if (seen.has(value)) throw new TypeError('delay data must not contain cycles');
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== null && (!proto.constructor || proto.constructor.name !== 'Object')) throw new TypeError('delay data requires plain objects');
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('delay data must not contain symbol keys');
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      result = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !('value' in descriptor)) throw new TypeError('delay data must not contain accessors or sparse arrays');
        result.push(jsonCopy(descriptor.value, seen));
      }
    } else {
      result = {};
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor)) throw new TypeError('delay data must not contain accessors');
        Object.defineProperty(result, key, {value:jsonCopy(descriptor.value, seen), enumerable:true, writable:true, configurable:true});
      }
    }
    seen.delete(value);
    return result;
  }

  function delayCopy(hold) {
    return {id:hold.id, workId:hold.workId, instanceId:hold.instanceId, stageId:hold.stageId, data:jsonCopy(hold.data), state:hold.state};
  }

  function effectCopy(effect) {
    return effect ? {workId:effect.workId, instanceId:effect.instanceId, mainDone:effect.mainDone, holds:effect.holds.map(delayCopy)} : null;
  }

  function failure(reason) {
    return { ok: false, reason: reason };
  }

  function success(item) {
    const result = { ok: true };
    if (item) result.item = itemCopy(item);
    return result;
  }

  function authorSet(ownerId) {
    // An unavailable resolver conservatively treats every work as foreign.
    try {
      const values = authorsFor(ownerId);
      return new Set(Array.isArray(values) ? values.filter(validId) : []);
    } catch (error) {
      return new Set();
    }
  }

  function isOwn(ownerId, workId) {
    const definition = works.get(workId);
    return !!(validId(ownerId) && definition && authorSet(ownerId).has(definition.author));
  }

  function foreignLimit(ownerId) {
    const limit = options.foreignLimitFor ? options.foreignLimitFor(ownerId) : undefined;
    if (limit === undefined) return 3;
    if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) {
      throw new TypeError('foreignLimitFor must return undefined, Infinity or a non-negative safe integer');
    }
    return limit;
  }

  function capacity(ownerId) {
    const authors = authorSet(ownerId);
    let own = 0;
    let foreign = 0;
    records.forEach(function (item) {
      if (item.ownerId !== ownerId || item.exempt) return;
      if (authors.has(works.get(item.workId).author)) own++;
      else foreign++;
    });
    return { own: own, foreign: foreign, remaining: Math.max(0, foreignLimit(ownerId) - foreign) };
  }

  function canReceive(ownerId, workIds) {
    const authors = authorSet(ownerId);
    let foreign = 0;
    records.forEach(function (item) {
      if (item.ownerId === ownerId && !item.exempt && !authors.has(works.get(item.workId).author)) foreign++;
    });
    let addedForeign = 0;
    workIds.forEach(function (workId) {
      if (!records.get(workId)?.exempt && !authors.has(works.get(workId).author)) addedForeign++;
    });
    const limit = foreignLimit(ownerId);
    return addedForeign === 0 || foreign + addedForeign <= limit;
  }

  function isAvailable(workId) {
    if (!works.has(workId) || records.has(workId)) return false;
    for (const token of drafts.values()) if (token.workIds.includes(workId)) return false;
    return true;
  }

  function available(ownerId) {
    if (!validId(ownerId)) return [];
    return Array.from(works.values()).filter(function (work) {
      return isAvailable(work.id) && canReceive(ownerId, [work.id]);
    }).map(definitionCopy);
  }

  function randomFloat() {
    const value = random();
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) throw new TypeError('random must return a finite number in [0,1)');
    return value;
  }

  function sample(values, count) {
    const copy = values.slice();
    for (let i = 0; i < count; i++) {
      const next = i + Math.floor(randomFloat() * (copy.length - i));
      const old = copy[i]; copy[i] = copy[next]; copy[next] = old;
    }
    return copy.slice(0, count);
  }

  function combination(n, k) {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i;
    return result;
  }

  function prepareDraft(ownerId) {
    if (!validId(ownerId)) return null;
    for (const token of drafts.values()) if (token.ownerId === ownerId) return tokenCopy(token);
    const pool = available(ownerId), count = Math.min(3, pool.length);
    if (!count || sequence === Number.MAX_SAFE_INTEGER) return null;
    const own = [], foreign = [];
    pool.forEach(function (work) { (isOwn(ownerId, work.id) ? own : foreign).push(work.id); });
    let selected;
    if (own.length) {
      const choices = []; let total = 0;
      for (let k = 1; k <= count; k++) {
        const weight = combination(own.length, k) * combination(foreign.length, count - k);
        if (weight > 0) { choices.push({count:k,weight:weight}); total += weight; }
      }
      let roll = randomFloat() * total;
      let chosen = choices[choices.length - 1].count;
      for (const option of choices) { roll -= option.weight; if (roll < 0) { chosen = option.count; break; } }
      selected = sample(own, chosen).concat(sample(foreign, count - chosen));
      selected = sample(selected, selected.length);
    } else selected = sample(foreign, count);
    const token = {id:'draft:' + (++sequence), ownerId:ownerId, workIds:selected};
    drafts.set(token.id, token);
    notify({type:'prepareDraft',tokenId:token.id,ownerId:ownerId,workIds:selected});
    return tokenCopy(token);
  }

  function completeDraft(tokenId, selectedWorkIdOrNull) {
    const token = drafts.get(tokenId);
    if (!token) return failure('unknown_token');
    if (selectedWorkIdOrNull !== null) {
      if (!validId(selectedWorkIdOrNull) || !token.workIds.includes(selectedWorkIdOrNull)) return failure('invalid_selection');
      if (records.has(selectedWorkIdOrNull)) return failure('occupied');
      if (!canReceive(token.ownerId, [selectedWorkIdOrNull])) return failure('capacity');
      if (sequence === Number.MAX_SAFE_INTEGER) return failure('sequence_exhausted');
    }
    let item;
    if (selectedWorkIdOrNull !== null) {
      item = {workId:selectedWorkIdOrNull,ownerId:token.ownerId,instanceId:++sequence,status:'held'};
      records.set(item.workId, item);
    }
    drafts.delete(token.id);
    notify({type:'completeDraft',tokenId:token.id,ownerId:token.ownerId,workId:selectedWorkIdOrNull});
    return success(item);
  }

  function cancelDrafts(ownerId) {
    if (!validId(ownerId)) return failure('invalid_owner');
    let changed = false;
    for (const token of drafts.values()) if (token.ownerId === ownerId) { drafts.delete(token.id); changed = true; }
    if (changed) notify({type:'cancelDrafts',ownerId:ownerId});
    return {ok:true};
  }

  function snapshot() {
    return {
      schema: 2,
      revision: revision,
      sequence: sequence,
      records: Array.from(records.values(), itemCopy),
      pending: Array.from(pending.values(), tokenCopy),
      drafts: Array.from(drafts.values(), tokenCopy),
      effects: Array.from(effects.values(), effectCopy),
    };
  }

  function notify(change, restoredRevision) {
    revision = restoredRevision === undefined
      ? Math.min(Number.MAX_SAFE_INTEGER, revision + 1) : restoredRevision;
    if (onChange) {
      try {
        onChange(snapshot(), JSON.parse(JSON.stringify(change)));
      } catch (error) {
        // A committed gain must still report success if a UI/recording observer fails.
      }
    }
  }

  function registerWork(definition) {
    const normalized = definitionCopy(definition);
    const existing = works.get(normalized.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(normalized)) return failure('definition_conflict');
      return { ok: true, item: definitionCopy(existing) };
    }
    works.set(normalized.id, normalized);
    notify({ type: 'register', workId: normalized.id });
    return { ok: true, item: definitionCopy(normalized) };
  }

  function gain(workId, ownerId, settings = {}) {
    if (!validId(ownerId)) return failure('invalid_owner');
    if (!works.has(workId)) return failure('unknown_work');
    if (!isAvailable(workId)) return failure('occupied');
    if (!settings.exempt && !canReceive(ownerId, [workId])) return failure('capacity');
    if (sequence === Number.MAX_SAFE_INTEGER) return failure('sequence_exhausted');
    const item = { workId: workId, ownerId: ownerId, instanceId: ++sequence, status: 'held', ...(settings.exempt ? {exempt:true} : {}) };
    records.set(workId, item);
    notify({ type: 'gain', workId: workId, ownerId: ownerId, instanceId: item.instanceId });
    return success(item);
  }

  function ownedHeld(workId, ownerId) {
    const item = records.get(workId);
    if (!item) return failure('not_found');
    if (item.ownerId !== ownerId) return failure('not_owner');
    if (item.status !== 'held') return failure('locked');
    return { ok: true, item: item };
  }

  function transfer(workId, fromId, toId) {
    if (!validId(fromId) || !validId(toId)) return failure('invalid_owner');
    const checked = ownedHeld(workId, fromId);
    if (!checked.ok) return checked;
    const item = checked.item;
    if (fromId === toId) return success(item);
    if (!canReceive(toId, [workId])) return failure('capacity');
    item.ownerId = toId;
    notify({ type: 'transfer', workId: workId, fromId: fromId, toId: toId });
    return success(item);
  }

  function release(workId, ownerId) {
    if (!validId(ownerId)) return failure('invalid_owner');
    const checked = ownedHeld(workId, ownerId);
    if (!checked.ok) return checked;
    records.delete(workId);
    notify({ type: 'release', workId: workId, ownerId: ownerId });
    return success(checked.item);
  }

  function begin(workId, ownerId, instanceId) {
    const checked = ownedHeld(workId, ownerId);
    if (!checked.ok) return checked;
    const item = checked.item;
    if (item.instanceId !== instanceId) return failure('stale_instance');
    item.status = 'resolving';
    effects.set(workId, {workId:workId,instanceId:instanceId,mainDone:false,holds:[]});
    notify({ type: 'begin', workId: workId, ownerId: ownerId, instanceId: instanceId });
    return success(item);
  }

  function finish(workId, instanceId) {
    const item = records.get(workId);
    if (!item) return failure('not_found');
    if (item.instanceId !== instanceId) return failure('stale_instance');
    if (item.status !== 'resolving') return failure('not_resolving');
    const effect = effects.get(workId);
    if (!effect || effect.instanceId !== instanceId) return failure('invalid_effect_state');
    if (effect.mainDone) return success(item);
    effect.mainDone = true;
    if (!effect.holds.length) { records.delete(workId); effects.delete(workId); }
    notify({ type: 'finish', workId: workId, ownerId: item.ownerId, instanceId: instanceId });
    return success(item);
  }

  function activeEffect(workId, instanceId) {
    const item = records.get(workId), effect = effects.get(workId);
    if (!item) return failure('not_found');
    if (item.instanceId !== instanceId) return failure('stale_instance');
    if (item.status !== 'resolving' || !effect || effect.instanceId !== instanceId) return failure('not_resolving');
    return {ok:true,item:item,effect:effect};
  }

  function defer(workId, instanceId, stageId, data) {
    const checked = activeEffect(workId, instanceId);
    if (!checked.ok) return checked;
    if (!validId(stageId)) return failure('invalid_stage');
    const normalized = jsonCopy(data === undefined ? null : data);
    if (sequence === Number.MAX_SAFE_INTEGER) return failure('sequence_exhausted');
    const hold = {id:'delay:' + (++sequence),workId:workId,instanceId:instanceId,stageId:stageId,data:normalized,state:'waiting'};
    checked.effect.holds.push(hold);
    notify({type:'defer',workId:workId,instanceId:instanceId,delayId:hold.id,stageId:stageId});
    return {ok:true,delay:delayCopy(hold)};
  }

  function claimDelay(workId, instanceId, delayId) {
    const checked = activeEffect(workId, instanceId);
    if (!checked.ok) return checked;
    const hold = checked.effect.holds.find(function (value) { return value.id === delayId; });
    if (!hold) return failure('unknown_delay');
    if (hold.state !== 'waiting') return failure('delay_running');
    hold.state = 'running';
    notify({type:'claimDelay',workId:workId,instanceId:instanceId,delayId:delayId});
    return {ok:true,delay:delayCopy(hold)};
  }

  function completeDelay(workId, instanceId, delayId) {
    const checked = activeEffect(workId, instanceId);
    if (!checked.ok) return checked;
    const index = checked.effect.holds.findIndex(function (value) { return value.id === delayId; });
    if (index < 0) return failure('unknown_delay');
    if (checked.effect.holds[index].state !== 'running') return failure('delay_not_running');
    checked.effect.holds.splice(index, 1);
    if (checked.effect.mainDone && !checked.effect.holds.length) { records.delete(workId); effects.delete(workId); }
    notify({type:'completeDelay',workId:workId,instanceId:instanceId,delayId:delayId});
    return success(checked.item);
  }

  function prepareInheritance(ownerId) {
    if (!validId(ownerId)) return null;
    for (const token of pending.values()) {
      if (token.ownerId === ownerId) return tokenCopy(token);
    }
    const workIds = [];
    records.forEach(function (item) {
      if (item.ownerId === ownerId && item.status === 'held') workIds.push(item.workId);
    });
    if (!workIds.length || sequence === Number.MAX_SAFE_INTEGER) return null;
    const token = { id: 'inheritance:' + (++sequence), ownerId: ownerId, workIds: workIds };
    workIds.forEach(function (workId) { records.get(workId).status = 'pending'; });
    pending.set(token.id, token);
    notify({ type: 'prepareInheritance', tokenId: token.id, ownerId: ownerId, workIds: workIds });
    return tokenCopy(token);
  }

  function completeInheritance(tokenId, toIdOrNull, selectedWorkIds) {
    const token = pending.get(tokenId);
    if (!token) return failure('unknown_token');
    const selected = selectedWorkIds === undefined ? [] : selectedWorkIds;
    if (!Array.isArray(selected)) return failure('invalid_selection');
    const selectedSet = new Set();
    for (const workId of selected) {
      if (!validId(workId) || selectedSet.has(workId) || !token.workIds.includes(workId)) {
        return failure('invalid_selection');
      }
      selectedSet.add(workId);
    }
    // Validate the full batch before changing any record, even records to be released.
    for (const workId of token.workIds) {
      const item = records.get(workId);
      if (!item || item.ownerId !== token.ownerId || item.status !== 'pending') {
        return failure('invalid_token_state');
      }
    }
    const transferSelected = toIdOrNull !== null && selected.length > 0;
    if (transferSelected) {
      if (!validId(toIdOrNull) || toIdOrNull === token.ownerId) return failure('invalid_heir');
      if (!canReceive(toIdOrNull, selected)) return failure('capacity');
    }
    token.workIds.forEach(function (workId) {
      if (transferSelected && selectedSet.has(workId)) {
        const item = records.get(workId);
        item.ownerId = toIdOrNull;
        item.status = 'held';
      } else {
        records.delete(workId);
      }
    });
    pending.delete(token.id);
    notify({ type: 'completeInheritance', tokenId: token.id, fromId: token.ownerId,
      toId: transferSelected ? toIdOrNull : null, selectedWorkIds: transferSelected ? selected : [] });
    return { ok: true };
  }

  function restore(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![1,2].includes(value.schema)
      || !counter(value.revision) || !counter(value.sequence)
      || !Array.isArray(value.records) || !Array.isArray(value.pending)) return failure('invalid_snapshot');
    if (value.schema === 2 && (!Array.isArray(value.drafts) || !Array.isArray(value.effects))) return failure('invalid_snapshot');
    if (value.schema === 1 && ((value.drafts !== undefined && (!Array.isArray(value.drafts) || value.drafts.length))
      || (value.effects !== undefined && (!Array.isArray(value.effects) || value.effects.length)))) return failure('invalid_snapshot');
    const nextRecords = new Map();
    const nextPending = new Map();
    const nextDrafts = new Map();
    const nextEffects = new Map();
    const generations = new Set();
    const pendingWorks = new Set();
    const pendingOwners = new Set();
    for (const entry of value.records) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !works.has(entry.workId)
        || !validId(entry.ownerId) || !counter(entry.instanceId) || entry.instanceId === 0
        || entry.instanceId > value.sequence || generations.has(entry.instanceId)
        || !['held', 'resolving', 'pending'].includes(entry.status)
        || (entry.exempt !== undefined && entry.exempt !== true) || nextRecords.has(entry.workId)) return failure('invalid_snapshot');
      nextRecords.set(entry.workId, itemCopy(entry));
      generations.add(entry.instanceId);
    }
    for (const entry of value.pending) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.id !== 'string'
        || !/^inheritance:[1-9]\d*$/.test(entry.id) || !validId(entry.ownerId)
        || !Array.isArray(entry.workIds) || !entry.workIds.length
        || nextPending.has(entry.id) || pendingOwners.has(entry.ownerId)) return failure('invalid_snapshot');
      const tokenSequence = Number(entry.id.slice('inheritance:'.length));
      if (!counter(tokenSequence) || tokenSequence > value.sequence || generations.has(tokenSequence)) {
        return failure('invalid_snapshot');
      }
      generations.add(tokenSequence);
      for (const workId of entry.workIds) {
        const item = nextRecords.get(workId);
        if (!validId(workId) || pendingWorks.has(workId) || !item
          || item.status !== 'pending' || item.ownerId !== entry.ownerId
          || item.instanceId >= tokenSequence) return failure('invalid_snapshot');
        pendingWorks.add(workId);
      }
      nextPending.set(entry.id, tokenCopy(entry));
      pendingOwners.add(entry.ownerId);
    }
    for (const item of nextRecords.values()) {
      if (item.status === 'pending' && !pendingWorks.has(item.workId)) return failure('invalid_snapshot');
    }
    const reserved = new Set(), draftingOwners = new Set();
    for (const entry of value.schema === 2 ? value.drafts : []) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.id !== 'string'
        || !/^draft:[1-9]\d*$/.test(entry.id) || !validId(entry.ownerId) || draftingOwners.has(entry.ownerId)
        || !Array.isArray(entry.workIds) || !entry.workIds.length || entry.workIds.length > 3) return failure('invalid_snapshot');
      const draftSequence = Number(entry.id.slice('draft:'.length));
      if (!counter(draftSequence) || draftSequence > value.sequence || generations.has(draftSequence)) return failure('invalid_snapshot');
      generations.add(draftSequence);
      for (const workId of entry.workIds) {
        if (!works.has(workId) || reserved.has(workId) || nextRecords.has(workId)) return failure('invalid_snapshot');
        reserved.add(workId);
      }
      nextDrafts.set(entry.id, tokenCopy(entry)); draftingOwners.add(entry.ownerId);
    }
    if (value.schema === 1) {
      for (const item of nextRecords.values()) if (item.status === 'resolving') {
        nextEffects.set(item.workId, {workId:item.workId,instanceId:item.instanceId,mainDone:false,holds:[]});
      }
    } else {
      for (const entry of value.effects) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !validId(entry.workId)
          || nextEffects.has(entry.workId) || typeof entry.mainDone !== 'boolean' || !Array.isArray(entry.holds)) return failure('invalid_snapshot');
        const item = nextRecords.get(entry.workId);
        if (!item || item.status !== 'resolving' || item.instanceId !== entry.instanceId
          || (entry.mainDone && !entry.holds.length)) return failure('invalid_snapshot');
        const holds = [];
        for (const hold of entry.holds) {
          if (!hold || typeof hold !== 'object' || Array.isArray(hold) || typeof hold.id !== 'string'
            || !/^delay:[1-9]\d*$/.test(hold.id) || hold.workId !== entry.workId || hold.instanceId !== entry.instanceId
            || !validId(hold.stageId) || !['waiting','running'].includes(hold.state)) return failure('invalid_snapshot');
          const delaySequence = Number(hold.id.slice('delay:'.length));
          if (!counter(delaySequence) || delaySequence > value.sequence || delaySequence <= entry.instanceId || generations.has(delaySequence)) return failure('invalid_snapshot');
          let copied;
          try { copied = delayCopy(hold); } catch (error) { return failure('invalid_snapshot'); }
          holds.push(copied); generations.add(delaySequence);
        }
        nextEffects.set(entry.workId, {workId:entry.workId,instanceId:entry.instanceId,mainDone:entry.mainDone,holds:holds});
      }
      for (const item of nextRecords.values()) if (item.status === 'resolving' && !nextEffects.has(item.workId)) return failure('invalid_snapshot');
    }
    const nextSequence = Math.max(sequence, value.sequence);
    const normalized = { schema: 2, revision: value.revision, sequence: nextSequence,
      records: Array.from(nextRecords.values(), itemCopy), pending: Array.from(nextPending.values(), tokenCopy),
      drafts:Array.from(nextDrafts.values(),tokenCopy), effects:Array.from(nextEffects.values(),effectCopy) };
    if (JSON.stringify(snapshot()) === JSON.stringify(normalized)) return { ok: true };
    records = nextRecords;
    pending = nextPending;
    drafts = nextDrafts;
    effects = nextEffects;
    sequence = nextSequence;
    notify({ type: 'restore' }, value.revision);
    return { ok: true };
  }

  function reset() {
    if (!records.size && !pending.size && !drafts.size && !effects.size) return { ok: true };
    records.clear();
    pending.clear();
    drafts.clear();
    effects.clear();
    notify({ type: 'reset' });
    return { ok: true };
  }

  initialDefinitions.forEach(function (definition) {
    const normalized = definitionCopy(definition);
    if (works.has(normalized.id) && JSON.stringify(works.get(normalized.id)) !== JSON.stringify(normalized)) {
      throw new TypeError('conflicting initial work ID: ' + normalized.id);
    }
    works.set(normalized.id, normalized);
  });

  return {
    abort: function(workId,instanceId) {
      const checked=activeEffect(workId,instanceId); if(!checked.ok)return checked;
      records.delete(workId);effects.delete(workId);notify({type:'abort',workId,instanceId});return success(checked.item);
    },
    exemptCount: function(ownerId) {return Array.from(records.values()).filter(item=>item.ownerId===ownerId&&item.exempt).length;},
    registerWork: registerWork,
    getDefinition: function (id) { return works.has(id) ? definitionCopy(works.get(id)) : null; },
    definitions: function () { return Array.from(works.values(), definitionCopy); },
    get: function (workId) { return itemCopy(records.get(workId)); },
    list: function (ownerId) {
      return Array.from(records.values()).filter(function (item) { return item.ownerId === ownerId; }).map(itemCopy);
    },
    isOwn: isOwn,
    foreignLimit: foreignLimit,
    foreignCount: function (ownerId) { return capacity(ownerId).foreign; },
    capacity: capacity,
    isAvailable: isAvailable,
    available: available,
    prepareDraft: prepareDraft,
    completeDraft: completeDraft,
    cancelDrafts: cancelDrafts,
    listDrafts: function (ownerId) {
      return Array.from(drafts.values()).filter(function (token) { return ownerId === undefined || token.ownerId === ownerId; }).map(tokenCopy);
    },
    gain: gain,
    transfer: transfer,
    release: release,
    begin: begin,
    finish: finish,
    defer: defer,
    claimDelay: claimDelay,
    completeDelay: completeDelay,
    getEffect: function (workId) { return effectCopy(effects.get(workId)); },
    listDelays: function (workId, stageId) {
      let holds = [];
      effects.forEach(function (effect) {
        if (workId !== undefined && effect.workId !== workId) return;
        holds = holds.concat(effect.holds.filter(function (hold) { return stageId === undefined || hold.stageId === stageId; }).map(delayCopy));
      });
      return holds;
    },
    prepareInheritance: prepareInheritance,
    completeInheritance: completeInheritance,
    snapshot: snapshot,
    restore: restore,
    reset: reset,
  };
});
  const createResolver = (function createAuthorResolver({ lib = {}, get = {}, authors = [] } = {}) {
  const registered = new Map();

  function validString(value) {
    return typeof value === 'string' && value.length > 0 && value.trim() === value;
  }

  function copy(definition) {
    return definition ? {
      id: definition.id,
      name: definition.name,
      characterIds: definition.characterIds.slice(),
    } : null;
  }

  function characterKeys(id) {
    const keys = new Set([id]);
    // The engine table, rather than spelling or translated prefixes, defines versions.
    if (get && typeof get.sourceCharacter === 'function') {
      try {
        const source = get.sourceCharacter(id);
        if (validString(source)) keys.add(source);
      } catch (_) {
        // An unknown third-party character can still have an explicitly registered id.
      }
    }
    return keys;
  }

  function definitionKeys(definition) {
    const keys = new Set();
    for (const id of definition.characterIds) {
      for (const key of characterKeys(id)) keys.add(key);
    }
    return keys;
  }

  function register(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !validString(input.id) || !validString(input.name) ||
      !Array.isArray(input.characterIds) || !input.characterIds.every(validString)) {
      throw new TypeError('Invalid historical author definition');
    }
    const definition = {
      id: input.id,
      name: input.name,
      characterIds: [...new Set(input.characterIds)],
    };
    const existing = registered.get(definition.id);
    if (existing) {
      if (existing.name !== definition.name ||
        existing.characterIds.length !== definition.characterIds.length ||
        existing.characterIds.some(id => !definition.characterIds.includes(id))) {
        throw new Error('Conflicting historical author id: ' + definition.id);
      }
      return copy(existing);
    }
    const keys = definitionKeys(definition);
    for (const previous of registered.values()) {
      if (previous.name === definition.name ||
        [...definitionKeys(previous)].some(key => keys.has(key))) {
        throw new Error('Historical author name or character alias already registered');
      }
    }
    registered.set(definition.id, definition);
    return copy(definition);
  }

  function exactNames(info) {
    if (!info || typeof info !== 'object') return [];
    let names = info.names;
    // Old-format extensions encode the same field as a fifth-array-slot name: tag.
    if (typeof names !== 'string' && Array.isArray(info) && Array.isArray(info[4])) {
      const tag = info[4].find(item => typeof item === 'string' && item.startsWith('name:'));
      if (tag) names = tag.slice(5);
    }
    if (typeof names !== 'string') return [];
    const result = [];
    for (const entry of names.split('-')) {
      const parts = entry.split('|');
      if ((parts.length === 1 || parts.length === 2) &&
        parts.every(part => validString(part) && part !== 'null')) {
        result.push(parts.join(''));
      }
    }
    return result;
  }

  function characterNames(id) {
    const names = new Set();
    if (lib && lib.character && Object.prototype.hasOwnProperty.call(lib.character, id)) {
      for (const name of exactNames(lib.character[id])) names.add(name);
    }
    if (get && typeof get.character === 'function') {
      try {
        for (const name of exactNames(get.character(id))) names.add(name);
      } catch (_) {
        // Missing character metadata is not evidence of an author's identity.
      }
    }
    return names;
  }

  function resolveCharacter(id) {
    const keys = characterKeys(id);
    const explicit = [];
    for (const definition of registered.values()) {
      if ([...definitionKeys(definition)].some(key => keys.has(key))) {
        explicit.push(definition.id);
      }
    }
    if (explicit.length) return explicit;
    for (const key of keys) {
      const names = characterNames(key);
      const matching = [];
      for (const definition of registered.values()) {
        if (names.has(definition.name)) matching.push(definition.id);
      }
      if (matching.length) return matching;
    }
    return [];
  }

  function resolve(player) {
    if (!player || typeof player !== 'object') return [];
    // Test-version policy: both current general slots contribute identities.
    const slots = [player.name1, player.name2].filter(validString);
    if (!slots.length && validString(player.name)) slots.push(player.name);
    const result = new Set();
    for (const id of slots) {
      for (const authorId of resolveCharacter(id)) result.add(authorId);
    }
    return [...result];
  }

  function metadata(id) {
    return copy(registered.get(id));
  }

  if (!Array.isArray(authors)) throw new TypeError('authors must be an array');
  for (const author of authors) register(author);
  return { register, resolve, metadata };
});
  const install = (function installHuazhang(context, createCore, createResolver, definitions, authors, options = {}) {
  const { lib, game, ui, get, _status } = context;
  if (game.huazhang && game.huazhang.adapterId === '翰墨凝威:1.1.0') return game.huazhang;
  if (!Array.isArray(definitions) || !Array.isArray(authors)) throw new TypeError('definitions and authors must be arrays');
  if (options.foreignLimitFor !== undefined && typeof options.foreignLimitFor !== 'function') throw new TypeError('foreignLimitFor must be a function');
  if (!lib.skill) lib.skill = {};
  if (!lib.translate) lib.translate = {};
  if (!game.videoContent) game.videoContent = {};

  const MARK = '翰墨_华章';
  const VIDEO = '翰墨_快照';
  const definitionIndex = Object.create(null);
  const startingEvents = new WeakSet();
  const inheriting = new Set();
  const writing = new Set();
  let receiving = false;
  const resets = [];
  const boundTargets = new Map();
  const abortCallbacks = new Map();
  let committedUses = new WeakMap();
  const tokenUses = new Map();
  const watchedUsePlayers = new Map();
  const acquiredEvents = new WeakMap();
  let core;
  let api;
  const resolver = createResolver({ lib, get, authors });

  function ownerId(player) {
    if (typeof player === 'string' && player.length) return player;
    return player && typeof player.playerid === 'string' && player.playerid.length ? player.playerid : null;
  }

  function allPlayers() {
    const players = [].concat(game.players || [], game.dead || [], Object.values(game.playerMap || {}));
    return Array.from(new Set(players.filter(Boolean)));
  }

  function findPlayer(id) {
    return allPlayers().find(player => ownerId(player) === id) || null;
  }

  function isLive(player) {
    return !!(player && (game.players || []).includes(player) && (typeof player.isIn !== 'function' || player.isIn()));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }

  function metadata(definition) {
    const result = { id: definition.id, title: definition.title, author: definition.author };
    if (definition.text !== undefined) result.text = definition.text;
    if (definition.testOnly !== undefined) result.testOnly = definition.testOnly;
    return result;
  }

  if(options.formal) definitions=definitions.map(d=>({...d,stages:{...(d.stages||{}),__scope:{
    trigger:{global:['phaseUseAfter','phaseAfter','roundEnd']},
    filter(e,h,a,data,timing){return data.kind==='round' ? timing==='roundEnd' : timing===(data.kind==='turn'?'phaseAfter':'phaseUseAfter') && a.ops.key(a.ops.scope(e,data.kind==='turn'?'phase':'phaseUse')||e)===data.key;},
    effect(){}
  }}}));
  for (const definition of definitions) {
    if (!definition || typeof definition.id !== 'string' || definitionIndex[definition.id]
      || (!definition.active && !definition.cardUse && (!definition.trigger || typeof definition.trigger !== 'object'))
      || (!definition.cardUse && typeof definition.effect !== 'function')
      || (definition.filter !== undefined && typeof definition.filter !== 'function')
      || (definition.choose !== undefined && typeof definition.choose !== 'function')) {
      throw new TypeError('each work requires a unique id, trigger and effect');
    }
    if (definition.stages !== undefined) {
      if (!definition.stages || typeof definition.stages !== 'object' || Array.isArray(definition.stages)) throw new TypeError('stages must be an object');
      for (const [stageId, stage] of Object.entries(definition.stages)) {
        const timing = stage && stage.trigger && stage.trigger.global;
        if (!stageId.trim() || !stage || typeof stage.effect !== 'function'
          || !stage.trigger || Object.keys(stage.trigger).length !== 1
          || !(typeof timing === 'string' && timing.length || Array.isArray(timing) && timing.length && timing.every(name => typeof name === 'string' && name.length))
          || (stage.filter !== undefined && typeof stage.filter !== 'function')) {
          throw new TypeError('delayed stages require a stable id, global trigger, optional filter and effect');
        }
      }
    }
    definitionIndex[definition.id] = definition;
  }

  function mirror(player) {
    const id = ownerId(player);
    const capacity = core.capacity(id);
    return {
      revision: core.snapshot().revision,
      own: capacity.own,
      foreign: capacity.foreign,
      exempt: core.exemptCount ? core.exemptCount(id) : 0,
      // Display mirrors may be serialized by the engine; Infinity becomes null in JSON.
      remaining: capacity.remaining === Infinity ? '无限' : capacity.remaining,
      works: core.list(id).map(item => {
        const definition = core.getDefinition(item.workId);
        const author = resolver.metadata(definition.author);
        return {
          workId: item.workId, title: definition.title, author: definition.author,
          authorName: author && author.name ? author.name : definition.author,
          text: definition.text || '', testOnly: !!definition.testOnly,
          status: item.status, own: core.isOwn(id, item.workId), exempt:!!item.exempt,
          delays: typeof core.getEffect === 'function' ? (core.getEffect(item.workId)?.holds.length || 0) : 0,
        };
      }),
    };
  }

  function display(player) {
    const view = mirror(player);
    const limit = typeof core.foreignLimit === 'function' ? core.foreignLimit(ownerId(player)) : 3;
    let html = '<div class="text center">华章 · 自作 ' + view.own + '（不限） · 外来 ' + view.foreign + '/' + (limit === Infinity ? '无限' : limit) + ' · 免额 ' + view.exempt + '</div>';
    for (const item of view.works) {
      const status = { held: '持有', resolving: '结算中', pending: '待继承' }[item.status] || item.status;
      html += '<div class="text"><b>' + escapeHtml(item.title) + '</b> · ' + escapeHtml(item.authorName)
        + ' · ' + (item.exempt ? '免额' : item.own ? '自作' : '外来') + ' · ' + escapeHtml(status)
        + (item.delays ? '（延时未完成 ' + item.delays + '）' : '')
        + (item.testOnly ? ' · 机制测试' : '') + '<br>' + escapeHtml(item.text) + '</div>';
    }
    return html;
  }

  const markInfo = {
    name: '华章', fixed: true,
    content: function (storage, player) {
      return game.huazhang ? game.huazhang.display(player) : '华章数据尚未载入';
    },
  };

  function refresh() {
    for (const player of allPlayers()) {
      if (!ownerId(player)) continue;
      if (!player.storage) player.storage = {};
      const view = mirror(player);
      if (view.works.length) {
        player.storage[MARK] = view;
        // This only creates a fixed display node. Never call player.addSkill.
        if (typeof player.markSkill === 'function') player.markSkill(MARK, markInfo, undefined, true);
      } else {
        if (player.marks && player.marks[MARK] && typeof player.unmarkSkill === 'function') player.unmarkSkill(MARK, true);
        delete player.storage[MARK];
      }
    }
  }

  core = createCore({
    definitions: definitions.map(metadata),
    authorsFor: function (id) {
      const player = findPlayer(id);
      return player ? resolver.resolve(player) : [];
    },
    foreignLimitFor: function (id) {
      const player = findPlayer(id);
      return player && options.foreignLimitFor ? options.foreignLimitFor(player) : undefined;
    },
    onChange: function (snapshot, change) {
      if (!core || !api) return;
      for(const [token,entry] of abortCallbacks){const r=core.get(entry.workId);if(r?.instanceId===entry.instanceId)continue;abortCallbacks.delete(token);if(change?.type==='abort')for(const fn of entry.callbacks){try{fn();}catch(error){game.log?.('华章清理错误',String(error));}}}
      for(const [token,e] of tokenUses){const tag=committedUses.get(e);if(!tag||!api.isCurrent(tag.workId,tag.instanceId))tokenUses.delete(token);}
      refresh();
      if (receiving) return;
      if (typeof game.addVideo === 'function') game.addVideo(VIDEO, null, snapshot);
      if (typeof game.broadcastAll === 'function') game.broadcastAll(function receiveHuazhangSnapshot(snapshot) {
        if (typeof game !== 'undefined' && game.huazhang) game.huazhang.applySnapshot(snapshot);
      }, snapshot);
      if (typeof options.onChange === 'function') options.onChange(snapshot, change);
    },
  });

  function applySnapshot(snapshot, settings = {}) {
    if (snapshot && snapshot.schema === 2 && Array.isArray(snapshot.effects)) {
      for (const effect of snapshot.effects) {
        if (!effect || !Array.isArray(effect.holds)) continue; // Shape validation belongs to core.restore.
        const definition = definitionIndex[effect.workId];
        for (const hold of effect.holds) {
          if (!hold || !definition || !definition.stages || !Object.prototype.hasOwnProperty.call(definition.stages,hold.stageId)) {
            return {ok:false, reason:'unknown_delayed_stage'};
          }
        }
      }
    }
    const current = core.snapshot();
    if (!settings.force) {
      if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < current.revision) {
        return { ok: false, reason: 'stale_snapshot' };
      }
      if (snapshot.revision === current.revision) {
        return canonical(snapshot) === canonical(current) ? { ok: true, unchanged: true } : { ok: false, reason: 'conflicting_snapshot' };
      }
    }
    receiving = true;
    try {
      const result = core.restore(snapshot);
      if (result && result.ok) refresh();
      return result;
    } finally {
      receiving = false;
    }
  }

  api = game.huazhang = {
    adapterId: '翰墨凝威:1.1.0', core,
    definitions: definitionIndex,
    resolveAuthors: player => resolver.resolve(player),
    gain: (player, workId) => core.gain(workId, ownerId(player)),
    gainExempt: (player, workId) => core.gain(workId, ownerId(player),{exempt:true}),
    ops:options.ops,
    canUseWork:(player,workId)=>{const r=core.get(workId);return !!r&&isLive(player)&&r.status==='held'&&r.ownerId===ownerId(player);},
    isCurrent:(workId,instanceId)=>{const r=core.get(workId);return !!r&&r.instanceId===instanceId&&r.status==='resolving';},
    commitCard:function(player,workId,card){
      const definition=definitionIndex[workId];if(!definition?.cardUse||!card||typeof card!=='object'||!api.canUseWork(player,workId))return {ok:false,reason:'unavailable'};
      const r=core.get(workId),begun=core.begin(workId,ownerId(player),r.instanceId);if(!begun.ok)return begun;
      card.storage={...(card.storage||{}),翰墨_华章提交:{workId,instanceId:r.instanceId}};
      for(const p of allPlayers())watchUseCreation(p);
      return {ok:true,life:lifecycle(definition,r.instanceId,_status.event)};
    },
    registerReset:fn=>{if(typeof fn==='function')resets.push(fn);},
    activeWorks:player=>definitions.filter(d=>d.active&&!d.cardUse&&available(d,_status.event,player)),
    activate:async(player,workId,event)=>{const d=definitionIndex[workId];if(d?.active)return runWork(d,event||_status.event,player,true);},
    transfer: (from, to, workId) => core.transfer(workId, ownerId(from), ownerId(to)),
    release: (player, workId) => core.release(workId, ownerId(player)),
    list: player => core.list(ownerId(player)),
    pool: player => core.available(ownerId(player)),
    write: async function (player) {
      const id = ownerId(player);
      if (!id || !isLive(player) || typeof player.chooseButton !== 'function') return {ok:false, reason:'invalid_writer'};
      if (writing.has(id)) return {ok:false, reason:'writing_in_progress'};
      writing.add(id);
      let token;
      let committed = false;
      try {
        token = core.prepareDraft(id);
        if (!token) return {ok:false, reason:'empty_pool'};
        const pairs = token.workIds.map(workId => {
          const definition = core.getDefinition(workId);
          const author = resolver.metadata(definition.author);
          return [workId, '<b>《' + escapeHtml(definition.title) + '》</b><br>'
            + escapeHtml(author ? author.name : definition.author) + (core.isOwn(id, workId) ? ' · 自作' : ' · 外来')
            + '<br>' + escapeHtml(definition.text || '')];
        });
        const result = await player.chooseButton({
          createDialog:['书写华章：选择一篇，其余回归华章库',[pairs,'textbutton']],
          selectButton:1, forced:true,
          ai: function(button) { return game.huazhang.core.isOwn(id,button.link) ? 2 : 1; },
        }).forResult();
        if (!isLive(player)) return {ok:false, reason:'writer_left'};
        if (!result || !result.bool || !Array.isArray(result.links) || result.links.length !== 1) return {ok:false, reason:'invalid_selection'};
        const completed = core.completeDraft(token.id, result.links[0]);
        committed = !!completed.ok;
        return completed;
      } finally {
        if (token && !committed) core.completeDraft(token.id, null);
        writing.delete(id);
      }
    },
    display, refresh,
    show: function (player) {
      const html = display(player);
      // chooseControl owns both opening and closing this dialog. A standalone
      // DOM dialog is not awaitable and would outlive the debug operation.
      if (player && typeof player.chooseControl === 'function') {
        return player.chooseControl('关闭').set('dialog', ['华章', html]).set('ai', () => 0).forResult();
      }
      return html;
    },
    snapshot: () => core.snapshot(), applySnapshot,
    reset: () => {for(const entry of abortCallbacks.values())for(const fn of entry.callbacks){try{fn();}catch(_){}}abortCallbacks.clear();committedUses=new WeakMap();tokenUses.clear();for(const [p,entry] of watchedUsePlayers){if(p.useCard===entry.wrapper){if(entry.own)Object.defineProperty(p,'useCard',entry.own);else delete p.useCard;}}watchedUsePlayers.clear();boundTargets.clear();for(const fn of resets)fn();options.ops?.reset?.();return core.reset();},
  };

  lib.skill[MARK] = { charlotte: true, marktext: '章', intro: markInfo };
  lib.translate[MARK] = '华章';
  lib.translate[MARK + '_info'] = '独立华章库存的展示标记，通常外来华章上限三篇，具体上限以当前生效技能为准。';
  game.videoContent[VIDEO] = function huazhangVideoSnapshot(playerOrSnapshot, snapshot) {
    const data = snapshot === undefined ? playerOrSnapshot : snapshot;
    if (typeof game !== 'undefined' && game.huazhang) return game.huazhang.applySnapshot(data, { force: true });
  };

  function available(definition, trigger, holder, expected, timing) {
    const id = ownerId(holder);
    if (!id || !isLive(holder)) return false;
    const item = core.get(definition.id);
    if (!item || item.ownerId !== id || item.status !== 'held' || (expected !== undefined && item.instanceId !== expected)) return false;
    if(options.formal && trigger && timing){
      let stamps=acquiredEvents.get(trigger);if(!stamps){stamps=new Map();acquiredEvents.set(trigger,stamps);}
      if(!stamps.has(timing))stamps.set(timing,new Set(core.snapshot().records.map(r=>r.instanceId)));
      if(!stamps.get(timing).has(item.instanceId))return false;
    }
    return !definition.filter || !!definition.filter(trigger, holder, api);
  }

  function lifecycle(definition, instanceId, trigger) {
    const token=definition.id+':'+instanceId;
    return Object.freeze({
      workId:definition.id, instanceId,
      onAbort:function(fn){if(typeof fn!=='function')throw new TypeError('cleanup must be function');let entry=abortCallbacks.get(token);if(!entry){entry={workId:definition.id,instanceId,callbacks:[]};abortCallbacks.set(token,entry);}entry.callbacks.push(fn);},
      valid:()=> definition.consume==='confirm' || !!(core.get(definition.id)?.instanceId===instanceId),
      targets:function(players){boundTargets.set(token,{workId:definition.id,instanceId,ids:players.filter(Boolean).map(ownerId)});},
      until:function(kind){
        if(!['phaseUse','turn','round'].includes(kind))throw new TypeError('invalid duration');
        const scope=kind==='round'?null:api.ops.scope(trigger,kind==='turn'?'phase':'phaseUse')||api.ops.scope(_status.event,kind==='turn'?'phase':'phaseUse');
        const result=core.defer(definition.id,instanceId,'__scope',{kind,key:scope?api.ops.key(scope):null,round:Number(game.roundNumber||0)});
        if(!result.ok)throw new Error('duration could not be registered');return result.delay;
      },
      defer: function(stageId, data = null) {
        if (!definition.stages || !Object.prototype.hasOwnProperty.call(definition.stages,stageId)) throw new TypeError('unknown delayed stage: ' + stageId);
        const result = core.defer(definition.id,instanceId,stageId,data);
        if (!result.ok) throw new Error('cannot defer this instance: ' + result.reason);
        return result.delay;
      },
    });
  }

  async function runWork(definition, trigger, holder, active=false, timing) {
    if (!available(definition, trigger, holder,undefined,timing)) return;
    const instance = core.get(definition.id);
    let selection = true;
    if (active) {
      if(definition.prepare)selection=await definition.prepare(trigger,holder,api);
    } else if (definition.choose) {
      selection = await definition.choose(trigger, holder, api);
    } else if (!definition.forced) {
      if (typeof holder.chooseBool !== 'function') return;
      const result = await holder.chooseBool('是否发动华章《' + escapeHtml(definition.title) + '》？').forResult();
      selection = !!(result && result.bool);
    }
    if (!(selection === true || (selection && selection.ok === true))) return;
    if (!available(definition, trigger, holder, instance.instanceId)) return;
    const begun = core.begin(definition.id, ownerId(holder), instance.instanceId);
    if (!begun || !begun.ok) return;
    if(definition.consume==='confirm') core.finish(definition.id,instance.instanceId);
    try {
      await definition.effect(trigger, holder, api, selection && selection.data, lifecycle(definition, instance.instanceId,trigger));
    } finally {
      if(definition.consume!=='confirm')core.finish(definition.id, instance.instanceId);
    }
  }

  function canCoordinate(player) {
    return isLive(player) && !player.removed;
  }

  function stageEntries(definition, stageId, stage, trigger,timing) {
    return core.listDelays(definition.id, stageId).filter(delay => {
      if (delay.state !== 'waiting') return false;
      const item = core.get(definition.id);
      if (!item || item.instanceId !== delay.instanceId || item.status !== 'resolving') return false;
      const originalHolder = findPlayer(item.ownerId);
      return !stage.filter || !!stage.filter(trigger, originalHolder, api, delay.data,timing);
    });
  }

  for (const definition of definitions) {
    const skillId = '翰墨_篇_' + Array.from(definition.id).map(character => character.codePointAt(0).toString(16)).join('_');
    lib.skill[skillId] = {
      huazhangWorkId: definition.id,
      huazhangForced: !!definition.forced,
      trigger: definition.trigger,
      // direct prevents a second engine-owned optional prompt. Each work owns
      // its choice below, independently of every other work at the same timing.
      forced: !!definition.forced, direct: true, silent: true, popup: false,
      priority: typeof definition.priority === 'number' ? definition.priority : 0,
      filter: function (trigger, holder, timing) { return available(definition, trigger, holder, undefined,timing); },
      content: async function (event, trigger, holder) { await runWork(definition, trigger, holder,false,event.triggername); },
    };
    lib.translate[skillId] = escapeHtml(definition.title);
    lib.translate[skillId + '_info'] = escapeHtml(definition.text || '');
    if(definition.trigger)game.addGlobalSkill(skillId);
    for (const [stageId, stage] of Object.entries(definition.stages || {})) {
      const delayedId = skillId + '_延时_' + Array.from(stageId).map(character => character.codePointAt(0).toString(16)).join('_');
      const handled = new WeakMap();
      function handledAt(trigger, timing, commit) {
        if (!trigger || typeof trigger !== 'object') return false;
        const key = typeof timing === 'string' ? timing : '';
        let timings = handled.get(trigger);
        if (timings && timings.has(key)) return true;
        if (commit) {
          if (!timings) {timings = new Set(); handled.set(trigger,timings);}
          timings.add(key);
        }
        return false;
      }
      lib.skill[delayedId] = {
        huazhangWorkId:definition.id, huazhangStageId:stageId,
        trigger:stage.trigger, forced:true, direct:true, silent:true, popup:false,
        priority:typeof stage.priority === 'number' ? stage.priority : 0,
        filter: function(trigger, holder, timing) {
          return canCoordinate(holder) && !handledAt(trigger,timing,false) && stageEntries(definition,stageId,stage,trigger,timing).length > 0;
        },
        content: async function(event, trigger, holder) {
          if (!canCoordinate(holder) || handledAt(trigger,event.triggername,true)) return;
          // Snapshot the waiting batch: newly deferred successors cannot execute
          // again in this same dispatcher just because their timing also matches.
          const entries = stageEntries(definition,stageId,stage,trigger,event.triggername);
          for (const delay of entries) {
            const item = core.get(definition.id);
            if (!item || item.instanceId !== delay.instanceId) continue;
            const originalHolder = findPlayer(item.ownerId);
            if (stage.filter && !stage.filter(trigger,originalHolder,api,delay.data,event.triggername)) continue;
            const claimed = core.claimDelay(definition.id,delay.instanceId,delay.id);
            if (!claimed.ok) continue;
            try {
              await stage.effect(trigger,originalHolder,api,delay.data,lifecycle(definition,delay.instanceId,trigger),event.triggername);
            } finally {
              core.completeDelay(definition.id,delay.instanceId,delay.id);
            }
          }
        },
      };
      lib.translate[delayedId] = escapeHtml(definition.title) + '·延时';
      game.addGlobalSkill(delayedId);
    }
  }

  function bindCommittedUse(event){
    if(!event||typeof event!=='object')return false;
    const tag=committedUses.get(event)||event.card?.storage?.翰墨_华章提交;
    if(!tag||!api.isCurrent(tag.workId,tag.instanceId))return false;
    const token=tag.workId+':'+tag.instanceId,existing=tokenUses.get(token);
    if(existing&&existing!==event)return false;
    tokenUses.set(token,event);committedUses.set(event,{...tag});return true;
  }
  function watchUseCreation(player){
    if(!player||watchedUsePlayers.has(player)||typeof player.useCard!=='function')return;
    const original=player.useCard,own=Object.getOwnPropertyDescriptor(player,'useCard');
    const wrapper=function(...args){const next=original.apply(this,args);bindCommittedUse(next);return next;};
    watchedUsePlayers.set(player,{own,wrapper});player.useCard=wrapper;
  }

  if(options.formal){
    lib.skill['翰墨_使用华章']={enable:'phaseUse',charlotte:true,
      filter:(event,player)=>api.activeWorks(player).length>0,
      async content(event,trigger,player){
        const defs=api.activeWorks(player);if(!defs.length)return;
        const r=await player.chooseButton({createDialog:['使用华章（取消不消耗）',[defs.map(d=>[d.id,'《'+d.title+'》<br>'+d.text]),'textbutton']],selectButton:1,forced:false}).forResult();
        if(r?.bool&&defs.some(d=>d.id===r.links?.[0]))await api.activate(player,r.links[0],event);
      }};
    lib.translate['翰墨_使用华章']='华章';lib.translate['翰墨_使用华章_info']='选择持有的主动华章发动。';game.addGlobalSkill('翰墨_使用华章');
    // Native StepCompiler reconstructs ordinary functions and drops these factory
    // closures. Event entry points must use AsyncCompiler even without awaits.
    lib.skill['翰墨_华章用牌记录']={trigger:{global:['useCard0','useCard1']},forced:true,silent:true,firstDo:true,priority:1000000000,
      filter(e){return !committedUses.has(e)&&!!e.card?.storage?.翰墨_华章提交;},
      async content(event,trigger){bindCommittedUse(trigger);}};
    game.addGlobalSkill('翰墨_华章用牌记录');
    lib.skill['翰墨_华章用牌完成']={trigger:{global:'useCardAfter'},forced:true,silent:true,lastDo:true,priority:-100000,
      filter(e){return bindCommittedUse(e);},
      async content(event,trigger){if(!bindCommittedUse(trigger))return;const tag=committedUses.get(trigger);committedUses.delete(trigger);tokenUses.delete(tag.workId+':'+tag.instanceId);core.finish(tag.workId,tag.instanceId);}};
    game.addGlobalSkill('翰墨_华章用牌完成');
    function cleanBoundTargets(){for(const [token,b] of boundTargets){const r=core.get(b.workId);if(!r||r.instanceId!==b.instanceId){boundTargets.delete(token);continue;}
      if(b.ids.length&&!b.ids.some(id=>isLive(findPlayer(id)))){core.abort(b.workId,b.instanceId);boundTargets.delete(token);}}}
    lib.skill['翰墨_清理']={trigger:{global:['dieAfter','removeCharacterAfter']},forced:true,silent:true,firstDo:true,priority:100000,
      filter:(e,p)=>p===(game.players||[])[0],async content(){cleanBoundTargets();}};
    game.addGlobalSkill('翰墨_清理');
    for(const method of ['removePlayer','replacePlayer'])if(typeof game[method]==='function'){
      const original=game[method];game[method]=function(...args){const value=original.apply(this,args);cleanBoundTargets();return value;};
    }
    const timings=[...new Set(definitions.flatMap(d=>Object.values(d.trigger||{}).flat()))];
    lib.skill['翰墨_时点']={trigger:{global:timings},firstDo:true,priority:100000000,forced:true,silent:true,
      filter:(e,p)=>p===(game.players||[])[0],async content(event,trigger){let m=acquiredEvents.get(trigger);if(!m){m=new Map();acquiredEvents.set(trigger,m);}if(!m.has(event.triggername))m.set(event.triggername,new Set(core.snapshot().records.map(r=>r.instanceId)));}};
    game.addGlobalSkill('翰墨_时点');
  }

  lib.skill['翰墨_继承'] = {
    trigger: { player: 'die' }, forced: true, direct: true, silent: true, popup: false, forceDie: true,
    filter: function (trigger, holder) {
      return core.list(ownerId(holder)).some(item => item.status === 'held')
        || (typeof core.listDrafts === 'function' && core.listDrafts(ownerId(holder)).length > 0);
    },
    content: async function (event, trigger, holder) {
      if (typeof core.cancelDrafts === 'function') core.cancelDrafts(ownerId(holder));
      const token = core.prepareInheritance(ownerId(holder));
      if (!token || inheriting.has(token.id)) return;
      inheriting.add(token.id);
      let committed = false;
      try {
        if (!(game.players || []).some(player => player !== holder && isLive(player)) || typeof holder.chooseTarget !== 'function') return;
        const targetResult = await holder.chooseTarget({
          prompt: '华章：可选择一名存活角色继承你的华章',
          selectTarget: [1, 1], forced: false, forceDie: true,
          filterTarget: function (card, player, target) {
            return target !== player && (game.players || []).includes(target) && (typeof target.isIn !== 'function' || target.isIn());
          },
        }).set('forceDie', true).forResult();
        if (!targetResult || !targetResult.bool || !Array.isArray(targetResult.targets) || targetResult.targets.length !== 1) return;
        const target = targetResult.targets[0];
        if (target === holder || !isLive(target) || !ownerId(target) || typeof target.chooseButton !== 'function') return;
        const pairs = token.workIds.map(workId => [workId, escapeHtml(core.getDefinition(workId).title)]);
        const limit = typeof core.foreignLimit === 'function' ? core.foreignLimit(ownerId(target)) : 3;
        const capacityPrompt = limit === Infinity ? '外来华章无限' : '外来华章至多' + (limit === 3 ? '三' : limit) + '篇';
        const result = await target.chooseButton({
          createDialog: ['华章：选择你要继承的篇目（' + capacityPrompt + '）', [pairs, 'textbutton']],
          selectButton: [1, pairs.length], forced: false,
          huazhangWorkIds: token.workIds.slice(), huazhangOwnerId: token.ownerId,
          filterButton: function (button) {
            const event = _status.event;
            const service = game.huazhang;
            const receiver = event.player;
            const id = receiver.playerid;
            const item = service.core.get(button.link);
            if (!event.huazhangWorkIds.includes(button.link) || !item || item.ownerId !== event.huazhangOwnerId || item.status !== 'pending') return false;
            if (item.exempt || service.core.isOwn(id, button.link)) return true;
            const chosen = (ui.selected.buttons || []).filter(selected => selected !== button && !service.core.get(selected.link)?.exempt && !service.core.isOwn(id, selected.link)).length;
            const limit = typeof service.core.foreignLimit === 'function' ? service.core.foreignLimit(id) : 3;
            return service.core.foreignCount(id) + chosen < limit;
          },
        }).forResult();
        if (!result || !result.bool || !Array.isArray(result.links) || !isLive(target)) return;
        const completed = core.completeInheritance(token.id, ownerId(target), result.links);
        committed = !!(completed && completed.ok);
      } finally {
        // Failure/decline leaves no pending works or unique reservations behind.
        if (!committed) core.completeInheritance(token.id, null, []);
        inheriting.delete(token.id);
      }
    },
  };
  game.addGlobalSkill('翰墨_继承');

  lib.skill['翰墨_开局'] = {
    trigger: { global: 'gameStart' }, forced: true, direct: true, silent: true, popup: false,
    firstDo: true, priority: 1000,
    filter: function (trigger, holder) {
      return holder === (game.players || [])[0] && !!trigger && !startingEvents.has(trigger);
    },
    content: async function (event, trigger, holder) {
      if (holder !== (game.players || [])[0] || !trigger || startingEvents.has(trigger)) return;
      startingEvents.add(trigger);
      api.reset();
    },
  };
  game.addGlobalSkill('翰墨_开局');
  refresh();
  return api;
});
  const ops=(function createOps(context) {
 const {lib,game,ui,get,_status}=context;
 let keys=new WeakMap(),sequence=0; const noCounts=new WeakSet();
 const service=()=>game.huazhang;
 const id=p=>typeof p==='string'?p:p?.playerid;
 const player=value=>[].concat(game.players||[],game.dead||[],Object.values(game.playerMap||{})).find(p=>id(p)===id(value))||null;
 const live=p=>!!p&&(game.players||[]).includes(p)&&(!p.isIn||p.isIn());
 const players=()=> (game.players||[]).filter(live);
 const key=e=>{if(!e||typeof e!=='object')return null;if(!keys.has(e))keys.set(e,'hm-event-'+(++sequence));return keys.get(e);};
 const scope=(e,name)=>{const seen=new Set();while(e&&typeof e==='object'&&!seen.has(e)){if(e.name===name)return e;seen.add(e);e=e.parent||e.getParent?.();}return null;};
 const name=(c,p)=>get.name?get.name(c,p):c?.name;
 const length=c=>Array.from(String(get.translation?get.translation(name(c)):name(c)||'')).length;
 const number=(c,p)=>{const n=get.number?get.number(c,p):c?.number;return typeof n==='number'&&Number.isFinite(n)?n:0;};
 const damageCard=c=>!!(get.is?.damageCard?get.is.damageCard(c):get.tag?.(c,'damage'));
 const result=async ev=>ev?.forResult?ev.forResult():await ev;
 async function targets(p,prompt,filter,min=1,max=Infinity,forced=true){
  if(!live(p))return null;
  const r=await result(p.chooseTarget({prompt,selectTarget:[min,Math.min(max,players().length)],forced,
   filterTarget:(card,who,target)=>live(target)&&(!filter||filter(target))}));
  return r?.bool?r.targets||[]:null;
 }
 async function target(p,prompt,filter,forced=true){return (await targets(p,prompt,filter,1,1,forced))?.[0]||null;}
 async function cards(p,prompt,position='he',filter=null,range=[1,1],forced=true){
  if(!live(p))return null;
  const r=await result(p.chooseCard({prompt,position,selectCard:[range[0],Number.isFinite(range[1])?range[1]:p.countCards(position)],forced,
   filterCard:filter?c=>!!filter(c):()=>true}));
  return r?.bool?r.cards||[]:null;
 }
 async function control(p,prompt,choices){const r=await result(p.chooseControl(choices).set('prompt',prompt).set('ai',()=>0));return r?.control;}
 async function bool(p,prompt){return !!(await result(p.chooseBool(prompt)))?.bool;}
 function search(filter,count=1,options={}){
  const piles=[...(ui.cardPile?.childNodes||[]),...(options.pileOnly?[]:ui.discardPile?.childNodes||[])];
  const found=[...new Set(piles)].filter(filter);
  if(options.random){for(let i=found.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[found[i],found[j]]=[found[j],found[i]];}}
  return found.slice(0,Math.max(0,count));
 }
 function virtual(n,nature,cs=[]){const spec={name:n,cards:cs};if(nature)spec.nature=nature;return get.autoViewAs?get.autoViewAs(spec,cs):(lib.element?.VCard?new lib.element.VCard(spec):spec);}
 function noCount(e){
  if(!e||noCounts.has(e))return;noCounts.add(e);
  if(e.addCount!==false){const stat=e.player?.getStat?.('card'),n=name(e.card,e.player);if(stat&&stat[n]>0)stat[n]--;}
  e.addCount=false;
 }
 function unrespondable(e){if(!e)return; const all=players();if(e.directHit?.addArray)e.directHit.addArray(all);else e.directHit=[...new Set([...(e.directHit||[]),...all])]; e._hanmoNoResponse=true;}
 async function use(p,c,ts,options={}){
  if(!live(p))return {bool:false};
  let ev;
  if(ts===null||ts===undefined){
   ev=p.chooseUseTarget(c,true,options.noDistance?'nodistance':undefined);
   if(options.noCount)ev.set?.('addCount',false);
  }else{
   const legal=ts.filter(t=>live(t)&&(!p.canUse||p.canUse(c,t,options.noDistance?false:undefined,options.noCount?false:true)));
   if(!legal.length)return {bool:false};
   ev=p.useCard(c,legal,options.noCount?false:undefined);
   if(options.noCount)ev.addCount=false;
  }
  return result(ev);
 }
 async function useHand(p,options={}){
  if(!live(p))return {bool:false};
  const snapshot=options.snapshot||p.getCards('h');
  const selected=await cards(p,options.prompt||'可使用一张手牌，或取消','h',c=>snapshot.includes(c)&&(!options.target||p.canUse(c,options.target,options.noDistance?false:undefined,options.noCount?false:true))&&(!p.hasUseTarget||p.hasUseTarget(c,options.noDistance?false:undefined,options.noCount?false:true)),[1,1],false);
  if(!selected?.length)return {bool:false};
  const c=selected[0];if(!p.getCards('h').includes(c))return {bool:false};
  let r;
  if(options.target){
    if(!live(options.target)||!p.canUse(c,options.target,options.noDistance?false:undefined,options.noCount?false:true))return {bool:false};
    const next=p.chooseUseTarget(c,[options.target],true,options.noDistance?'nodistance':undefined);
    next.filterTarget=(card,who,t)=>t===options.target&&(!lib.filter.targetEnabledx||lib.filter.targetEnabledx(card,who,t))&&(options.noDistance||!lib.filter.targetInRange||lib.filter.targetInRange(card,who,t));
    if(options.noCount)next.addCount=false;
    r=await result(next);
  }else r=await use(p,c,null,options);
  return r?.bool===false?r:{...r,bool:true,card:c,cards:[c]};
 }
 const used=p=>p?.getAllHistory?p.getAllHistory('useCard')||[]:p?.getHistory?.('useCard')||[];
 function usedCount(p,phase){return used(p).filter(e=>scope(e,'phaseUse')===phase).length;}
 function discarded(){
  const moves=game.getGlobalHistory?.('cardMove')||[]; const set=new Set();
  for(const e of moves){if(e.name==='cardsDiscard'||e.position===ui.discardPile||(e.name==='lose'&&e.type==='discard'))for(const c of e.cards||[])set.add(c);}
  return [...(ui.discardPile?.childNodes||[])].filter(c=>set.has(c));
 }
 function moveParent(e){const p=e?.getParent?.()||e?.parent;return p&&p.name==='loseAsync'&&e.name!=='loseAsync'?p:null;}
 function moves(e){
  if(!e||moveParent(e))return [];
  const list=[];const persons=[...new Set([...(game.players||[]),...(game.dead||[])])];
  for(const receiver of persons){
   let gained=e.getg?.(receiver);if(!gained&&e.player===receiver&&e.name==='gain')gained=e.cards;
   if(!gained?.length)continue;
   const remaining=new Set(gained);
   const swap=e.getParent?.('swapHandcards')||((e.parent||e.getParent?.())?.name==='swapHandcards'?(e.parent||e.getParent()):null);
   if(swap?.name==='swapHandcards')for(const [giver,cs] of [[swap.player,swap.cards1||[]],[swap.target,swap.cards2||[]]]){
     if(!giver||giver===receiver)continue;const sent=gained.filter(c=>cs.includes(c));if(sent.length){list.push({giver,receiver,cards:sent,given:true});sent.forEach(c=>remaining.delete(c));}
   }
   for(const giver of persons){if(giver===receiver)continue;const lost=[...(e.getl?.(giver)?.cards2||e.getl?.(giver)?.cards||[])];
    if(e.name==='loseAsync'&&receiver.getHistory)for(const gain of receiver.getHistory('gain')||[]){
      if((gain.parent||gain.getParent?.())!==e)continue;
      lost.push(...(gain.getl?.(giver)?.cards2||[]));
    }
    const cs=gained.filter(c=>remaining.has(c)&&lost.includes(c)); if(!cs.length)continue;
    cs.forEach(c=>remaining.delete(c));
    const given=e.giver===giver||(receiver.getHistory?.('gain')||[]).some(g=>(g.parent||g.getParent?.())===e&&g.giver===giver&&(g.cards||[]).some(c=>cs.includes(c)))||e.type==='give'||e._hanmoExchange||e.name==='swapHandcards'||e.name==='swapEquip'||e.getParent?.('swapHandcards')?.name==='swapHandcards';
    list.push({giver,receiver,cards:cs,given:!!given});
   }
   if(remaining.size){const giver=e.giver||null;list.push({giver,receiver,cards:[...remaining],given:!!giver});}
  }
  return list;
 }
 function discardInfo(e){
  if(!e||moveParent(e))return [];
  let discarder=e.discarder;const parent=e.parent||e.getParent?.();
  if(!discarder&&parent?.name==='discardPlayerCard')discarder=parent.player;
  if(!discarder)return [];
  const out=[];
  for(const victim of [...new Set([...(game.players||[]),...(game.dead||[])])]){
   const loss=e.getl?.(victim);const cs=loss?.cards2||((e.player===victim&&e.type==='discard')?e.cards:[]);
   if(cs?.length&&victim!==discarder)out.push({discarder,victim,cards:cs.slice()});
  }
  return out;
 }
 async function exchange(a,b,ca,cb){
  if(!live(a)||!live(b)||!a.getCards('h').includes(ca)||!b.getCards('h').includes(cb))return;
  return result(a.swapHandcards(b,[ca],[cb]));
 }
 const authorAvailable=author=>Object.values(service().definitions).filter(d=>d.author===author&&service().core.isAvailable(d.id));
 async function writeAuthor(p,author,options={}){
  const defs=authorAvailable(author);if(!defs.length||!live(p))return {ok:false};
  const r=await result(p.chooseButton({createDialog:['选择一篇华章',[defs.map(d=>[d.id,'《'+d.title+'》<br>'+d.text]),'textbutton']],selectButton:1,forced:true}));
  const choice=r?.links?.[0];if(!r?.bool||!defs.some(d=>d.id===choice))return {ok:false};
  return options.exempt?service().gainExempt(p,choice):service().gain(p,choice);
 }
 const ops={id,player,live,players,key,scope,currentEvent:()=>_status.event,name,length,number,damageCard,nature:c=>get.nature?get.nature(c):c?.nature,
  target,targets,cards,control,bool,search,virtual,use,useHand,noCount,unrespondable,used,usedCount,discarded,moves,discardInfo,exchange,authorAvailable,writeAuthor,
  isInstance:(w,i)=>{const v=service().core.get(w);return !!v&&v.instanceId===i&&v.status==='resolving';},
  log:(...args)=>game.log?.(...args),reset(){keys=new WeakMap();sequence=0;}};
 return ops;
})(context);
  const proxy=(function installResponseProxy(context, ops) {
  const { lib, game, get, _status, ui, ai } = context;
  const records = new Map();
  const wrappedPlayers = new Map();
  const wrappedCards = new Map();
  const coverage = { directHit: [], genericResponseEntry: true, excluded: ['huogong 展示手牌'] };
  function ancestry(event, predicate) {
    const seen = new Set();
    while (event && !seen.has(event)) {
      if (predicate(event)) return event;
      seen.add(event);
      event = event.parent || event.getParent?.();
    }
    return null;
  }
  function sourceUse(event) { return ancestry(event, current => current.name === 'useCard'); }
  function valid(record) { return ops.isInstance(record.workId, record.instanceId); }
  function find(event, player) {
    const use = sourceUse(event);
    if (!use) return null;
    for (const record of records.values()) {
      if (valid(record) && record.use === use && record.target === player && ops.live(record.target) && ops.live(record.helper)) return record;
    }
    return null;
  }
  function blocked(event, player, nativeBlocked) {
    const record = find(event, player);
    if (!record) return nativeBlocked;
    // skip_shan is only a prompt shortcut. It must be re-evaluated after the
    // helper declines, since the protected role may have gained a shan meanwhile.
    record.blocked.set(event, !!event.directHit || !!event.directHit2 || !!record.use.directHit?.includes?.(player));
    return false;
  }
  function originalBlocked(choice, record) {
    const cardEvent = ancestry(choice.parent, current => current.type === 'card' && current.card === record.use.card);
    if (cardEvent && record.blocked.has(cardEvent)) return record.blocked.get(cardEvent);
    if (cardEvent?.directHit || cardEvent?.directHit2) return true;
    return !!record.use.directHit?.includes?.(record.target);
  }
  function descriptor(player, name) { return Object.getOwnPropertyDescriptor(player, name); }
  function restoreMethod(player, name, originalDescriptor, wrapper) {
    if (player[name] !== wrapper) return;
    if (originalDescriptor) Object.defineProperty(player, name, originalDescriptor);
    else delete player[name];
  }
  function inside(request) { return _status.event === request; }
  function logChoiceSkill(helper, value) {
    if (typeof value === 'string') helper.logSkill?.(value);
    else if (Array.isArray(value)) helper.logSkill?.apply(helper, value);
  }
  function accountSkill(helper, skill, next, kind) {
    const info = lib.skill[skill];
    if (!info) return;
    if (info.log !== false) helper.logSkill?.(skill, false, null, null, [next, helper]);
    if (kind === 'respond') {
      helper.checkShow?.(skill, true);
      if (!game.online) info.onrespond?.(next, helper);
    }
    const stat = helper.stat?.[helper.stat.length - 1]?.skill;
    if (stat && next.addSkillCount !== false) {
      stat[skill] = (stat[skill] || 0) + 1;
      if (info.sourceSkill) stat[info.sourceSkill] = (stat[info.sourceSkill] || 0) + 1;
    }
    next.huazhangProxySkill = skill;
  }
  async function askHelper(choice, record, kind) {
    const helper = record.helper;
    const target = record.target;
    if (!valid(record) || !ops.live(helper) || !ops.live(target)) return { bool: false };
    // Keep the helper's native choose event so its own view-as skills and card
    // restrictions still apply. Only the final native use/respond actor changes.
    const options = {};
    for (const name of ['type', 'filterCard', 'filterTarget', 'selectCard', 'selectTarget', 'position', 'respondTo', 'source', 'prompt2', 'ai', 'ai1', 'ai2', 'toUse', 'toRespond', 'shanRequired', 'shaRequired', 'addCount', 'addSkillCount', 'noOrdering']) {
      if (choice[name] !== undefined) options[name] = choice[name];
    }
    options.prompt = '盛孝章书：是否替' + get.translation(target) + (kind === 'chooseToUse' ? '使用' : '打出') + '响应牌？';
    options.forced = false;
    const request = helper[kind](options);
    request.huazhangProxyRequest = true;
    // Auto-skip heuristics made for the target must not skip the helper.
    request.autochoose = () => false;
    const oldRespond = helper.respond;
    const oldUseResult = helper.useResult;
    const respondDescriptor = descriptor(helper, 'respond');
    const useDescriptor = descriptor(helper, 'useResult');
    const respondWrapper = function(...args) {
      if (!inside(request)) return oldRespond.apply(this, args);
      let skill;
      const forwarded = args.slice();
      if (forwarded.length === 1 && forwarded[0] && !Array.isArray(forwarded[0]) && typeof forwarded[0] === 'object') {
        skill = forwarded[0].skill;
        forwarded[0] = { ...forwarded[0], skill: undefined };
      } else {
        for (let i = 0; i < forwarded.length; i++) if (typeof forwarded[i] === 'string' && lib.skill[forwarded[i]]) {
          skill = forwarded[i]; forwarded[i] = undefined;
        }
      }
      const next = target.respond(...forwarded);
      next.huazhangProxyHelper = helper;
      if (skill) accountSkill(helper, skill, next, 'respond');
      return next;
    };
    const useWrapper = function(result, event) {
      if (!inside(request)) return oldUseResult.call(this, result, event);
      const source = event || request;
      // Native useResult's skill callback belongs to the helper who selected
      // the conversion. Its resulting card use belongs to the protected target.
      source.onresult?.(result);
      const skill = result.skill;
      if (skill) lib.skill[skill]?.onuse?.(result, helper);
      if (source.logSkill) logChoiceSkill(helper, source.logSkill);
      const next = target.useResult({ ...result, skill: undefined }, { ...source, onresult: undefined, logSkill: false });
      if (next) next.huazhangProxyHelper = helper;
      if (skill && next) accountSkill(helper, skill, next, 'use');
      return next;
    };
    helper.respond = respondWrapper;
    helper.useResult = useWrapper;
    try {
      return await request.forResult();
    } finally {
      restoreMethod(helper, 'respond', respondDescriptor, respondWrapper);
      restoreMethod(helper, 'useResult', useDescriptor, useWrapper);
    }
  }
  function wrapPlayer(target) {
    if (wrappedPlayers.has(target)) return;
    const methods = {};
    for (const kind of ['chooseToUse', 'chooseToRespond']) {
      const native = target[kind];
      if (typeof native !== 'function') throw new Error('响应代理缺少原生 ' + kind);
      const own = descriptor(target, kind);
      const wrapper = function(...args) {
        const choice = native.apply(this, args);
        const record = find(choice.parent || _status.event, this);
        if (!record || choice.huazhangProxyRequest) return choice;
        const originalContent = choice.content;
        // This is the already compiled native event entry. Assigning a compiled
        // wrapper preserves its step state when falling back to native content.
        choice.content = async function(event) {
          if (event.responded || event.type === 'phase' || event.huazhangProxyRequest || !valid(record) || !ops.live(record.helper)) return originalContent.call(this, event);
          const result = await askHelper(event, record, kind);
          if (result?.bool) {
            event.result = result;
            event.responded = true;
            event.finish();
          } else if (originalBlocked(event, record) || (event.type === 'respondShan' && !_status.connectMode && lib.config.skip_shan && !record.target.hasShan())) {
            // The custom exception belongs only to the helper. A prohibited
            // original target does not gain an ordinary fallback response.
            event.result = { bool: false };
            event.finish();
          } else {
            await originalContent.call(this, event);
          }
        };
        return choice;
      };
      methods[kind] = { own, native, wrapper };
      target[kind] = wrapper;
    }
    wrappedPlayers.set(target, methods);
  }
  function restorePlayer(target) {
    const methods = wrappedPlayers.get(target);
    if (!methods) return;
    for (const [kind, entry] of Object.entries(methods)) restoreMethod(target, kind, entry.own, entry.wrapper);
    wrappedPlayers.delete(target);
  }
  function installCardEntries() {
    // These are narrow runtime adapters around the actual 1.11.6 content. They
    // only open a skipped response entry; directHit itself and damage targets
    // remain untouched. Unknown card implementations retain native behavior.
    for (const name of ['sha', 'nanman', 'wanjian', 'juedou']) {
      const info = lib.card[name];
      if (!info || wrappedCards.has(name) || typeof info.content !== 'function') continue;
      const original = info.content;
      let source = original.toString();
      const needle = name === 'sha'
        ? 'if (event.directHit || event.directHit2 || !_status.connectMode && lib.config.skip_shan && !target.hasShan()) {'
        : 'if (!event.directHit) {';
      const replacement = name === 'sha'
        ? 'if (__huazhangProxyBlocked(event, target, event.directHit || event.directHit2 || !_status.connectMode && lib.config.skip_shan && !target.hasShan())) {'
        : 'if (!__huazhangProxyBlocked(event, event.turn || event.target, event.directHit)) {';
      if (source.split(needle).length !== 2) {
        ops.log?.('盛孝章书：', name, '的响应短路结构不匹配，保留原生行为');
        continue;
      }
      source = source.replace(needle, replacement).replace(/^\s*async\s+([\w$]+)\s*\(/, 'async function $1(');
      let adapted;
      try {
        adapted = Function('get', '_status', 'ui', 'lib', 'game', 'ai', '__huazhangProxyBlocked', 'return (' + source + ');')(get, _status, ui, lib, game, ai, blocked);
      } catch (error) {
        ops.log?.('盛孝章书：', name, '的响应适配未启用', String(error));
        continue;
      }
      const wrapper = async function(event, trigger, player) { return adapted.call(this, event, trigger, player); };
      info.content = wrapper;
      wrappedCards.set(name, { info, original, wrapper });
      coverage.directHit.push(name);
    }
  }
  function prune() {
    for (const [key, record] of records) if (!valid(record)) records.delete(key);
    for (const player of wrappedPlayers.keys()) if (!Array.from(records.values()).some(record => record.target === player)) restorePlayer(player);
  }
  async function delegate(trigger, originalTarget, helper, life) {
    const use = sourceUse(trigger);
    if (!use || !originalTarget || !helper || originalTarget === helper) return false;
    const key = life.workId + ':' + life.instanceId;
    const record = { key, use, useKey: ops.key(use), target: originalTarget, helper, workId: life.workId, instanceId: life.instanceId, blocked: new WeakMap() };
    records.set(key, record);
    installCardEntries();
    wrapPlayer(originalTarget);
    life.targets([originalTarget, helper]);
    life.defer('sheng_proxy_after', { useKey: record.useKey });
    return true;
  }
  const rules = {
    '翰墨_响应代理清理': {
      charlotte: true, forced: true, popup: false, priority: 100,
      trigger: { global: 'useCardAfter' },
      filter(event) { prune(); return Array.from(records.values()).some(record => record.use === event); },
      async content(event, trigger) {
        for (const [key, record] of records) if (record.use === trigger) records.delete(key);
        prune();
      },
    },
  };
  function reset() {
    records.clear();
    for (const target of Array.from(wrappedPlayers.keys())) restorePlayer(target);
    for (const { info, original, wrapper } of wrappedCards.values()) if (info.content === wrapper) info.content = original;
    wrappedCards.clear();
    coverage.directHit.length = 0;
  }
  return { delegate, reset, rules, coverage };
})(context,ops);
  ops.delegate=proxy.delegate;
  const roster={"authors":[{"id":"caopi","name":"曹丕","characterIds":["caopi","hm_weicaopi"]},{"id":"caozhi","name":"曹植","characterIds":["caozhi","hm_weicaozhi"]},{"id":"caocao","name":"曹操","characterIds":["caocao","shen_caocao","hm_weicaocao"]},{"id":"kongrong","name":"孔融","characterIds":["kongrong"]},{"id":"chenlin","name":"陈琳","characterIds":["chenlin"]},{"id":"wangcan","name":"王粲","characterIds":["wangcan"]},{"id":"xugan","name":"徐干","characterIds":["xugan"]},{"id":"ruanyu","name":"阮瑀","characterIds":["ruanyu"]},{"id":"yingyang","name":"应玚","characterIds":["yingyang"]},{"id":"liuzhen","name":"刘桢","characterIds":["liuzhen"]}],"characters":[{"id":"hm_weicaopi","author":"caopi","name":"威曹丕","sex":"male","group":"wei","hp":4,"module":"caopi","skills":["翰墨_评文","翰墨_品藻"],"portrait":"hm_weicaopi.jpg"},{"id":"hm_weicaozhi","author":"caozhi","name":"威曹植","sex":"male","group":"wei","hp":3,"module":"caozhi","skills":["翰墨_高才","翰墨_华藻"],"portrait":"hm_weicaozhi.jpg"},{"id":"hm_weicaocao","author":"caocao","name":"威曹操","sex":"male","group":"wei","hp":4,"module":"caocao","skills":["翰墨_横槊","翰墨_建安"],"portrait":"hm_weicaocao.jpg"}]};
  const bodies=[(function createCaopi(context) {
  const { lib, game } = context;
  const o = () => game.huazhang.ops;
  let frames = new WeakMap();
  const turns = new Map();
  let previous = null;
  const turnKey = event => o().key(o().scope(event, 'phase')) || 'outside_phase';
  function turnState(key) {
    if (!turns.has(key)) turns.set(key, { lengths: new Set(), selected: new Map(), written: new Set() });
    return turns.get(key);
  }
  function selected(state, player) {
    const id = o().id(player);
    if (!state.selected.has(id)) state.selected.set(id, new Set());
    return state.selected.get(id);
  }
  function prepareUse(event) {
    if (!event || !event.card || frames.has(event)) return frames.get(event);
    const current = { length: o().length(event.card), name: o().name(event.card, event.player) };
    const turn = turnKey(event), state = turnState(turn);
    const frame = { current, previous, turn, firstLength: !state.lengths.has(current.length), pinzaoDone: new Set() };
    state.lengths.add(current.length);
    frames.set(event, frame);
    previous = current;
    return frame;
  }
  function compare(frame) {
    if (!frame?.previous) return null;
    return frame.current.length < frame.previous.length ? 'less' : frame.current.length > frame.previous.length ? 'greater' : 'equal';
  }
  function available(event, player) {
    const frame = frames.get(event), option = compare(frame);
    if (!option || selected(turnState(frame.turn), player).has(option)) return null;
    const a = frame.previous.length, b = frame.current.length;
    if (option === 'less' && ![a, b].some(n => o().search(c => o().length(c) === n, 1).length)) return null;
    if (option === 'greater' && !player.getCards('h').some(c => [a, b].includes(o().length(c)))) return null;
    if (option === 'equal' && (!(b > 0) || player.countCards('he') < b || !o().players().some(p => p !== player))) return null;
    return { frame, option };
  }
  function canDiscard(player) {
    return typeof player.countDiscardableCards === 'function' ? player.countDiscardableCards(player, 'he') > 0 : player.getCards('he').some(c => !lib.filter.cardDiscardable || lib.filter.cardDiscardable(c, player, '翰墨_品藻'));
  }

  const skills = {
    '翰墨_评文': {
      trigger: { global: 'useCardAfter' }, direct: true,
      group: '翰墨_评文书写',
      filter(event, player) { return !!available(event, player); },
      async content(event, trigger, player) {
        const choice = available(trigger, player);
        if (!choice) return;
        const { frame, option } = choice;
        const a = frame.previous.length, b = frame.current.length;
        const text = option === 'less' ? `评文：是否获得${a}字与${b}字牌各一张？` : option === 'greater' ? `评文：是否重铸一种${a}字或${b}字的所有手牌？` : `评文：是否交给一名其他角色${b}张牌？`;
        if (!await o().bool(player, text)) return;
        // A confirmed option is consumed before any nested gain/recast/give events run.
        selected(turnState(frame.turn), player).add(option);
        if (option === 'less') {
          const cards = [];
          for (const length of [b, a]) cards.push(...o().search(c => !cards.includes(c) && o().length(c) === length, 1));
          if (cards.length) await player.gain(cards, 'gain2');
        } else if (option === 'greater') {
          const lengths = [a, b].filter(n => player.getCards('h').some(c => o().length(c) === n));
          if (!lengths.length) return;
          const result = await o().control(player, '评文：重铸哪一种字数的全部手牌？', lengths.map(String));
          const length = lengths.includes(Number(result)) ? Number(result) : lengths[0];
          const cards = player.getCards('h').filter(c => o().length(c) === length);
          if (cards.length) await player.recast(cards);
        } else {
          if (player.countCards('he') < b) return;
          const target = await o().target(player, `评文：交给一名其他角色${b}张牌`, p => p !== player, true);
          if (!target) return;
          const cards = await o().cards(player, `评文：选择${b}张牌交给该角色`, 'he', null, [b, b], true);
          if (cards?.length === b && o().live(target)) await player.give(cards, target);
        }
      },
    },
    '翰墨_评文书写': {
      trigger: { global: 'phaseEnd' }, forced: true, popup: false,
      filter(event, player) {
        const state = turns.get(turnKey(event));
        return !!state && !state.written.has(o().id(player)) && selected(state, player).size >= 2;
      },
      async content(event, trigger, player) {
        const state = turns.get(turnKey(trigger));
        if (!state || state.written.has(o().id(player)) || selected(state, player).size < 2) return;
        state.written.add(o().id(player));
        await game.huazhang.write(player);
      },
    },
    '翰墨_品藻': {
      trigger: { global: 'useCard' }, forced: true,
      filter(event, player) {
        const frame = frames.get(event);
        return !!frame?.firstLength && !frame.pinzaoDone.has(o().id(player));
      },
      async content(event, trigger, player) {
        const frame = frames.get(trigger);
        if (!frame?.firstLength || frame.pinzaoDone.has(o().id(player))) return;
        frame.pinzaoDone.add(o().id(player));
        const target = await o().target(player, '品藻：令一名角色摸一张牌或弃一张牌', () => true, true);
        if (!target) return;
        const options = canDiscard(target) ? ['摸一张牌', '弃一张牌'] : ['摸一张牌'];
        const result = await o().control(player, '品藻：选择该角色执行的效果', options);
        if (result === '弃一张牌' && canDiscard(target)) await target.chooseToDiscard('he', 1, true, '品藻：弃置一张牌');
        else await target.draw(1);
      },
    },
  };
  const rules = {
    '翰墨_文序': {
      charlotte: true, forced: true, silent: true, firstDo: true, priority: 1000000000,
      trigger: { global: ['useCard0', 'useCard1', 'useCard'] },
      filter(event) { return !!event.card; },
      async content(event, trigger) { prepareUse(trigger); },
    },
    '翰墨_文序清理': {
      charlotte: true, forced: true, silent: true, lastDo: true, priority: -1000000000,
      trigger: { global: 'phaseAfter' },
      async content(event, trigger) { turns.delete(turnKey(trigger)); },
    },
  };
  const translate = {
    hm_weicaopi: '威曹丕',
    hm_weicaopi_ab: '曹丕',
    '翰墨_评文': '评文',
    '翰墨_评文_info': '每回合每项限一次，有角色使用牌后，若此牌的牌名字数：1.小于上一张被使用的牌，你可以获得两张与这两张牌牌名字数相同的牌各一张；2.大于上一张被使用的牌，你可以重铸一种这两张牌中包含的牌名字数的所有手牌；3.等于上一张被使用的牌，你可以交给一名其他角色该牌名字数张牌。每回合结束时，若本回合至少有两个选项被选择过，你书写一篇华章。',
    '翰墨_评文书写': '评文',
    '翰墨_品藻': '品藻',
    '翰墨_品藻_info': '锁定技，每回合每种牌名字数的牌首次被使用时，你令一名角色摸一张牌或弃一张牌。',
  };
  function reset() { frames = new WeakMap(); turns.clear(); previous = null; }
  return { skills, rules, translate, reset };
})(context),(function createCaozhi(context) {
  const { lib, game, ui, get, _status } = context;
  const o = () => game.huazhang.ops;
  const gao = '翰墨_高才', hua = '翰墨_华藻';
  let seenUses = new WeakMap();
  const records = new Map(), turns = new Map();
  const translatedLength = name => get.cardNameLength ? get.cardNameLength(name) : Array.from(String(get.translation ? get.translation(name) : name || '')).length;
  const turnKey = event => o().key(o().scope(event, 'phase')) || 'outside_phase';
  function turnNames(event, player) {
    const key = turnKey(event), id = o().id(player);
    if (!turns.has(key)) turns.set(key, new Map());
    const state = turns.get(key);
    if (!state.has(id)) state.set(id, new Set());
    return state.get(id);
  }
  function originals(cards) {
    const result = [];
    for (const card of cards) {
      const cs = card.isViewAsCard ? card[card.cardSymbol]?.cards || card.cards || [] : [card];
      for (const actual of cs) if (!result.includes(actual)) result.push(actual);
    }
    return result;
  }
  function arithmetic(cards, player) {
    if (!cards.length) return false;
    const lengths = cards.map(c => translatedLength(get.name ? get.name(c, player) : c.name)).sort((a, b) => a - b);
    const difference = lengths.length > 1 ? lengths[1] - lengths[0] : 0;
    return lengths.every((n, i) => i === 0 || n - lengths[i - 1] === difference);
  }
  function discardable(card, player) {
    return player.getCards('h').includes(card) && (!lib.filter.cardDiscardable || lib.filter.cardDiscardable(card, player, hua)) &&
      originals([card]).length > 0 && originals([card]).every(c => !lib.filter.cardDiscardable || lib.filter.cardDiscardable(c, player, hua));
  }
  function refund(player) {
    const stat = player.getStat('skill');
    // Native useSkill increments this counter before invoking the skill body.
    if (stat[hua] > 0) stat[hua]--;
  }
  function legalTricks(event, player) {
    const used = turnNames(event, player);
    const useContext = o().scope(event, 'chooseToUse') || event;
    return [...new Set(lib.inpile || [])].filter(name => {
      if (used.has(name)) return false;
      const card = o().virtual(name), info = get.info ? get.info(card) : lib.card?.[name];
      // get.type's third argument disables physical card type modifiers; type2
      // would also include delayed tricks, which this printed-card pool excludes.
      if ((get.type ? get.type(card, null, false) : info?.type) !== 'trick') return false;
      if (lib.filter.cardEnabled && !lib.filter.cardEnabled(card, player)) return false;
      if (lib.filter.cardUsable && !lib.filter.cardUsable(card, player, useContext)) return false;
      if (info?.notarget) return true;
      if (!player.hasUseTarget?.(card, undefined, true)) return false;
      if (get.select && player.canUse) {
        const range = get.select(info?.selectTarget).slice();
        game.checkMod?.(card, player, range, 'selectTarget', player);
        if (range[0] > 1) {
          const targets = game.filterPlayer2 ? game.filterPlayer2(null, null, true) : [...(game.players || []), ...(game.dead || [])];
          if (targets.filter(target => player.canUse(card, target, undefined, useContext)).length < range[0]) return false;
        }
      }
      return true;
    });
  }
  async function printTrick(event, player) {
    let names = legalTricks(event, player);
    if (!names.length) return;
    const choice = await player.chooseButton(['华藻：视为使用一张普通锦囊牌', [names.map(name => ['锦囊', '', name]), 'vcard']], true)
      .set('ai', button => get.useValue ? get.useValue({ name: button.link[2] }, player) : 1).forResult();
    // Recheck after selection; a forced native dialog has no cancellation path.
    names = legalTricks(event, player);
    if (!names.length) return;
    const link = choice?.links?.[0], selected = Array.isArray(link) ? link[2] : link;
    const name = names.includes(selected) ? selected : names[0];
    const used = turnNames(event, player);
    used.add(name); // Reserve before nested useCard triggers can invoke the skill.
    const result = await o().use(player, o().virtual(name));
    if (result?.bool === false) used.delete(name);
  }

  const skills = {
    [gao]: {
      trigger: { player: 'useCard' }, forced: true, mark: true, marktext: '才',
      intro: { content(storage) { return storage?.length ? '已记录牌名：' + storage.map(name => get.translation ? get.translation(name) : name).join('、') : '尚未记录牌名'; } },
      filter(event, player) {
        return !!event?.card && event.name === 'useCard' && event.player === player && !seenUses.get(event)?.has(o().id(player));
      },
      async content(event, trigger, player) {
        if (!skills[gao].filter(trigger, player)) return;
        if (!seenUses.has(trigger)) seenUses.set(trigger, new Set());
        seenUses.get(trigger).add(o().id(player));
        const list = records.get(player) || [];
        list.push(o().name(trigger.card, player));
        records.set(player, list);
        player.storage ||= {};
        player.storage[gao] = list.slice();
        const total = list.reduce((sum, name) => sum + translatedLength(name), 0);
        if (total >= 8) {
          // Clear before draw: any nested card use starts the next whole list.
          records.set(player, []);
          player.storage[gao] = [];
          player.markSkill?.(gao);
          await player.draw(2);
        } else player.markSkill?.(gao);
      },
    },
    [hua]: {
      enable: 'phaseUse', usable: 1, position: 'h', selectCard: [1, Infinity], complexCard: true,
      discard: false, lose: false, delay: false,
      filter(event, player) { return player.getCards('h').some(c => discardable(c, player)); },
      filterCard(card, player) { return discardable(card, player); },
      filterOk() {
        // Prefixes need not themselves be progressions: 1,2,4 may become 1,2,3,4.
        return arithmetic(originals(ui.selected.cards || []), _status.event?.player);
      },
      check(card) { return ui.selected.cards.length ? 0 : 6 - (get.value ? get.value(card) : 0); },
      async content(event, trigger, player) {
        const costs = [...new Set(event.cards || [])];
        if (!costs.length || costs.some(c => !discardable(c, player)) || !arithmetic(originals(costs), player)) { refund(player); return; }
        const snapshot = originals(costs).map(card => ({ card, type: get.type2 ? get.type2(card, player) : get.type(card, 'trick', player) }));
        const discard = player.discard(costs);
        await discard;
        // discard.done is the native lose event; cards2 contains actual lost h/e
        // cards after any stale selected cards were removed from its input.
        const lost = discard.done?.cards2 || discard.done?.cards || [];
        const actual = snapshot.filter(entry => lost.includes(entry.card));
        if (!actual.length) { refund(player); return; }
        await player.draw(actual.length);
        const typeCount = new Set(actual.map(entry => entry.type).filter(type => ['basic', 'trick', 'equip'].includes(type))).size;
        if (typeCount >= 1) await game.huazhang.write(player);
        if (typeCount >= 2) await printTrick(event, player);
        if (typeCount >= 3) refund(player);
      },
      ai: { order: 6, result: { player: 1 } },
    },
  };
  const rules = {
    '翰墨_华藻清理': {
      charlotte: true, forced: true, silent: true, lastDo: true, priority: -1000000000,
      trigger: { global: 'phaseAfter' },
      async content(event, trigger) { turns.delete(turnKey(trigger)); },
    },
  };
  const translate = {
    hm_weicaozhi: '威曹植', hm_weicaozhi_ab: '曹植',
    [gao]: '高才',
    [gao + '_info']: '锁定技，每当你使用一张牌时，记录此牌的牌名（相同牌名可重复记录）。若所记录牌名的总字数不小于8，先清空所有记录，然后摸两张牌。',
    [hua]: '华藻',
    [hua + '_info']: '出牌阶段限一次，你可以弃置任意张手牌（至少一张，且将这些牌的牌名字数排序后须成等差数列，公差可以为0），然后摸等量的牌。若实际弃置的牌包含的类别数：不少于一种，你书写一篇华章；不少于两种，你须视为使用一张本回合未以此技能使用过的普通锦囊牌（无合法选项则跳过）；不少于三种，此次华藻视为未发动。类别分为基本牌、锦囊牌和装备牌，刷新次数不重置本回合以此技能使用过的锦囊牌名。',
  };
  function reset() {
    seenUses = new WeakMap();
    for (const player of records.keys()) { if (player.storage) delete player.storage[gao]; player.unmarkSkill?.(gao); }
    records.clear(); turns.clear();
  }
  return { skills, rules, translate, reset };
})(context),(function createCaocao(context) {
  const { lib, game, get } = context;
  const heng = '翰墨_横槊', jian = '翰墨_建安', marker = 'hanmo_hengshuo';
  const o = () => game.huazhang.ops;
  let wins = new WeakMap(), pairFrames = new WeakMap(), pairBases = new WeakMap(), drawn = new WeakSet(), sequence = 0;
  const printed = new Map();
  // Native hasSkill -> getSkills defaults applySkillFilter=true, including seals
  // and disabled skills. Do not pass the fourth argument false here.
  const active = player => !!player?.hasSkill?.(jian);
  function winnerOf(event) {
    if (!event || event.result?.cancelled || event.result?.tie) return null;
    return event.result && Object.prototype.hasOwnProperty.call(event.result, 'winner') ? event.result.winner : event.winner || null;
  }
  function winFrame(event) {
    if (!event || !['chooseToCompare', 'compareMultiple'].includes(event.name)) return null;
    if (pairFrames.has(event)) return pairFrames.get(event);
    let root = event, key = event.compareMeanwhile ? 'meanwhile' : 'single';
    if (event.name === 'compareMultiple') {
      root = o().scope(event, 'chooseToCompare') || event;
      const index = Number.isInteger(root.iiwhile) ? root.iiwhile : root.targets?.indexOf(event.target);
      key = 'pair:' + (index >= 0 ? index : o().id(event.target));
    } else if (event.targets?.length && !event.compareMeanwhile) {
      // The native Multiple content has a true winner only on its callback
      // children; the parent stores numerical arrays and clears forceWinner.
      return null;
    }
    const frame = { root, key };
    pairFrames.set(event, frame);
    return frame;
  }
  function unseenWin(event, player) {
    if (!active(player) || !event || event.result?.cancelled) return null;
    const frame = winFrame(event);
    if (!frame) return null;
    const participants = event.compareMeanwhile ? [event.player, ...(event.targets || [])] : [event.player, event.target];
    if (!participants.includes(player)) return null;
    const winner = winnerOf(event);
    const count = [...new Set(participants.filter(who => who && who !== player && who !== winner))].length;
    if (!count) return null;
    const key = o().id(player) + ':' + frame.key;
    return wins.get(frame.root)?.has(key) ? null : { ...frame, key, count };
  }
  function measureApplies(event) {
    if (event?.name !== 'chooseToCompare') return false;
    return event.compareMeanwhile ? [event.tempplayer || event.player, ...(event.targets || [])].some(active) : [event.player, event.target].some(active);
  }
  function nameLength(card, owner) { return get.cardNameLength(card, owner); }
  function measure(event) {
    const source = event.tempplayer || event.player;
    if (event.compareMeanwhile) {
      // Meanwhile determines maxNum before compareFixing. Rebuild the complete
      // score vector and unique winner at BOTH timings, so late point modifiers
      // cannot create bonuses and the native incremental scan stays consistent.
      const people = [source, ...(event.targets || [])];
      const cards = [event.card1, ...(event.cardlist || [])];
      if (cards.length !== people.length || cards.some(card => !card)) return;
      const scores = cards.map((card, i) => nameLength(card, people[i]));
      event.num1 = scores[0];
      if (event.target && event.card2) event.num2 = scores[people.indexOf(event.target)];
      event.result.num1 = (event.targets || []).map(() => scores[0]);
      event.result.num2 = scores.slice(1);
      event.maxNum = Math.max(...scores);
      const leaders = people.filter((who, i) => scores[i] === event.maxNum);
      event.winner = leaders.length === 1 ? leaders[0] : null;
      return;
    }
    if (!event.card1 || !event.card2) return;
    // Multiple reuses num1 across groups. A passive Cao target must not leave
    // a source name score behind in a later pair he does not participate in.
    if (event.targets?.length && !active(source) && !pairBases.has(event)) pairBases.set(event, { base: event.num1, measured: nameLength(event.card1, source) });
    event.num1 = nameLength(event.card1, source);
    event.num2 = nameLength(event.card2, event.target);
    if (event.result && !Array.isArray(event.result.num1)) {
      event.result.num1 = event.num1; event.result.num2 = event.num2;
    }
  }
  function print(name, nature, player, quota) {
    const token = 'hengshuo-' + (++sequence), spec = { name, cards: [], storage: { [marker]: token } };
    if (nature) spec.nature = nature;
    const card = get.autoViewAs ? get.autoViewAs(spec, []) : spec;
    // VCard construction is allowed to normalize its input, but provenance and
    // a material-free card must survive chooseUseTarget's native deep copy.
    card.storage ||= {};
    card.storage[marker] = token;
    printed.set(token, { owner: player, name, quota });
    return card;
  }
  function frameFor(card, player) {
    const frame = printed.get(card?.storage?.[marker]);
    return frame?.owner === player && frame.name === card?.name ? frame : null;
  }
  function legal(card, player) {
    if (!o().live(player) || lib.filter.cardEnabled && !lib.filter.cardEnabled(card, player)) return false;
    if (card.name === 'sha') {
      const quota = frameFor(card, player)?.quota;
      if (lib.filter.cardUsable && !lib.filter.cardUsable(card, player, quota)) return false;
      return o().players().some(target => shaTarget(card, player, target));
    }
    if (card.name !== 'jiu' && lib.filter.cardUsable && !lib.filter.cardUsable(card, player)) return false;
    return !!player.hasUseTarget?.(card, card.name === 'sha' ? false : undefined, card.name === 'jiu' ? false : true);
  }
  function shaTarget(card, player, target) {
    if (!o().live(target)) return false;
    const quota = frameFor(card, player)?.quota;
    const ordinary = lib.filter.cardUsable2 ? lib.filter.cardUsable2(card, player, quota) : !lib.filter.cardUsable || lib.filter.cardUsable(card, player, quota);
    if (!ordinary && !game.checkMod?.(card, player, target, false, 'cardUsableTarget', player)) return false;
    // The separate native quota check above deliberately keeps target-specific
    // extra-use exceptions. canUse(false,false) then checks normal target and
    // card prohibitions while ignoring only distance and its ambient quota.
    return !!player.canUse(card, target, false, false);
  }
  function release(card) { printed.delete(card?.storage?.[marker]); }
  function choices(name, player, quota) {
    const links = name === 'sha' ? (get.inpileVCardList ? get.inpileVCardList(row => row[2] === 'sha') : [['基本', '', 'sha'], ...(lib.inpile_nature || []).map(n => ['基本', '', 'sha', n])]) : [[name === 'juedou' ? '锦囊' : '基本', '', name]];
    const seen = new Set(), result = [];
    for (const link of links) {
      const nature = link[3] || '', key = name + ':' + nature;
      if (seen.has(key)) continue;
      seen.add(key);
      const card = print(name, nature, player, quota);
      if (legal(card, player)) result.push({ link, card });
      else release(card);
    }
    return result;
  }
  async function forceUse(winner, card) {
    if (!legal(card, winner)) return;
    const spec = { card, forced: true };
    if (card.name === 'jiu') spec.addCount = false;
    if (card.name === 'juedou') spec.selectTarget = [1, 2];
    if (card.name === 'sha') {
      spec.nodistance = true;
      spec.filterTarget = (card, player, target) => shaTarget(card, player, target);
    }
    // Native chooseUseTarget handles forced UI/selection and rechecks enabled
    // and usable before creating the actual winner-owned useCard event.
    await winner.chooseUseTarget(spec);
  }
  const skills = {
    [heng]: {
      enable: 'phaseUse', usable: 3,
      filter(event, player) { return o().players().some(target => target !== player && player.canCompare(target)); },
      filterTarget(card, player, target) { return target !== player && player.canCompare(target); },
      async content(event, trigger, player) {
        const target = event.targets?.[0] || event.target;
        if (!target || target === player || !player.canCompare(target)) return;
        // forResult resolves only after the native compare's After triggers,
        // so locked 建安 (and any resulting hand/HP change) finishes first.
        const result = await player.chooseToCompare(target).forResult();
        const winner = result?.cancelled || result?.tie ? null : result?.winner;
        if (!o().live(winner)) return;
        const hand = winner.countCards('h'), hp = winner.getHp ? winner.getHp() : winner.hp;
        const name = hand > hp ? 'jiu' : hand === hp ? 'juedou' : 'sha';
        // Native Sha quota filters inspect both the explicit event and the
        // current event's player. Run selection in a real winner-owned child,
        // and supply an unqueued native quota frame with an owned phaseUse
        // parent so Cao Cao's outer chooseToUse cannot waive winner's quota.
        const next = game.createEvent('翰墨_横槊执行', false);
        next.player = winner;
        next.setContent(async function hanmoHengshuoExecute() {
          const phase = new lib.element.GameEvent('phaseUse', false);
          phase.player = winner;
          const quota = new lib.element.GameEvent('chooseToUse', false);
          quota.player = winner;
          quota.parent = phase;
          const list = choices(name, winner, quota);
          try {
            if (!list.length || !await o().bool(player, '横槊：是否令' + (get.translation ? get.translation(winner) : o().id(winner)) + '视为使用一张' + (get.translation ? get.translation(name) : name) + '？')) return;
            let chosen = list[0];
            if (name === 'sha') {
              const result = await winner.chooseButton(['横槊：选择要使用的杀的属性', [list.map(entry => entry.link), 'vcard']], true).forResult();
              const link = result?.links?.[0];
              chosen = list.find(entry => entry.link[2] === link?.[2] && (entry.link[3] || '') === (link?.[3] || '')) || list[0];
            }
            await forceUse(winner, chosen.card);
          } finally {
            for (const entry of list) release(entry.card);
          }
        });
        await next;
      },
      ai: { order: 6, result: { player: 1 } },
    },
    [jian]: {
      trigger: { global: ['chooseToCompareAfter', 'compareMultipleAfter'] }, forced: true,
      filter(event, player) { return !!unseenWin(event, player); },
      async content(event, trigger, player) {
        const frame = unseenWin(trigger, player);
        if (!frame) return;
        if (!wins.has(frame.root)) wins.set(frame.root, new Set());
        wins.get(frame.root).add(frame.key); // Reserve before nested writing.
        for (let i = 0; i < frame.count; i++) {
          await game.huazhang.write(player);
          if (o().live(player)) await player.draw(1);
        }
      },
    },
  };
  const rules = {
    '翰墨_拼点字数': {
      charlotte: true, forced: true, silent: true, lastDo: true, priority: -1000000000,
      trigger: { global: ['compare', 'compareFixing'] },
      filter: measureApplies,
      async content(event, trigger) { if (measureApplies(trigger)) measure(trigger); },
    },
    '翰墨_拼点字数复原': {
      charlotte: true, forced: true, silent: true, lastDo: true,
      trigger: { global: 'compareMultipleAfter' },
      filter(event) { return event?.name === 'compareMultiple' && pairBases.has(o().scope(event, 'chooseToCompare')); },
      async content(event, trigger) {
        const root = o().scope(trigger, 'chooseToCompare');
        if (!root || !pairBases.has(root)) return;
        const saved = pairBases.get(root);
        // Preserve explicit changes an existing pair callback makes after the
        // winner is settled; only remove our own still-present replacement.
        if (root.num1 === saved.measured) root.num1 = saved.base;
        pairBases.delete(root);
      },
    },
    '翰墨_拼点逐对': {
      charlotte: true, forced: true, silent: true, firstDo: true, priority: 1000000000,
      trigger: { global: ['chooseToCompareBegin', 'compareFixing'] },
      filter(event) { return event?.name === 'chooseToCompare' && !!event.targets?.length && !event.callback && !event.compareMeanwhile && [event.player, ...event.targets].some(active); },
      async content(event, trigger) {
        if (!rules['翰墨_拼点逐对'].filter(trigger)) return;
        // Multiple emits a compareMultiple child with the actual pair winner
        // only when callback exists. Meanwhile ignores callback entirely, so
        // its eventual single winner remains one result, even at Begin before
        // native content sets compareMeanwhile=true. Existing callbacks stay.
        trigger.callback = async function hanmoComparePair() {};
      },
    },
    '翰墨_横槊用牌': {
      charlotte: true, forced: true, silent: true,
      trigger: { global: 'useCard' },
      filter(event) { return event?.name === 'useCard' && event.card?.name === 'sha' && !!frameFor(event.card, event.player) && !drawn.has(event); },
      async content(event, trigger) {
        if (!rules['翰墨_横槊用牌'].filter(trigger)) return;
        drawn.add(trigger);
        await trigger.player.drawTo(trigger.player.maxHp);
      },
      mod: {
        cardUsable(card, player) { if (card?.name === 'jiu' && frameFor(card, player)) return Infinity; },
        targetInRange(card, player) { if (card?.name === 'sha' && frameFor(card, player)) return true; },
      },
    },
  };
  const translate = {
    hm_weicaocao: '威曹操', hm_weicaocao_ab: '曹操',
    [heng]: '横槊',
    [heng + '_info']: '出牌阶段限三次，你可以与一名其他角色拼点。拼点及其后续触发结算完毕后，你可以令赢家按其当前手牌数与当前体力值执行一项：大于，视为使用一张不计入次数且无次数限制的【酒】；等于，视为使用一张【决斗】，由其选择一至两名合法目标；小于，视为使用一张由其选择属性且无距离限制的【杀】，此【杀】仍受使用次数限制，其使用此【杀】时将手牌摸至体力上限。赢家须选择合法的牌与目标，无合法选项则跳过。平局无赢家效果。',
    [jian]: '建安',
    [jian + '_info']: '锁定技，你参与的拼点改为比较牌名字数，且本次拼点每有一名其他角色没赢，你书写一篇华章并摸一张牌。你持有华章无数量限制。一对多逐组结算你实际参与的组；共同拼点最高并列时无人赢。牌名字数不受点数修正影响，直接判赢效果仍生效。华章库无可书写篇目仍摸牌；此技能失效后保留已有华章，新增外来华章恢复通常上限。',
  };
  function reset() { wins = new WeakMap(); pairFrames = new WeakMap(); pairBases = new WeakMap(); drawn = new WeakSet(); printed.clear(); }
  return { skills, rules, translate, reset, foreignLimitFor: player => active(player) ? Infinity : undefined };
})(context)];
  const modules=[(function createFactory(context) {
  const { lib, game, ui, get } = context;
  const dianlun = new Map();
  const luoshen = new Map();
  const mingdu = [];
  const yangshu = new Map();
  const o = () => game.huazhang.ops;
  const constituents = card => card ? [card].concat(card.cards || []) : [];
  const sameOwner = (record, player) => record && record.owner === o().id(player);
  const taggedDianlun = (card, player) => constituents(card).some(c => sameOwner(dianlun.get(c), player));
  const taggedLuoshen = (card, player) => sameOwner(luoshen.get(card), player);
  function internalTransit(trigger, card, owner) {
    if (get.owner(card) === owner) return true;
    const parent = trigger.relatedEvent || trigger.getParent?.();
    if (parent?.player === owner && ['equip', 'addJudge', 'addToExpansion'].includes(parent.name)) return true;
    const use = trigger.getParent?.('useCard');
    return !!(use?.name === 'useCard' && constituents(use.card).includes(card) && use.targets?.includes(owner) && ['equip', 'delay'].includes(get.type(use.card, null, false)));
  }
  const discardable = (card, player) => !lib.filter.cardDiscardable || lib.filter.cardDiscardable(card, player, '翰墨_华章');
  const standardNumber = (card, player) => { const number = o().number(card, player); return Number.isInteger(number) && number >= 1 && number <= 13; };
  const countCosts = player => typeof player.countDiscardableCards === 'function' ? player.countDiscardableCards(player, 'he') : player.countCards('he', c => discardable(c, player));
  const natureKey = nature => Array.isArray(nature) ? nature.slice().sort().join('|') : (nature || '');
  const hasMingdu = (card, player) => mingdu.some(r => r.owner === o().id(player) && o().isInstance('zhi_mingdupian', r.instance) && get.suit(card, player) === r.suit);
  const hasYangshu = player => { const record = yangshu.get(o().id(player)); return !!record && o().isInstance('zhi_yuyangdezushu', record.instance); };

  async function draw(player, amount, tag) {
    if (amount <= 0) return [];
    const next = player.draw(amount);
    if (tag && next.gaintag) next.gaintag.add(tag);
    const result = typeof next.forResult === 'function' ? await next.forResult() : await next;
    return result?.cards || next.result?.cards || [];
  }
  function usedForms(player) {
    const seen = new Set(), forms = [];
    for (const entry of o().used(player)) {
      const card = entry.card || entry;
      const type = get.type(card, null, false);
      if (!['basic', 'trick', 'delay'].includes(type)) continue;
      const name = o().name(card, player), nature = o().nature(card);
      const key = name + ':' + natureKey(nature);
      const label = get.translation(name) + (nature ? '（' + get.translation(nature) + '）' : '');
      if (!seen.has(key)) { seen.add(key); forms.push({ key, label, name, nature }); }
    }
    return forms;
  }
  function printable(player) {
    const materials = o().discarded(), forms = usedForms(player);
    return forms.map(form => ({ ...form, materials: materials.filter(card => player.hasUseTarget(o().virtual(form.name, form.nature, [card]))) })).filter(form => form.materials.length);
  }
  function returnTop(cards) {
    for (let i = cards.length - 1; i >= 0; i--) ui.cardPile.insertBefore(cards[i], ui.cardPile.firstChild);
    if (typeof game.updateRoundNumber === 'function') game.updateRoundNumber();
  }
  async function chooseOther(event, holder, title) {
    const target = await o().target(holder, title, p => p !== holder && o().live(p), false);
    return target ? { ok: true, data: { target } } : false;
  }

  const works = [
    {
      id: 'pi_dianlun', active: true,
      filter(event, holder) { return holder.getCards('h').some(c => discardable(c, holder) && standardNumber(c, holder)); },
      async prepare(event, holder) {
        const result = await holder.chooseCard('h', [1, Infinity], '典论·论文：弃置点数成等差数列的手牌').set('complexCard', true).set('filterCard', function (card, player) {
          if (!discardable(card, player) || !standardNumber(card, player)) return false;
          const cards = (ui.selected?.cards || []).concat(card);
          if (cards.length < 3) return true;
          const nums = cards.map(c => o().number(c, player)).sort((a, b) => a - b), gap = nums[1] - nums[0];
          return nums.slice(2).every((n, i) => n - nums[i + 1] === gap);
        }).forResult();
        return result?.bool && result.cards?.length && result.cards.every(c => standardNumber(c, holder)) ? { ok: true, data: { cards: result.cards } } : false;
      },
      async effect(event, holder, api, data) {
        const cards = data.cards.filter(c => holder.getCards('h').includes(c) && discardable(c, holder) && standardNumber(c, holder));
        if (!cards.length) return;
        await holder.discard(cards);
        const turn = o().key(o().scope(event, 'phase'));
        const drawn = await draw(holder, cards.length, 'dcdianlun');
        for (const c of drawn) { c.addGaintag?.('dcdianlun'); dianlun.set(c, { owner: o().id(holder), turn }); }
      },
    },
    {
      id: 'pi_yangexing', trigger: { global: 'damageBegin4' },
      filter(event) { return event.num > 0; },
      async effect(event) {
        event.cancel();
        if (o().live(event.source) && countCosts(event.source)) await event.source.chooseToDiscard('he', 2, true, '燕歌行：弃置两张牌');
      },
    },
    {
      id: 'pi_yuwuzhishu', trigger: { global: 'phaseEnd' }, consume: 'confirm',
      filter(event, holder) { return printable(holder).length > 0; },
      async effect(event, holder) {
        const combinations = printable(holder);
        if (!combinations.length) return;
        const pool = new Set(combinations.flatMap(f => f.materials));
        const result = await holder.chooseCardButton([...pool], '与吴质书：选择本回合进入弃牌堆的素材', 1, true).forResult();
        let material = result?.links?.[0] || result?.cards?.[0];
        // The final material is mandatory after confirmation; an engine-invalidated result is retried from its still-legal set.
        if (!material || !pool.has(material)) material = [...pool][0];
        const legal = combinations.filter(f => f.materials.includes(material));
        const key = await o().control(holder, '与吴质书：选择本局使用过的牌名及属性', legal.map(f => f.label));
        const form = legal.find(f => f.label === key || f.key === key) || legal[0];
        if (!o().discarded().includes(material)) return;
        const card = o().virtual(form.name, form.nature, [material]);
        if (holder.hasUseTarget(card)) await o().use(holder, card, null);
      },
    },
    {
      id: 'pi_furongchizuo', active: true,
      filter(event, holder) { return o().players().some(p => p !== holder); },
      async prepare(event, holder) {
        const targets = await o().targets(holder, '芙蓉池作：选择依次使用手牌的其他角色', p => p !== holder, 1, Infinity, false);
        return targets?.length ? { ok: true, data: { targets } } : false;
      },
      async effect(event, holder, api, data) {
        const names = new Set();
        for (const target of data.targets) {
          if (!o().live(target)) continue;
          const result = await o().useHand(target, { prompt: '芙蓉池作：是否使用一张手牌？' });
          if (result?.bool && result.card) names.add(o().name(result.card, target));
        }
        await draw(holder, names.size);
      },
    },
    {
      id: 'pi_qiuhuxing', trigger: { player: 'phaseEnd' },
      async effect(event, holder, api, data, life) {
        const target = await o().target(holder, '秋胡行：选择下一次受到伤害的角色', () => true, true);
        if (!target) return;
        life.targets([holder, target]);
        life.defer('等待受伤', { target: o().id(target), ends: 0, origin: o().key(o().scope(event, 'phase')) });
      },
      stages: {
        '等待受伤': {
          trigger: { global: ['phaseAfter', 'damageEnd'] },
          filter(event, holder, api, data) { return event.name === 'phase' || event.name === 'phaseAfter' ? o().key(event) !== data.origin : o().id(event.player) === data.target && event.num > 0; },
          async effect(event, holder, api, data, life) {
            if (event.name === 'phase' || event.name === 'phaseAfter') life.defer('等待受伤', { ...data, ends: data.ends + (o().key(event) === data.origin ? 0 : 1) });
            else await draw(holder, Math.max(1, data.ends));
          },
        },
      },
    },
    {
      id: 'pi_dicangshulei', active: true,
      async prepare(event, holder) {
        const target = await o().target(holder, '弟仓舒诔：选择获得展示牌的角色', () => true, false);
        return target ? { ok: true, data: { target } } : false;
      },
      async effect(event, holder, api, data) {
        const cards = get.cards(4);
        if (!cards.length) return;
        if (game.cardsGotoOrdering) await game.cardsGotoOrdering(cards);
        try {
          await holder.showCards(cards, '弟仓舒诔');
          const target = data.target;
          if (!o().live(target)) return;
          const eligible = cards.filter(c => standardNumber(c));
          if (!eligible.length) return;
          const result = await target.chooseCardButton(cards, '弟仓舒诔：获得至少一张点数之和不大于13的牌', [1, Infinity], true).set('filterButton', button => standardNumber(button.link) && (ui.selected?.buttons || []).reduce((n, b) => n + o().number(b.link), 0) + o().number(button.link) <= 13).forResult();
          let chosen = (result?.links || []).filter(c => eligible.includes(c));
          if (!chosen.length) chosen = eligible.slice(0, 1);
          const sum = chosen.reduce((n, c) => n + o().number(c), 0);
          if (sum <= 13 && chosen.length) { await target.gain(chosen, 'gain2'); for (const c of chosen) cards.splice(cards.indexOf(c), 1); }
        } finally { returnTop(cards); }
      },
    },
    {
      id: 'pi_huanghuangjingluoxing', trigger: { global: 'useCard2' },
      filter(event, holder) { return event.targets?.some(t => t !== event.player) && countCosts(holder) > 0; },
      async effect(event, holder) {
        const cost = await o().cards(holder, '煌煌京洛行：弃置一张牌', 'he', c => discardable(c, holder), [1, 1], true);
        if (!cost?.length) return;
        await holder.discard(cost);
        const target = await o().target(holder, '煌煌京洛行：令此牌对一名目标无效', p => event.targets.includes(p), true);
        if (!target) return;
        event.excluded ||= new Set();
        if (typeof event.excluded.add === 'function') event.excluded.add(target);
        else if (!event.excluded.includes(target)) event.excluded.push(target);
      },
    },
    {
      id: 'zhi_luoshenfu', trigger: { player: 'phaseZhunbeiBegin' },
      async effect(event, holder) {
        let again;
        do {
          const next = holder.judge({ judge: card => get.color(card) === 'black' ? 1.5 : -1.5, judge2: result => result.bool });
          next.set('callback', async function (judgeEvent) {
            const card = judgeEvent.card || judgeEvent.judgeResult?.card;
            if ((judgeEvent.judgeResult?.color || get.color(card)) === 'black' && get.position(card, true) === 'o') {
              await holder.gain([card], 'gain2');
              luoshen.set(card, { owner: o().id(holder) });
            }
          });
          const result = await next.forResult();
          const card = result?.card;
          if (!card || (result.color || get.color(card)) !== 'black') break;
          if (!luoshen.has(card) && get.position(card, true) === 'o') { await holder.gain([card], 'gain2'); luoshen.set(card, { owner: o().id(holder) }); }
          again = await o().bool(holder, '洛神赋：是否继续判定？');
        } while (again && o().live(holder));
      },
    },
    {
      id: 'zhi_baimapian', trigger: { player: 'damageEnd' },
      filter(event, holder) {
        return event.num > 0 && o().live(event.source) && event.source !== holder && event.card && o().damageCard(event.card) && countCosts(holder) > 0 && holder.canUse(o().virtual(o().name(event.card), o().nature(event.card)), event.source, undefined, true);
      },
      async effect(event, holder) {
        const cards = await o().cards(holder, '白马篇：弃置一张牌反击', 'he', c => discardable(c, holder), [1, 1], true);
        if (!cards?.length) return;
        await holder.discard(cards);
        const card = o().virtual(o().name(event.card), o().nature(event.card));
        if (o().live(event.source) && holder.canUse(card, event.source, undefined, true)) await o().use(holder, card, [event.source]);
      },
    },
    {
      id: 'zhi_qibushi', active: true,
      filter(event, holder) { return holder.countCards('h') < 7; },
      async effect(event, holder, api, data, life) {
        const phase = o().scope(event, 'phaseUse');
        const cards = await draw(holder, Math.max(0, 7 - holder.countCards('h')));
        life.targets([holder]);
        life.defer('七步结算', { phase: o().key(phase), drawn: cards.length });
      },
      stages: {
        '七步结算': {
          trigger: { global: 'phaseUseAfter' },
          filter(event, holder, api, data) { return o().key(event) === data.phase; },
          async effect(event, holder, api, data) {
            if (o().usedCount(holder, event) < 7 && data.drawn > 0) await holder.loseHp(data.drawn);
          },
        },
      },
    },
    {
      id: 'zhi_zengbaimawangbiao', active: true,
      filter(event, holder) { return o().players().some(p => p !== holder); },
      prepare(event, holder) { return chooseOther(event, holder, '赠白马王彪：选择一名其他角色'); },
      async effect(event, holder, api, data, life) {
        life.targets([holder, data.target]);
        life.defer('首次受伤', { holder: o().id(holder), target: o().id(data.target) });
      },
      stages: {
        '首次受伤': {
          trigger: { global: 'damageEnd' },
          filter(event, holder, api, data) { return event.num > 0 && [data.holder, data.target].includes(o().id(event.player)); },
          async effect(event, holder, api, data) {
            const a = o().player(data.holder), b = o().player(data.target);
            for (const p of [a, b]) if (o().live(p)) await draw(p, 2);
            const hurt = event.player, unhurt = hurt === a ? b : a;
            if (!o().live(hurt) || !o().live(unhurt) || !unhurt.countCards('he')) return;
            const cards = await o().cards(unhurt, '赠白马王彪：交给受伤角色一张牌', 'he', null, [1, 1], true);
            if (cards?.length) await unhurt.give(cards, hurt);
          },
        },
      },
    },
    {
      id: 'zhi_mingdupian', active: true,
      async prepare(event, holder) {
        const suit = await o().control(holder, '名都篇：选择一个常规花色', ['heart', 'spade', 'club', 'diamond', 'cancel2']);
        return ['heart', 'spade', 'club', 'diamond'].includes(suit) ? { ok: true, data: { suit } } : false;
      },
      async effect(event, holder, api, data, life) {
        life.until('phaseUse');
        const cards = o().search(c => get.suit(c) === data.suit, 1, { pileOnly: true, random: true });
        if (cards.length) { await holder.gain(cards, 'gain2'); mingdu.push({ owner: o().id(holder), suit: data.suit, instance: life.instanceId }); }
      },
    },
    {
      id: 'zhi_yuyangdezushu', trigger: { player: 'damageEnd' },
      filter(event) { return !!event.source && o().live(event.source); },
      async effect(event, holder, api, data, life) {
        if (!event.source) return;
        const source = o().id(event.source);
        yangshu.set(source, { instance: life.instanceId });
        life.targets([event.source]);
        life.defer('杨书到期', { source, instance: life.instanceId });
      },
      stages: {
        '杨书到期': {
          trigger: { global: 'phaseBegin' },
          filter(event, holder, api, data) { return o().id(event.player) === data.source && yangshu.get(data.source)?.instance === data.instance && o().isInstance('zhi_yuyangdezushu', data.instance); },
          async effect(event, holder, api, data) {
            if (o().id(event.player) === data.source && yangshu.get(data.source)?.instance === data.instance && o().isInstance('zhi_yuyangdezushu', data.instance)) yangshu.delete(data.source);
          },
        },
      },
    },
    {
      id: 'zhi_qiuzishibiao', trigger: { global: 'phaseBefore' },
      filter(event, holder) { return event.player !== holder && o().live(event.player); },
      async effect(event, holder) {
        const target = event.player;
        const cards = await o().cards(holder, '求自试表：交给该角色任意张牌（可为零）', 'he', null, [0, Infinity], true);
        if (cards?.length) await holder.give(cards, target);
        if (o().live(target) && await o().bool(target, '求自试表：是否令其先执行一个完整的额外回合？') && o().live(holder)) {
          // player.phase creates a child of this resolving event; awaiting it suspends the original phaseBefore.
          await holder.phase('翰墨_求自试表');
        }
      },
    },
  ];

  const rules = {
    '翰墨_典论余韵': {
      charlotte: true, forced: true, silent: true, firstDo: true, priority: 100,
      trigger: { global: ['useCard1', 'phaseAfter'] },
      filter(event) { return event.name === 'phase' ? dianlun.size > 0 : taggedDianlun(event.card, event.player); },
      mod: {
        cardUsable(card, player) { if (taggedDianlun(card, player)) return Infinity; },
        targetInRange(card, player) { if (taggedDianlun(card, player)) return true; },
      },
      async content(event, trigger) {
        if (trigger.name === 'phase' || trigger.name === 'phaseAfter') {
          const key = o().key(trigger);
          for (const [card, record] of dianlun) if (record.turn === key) { card.removeGaintag?.('dcdianlun'); dianlun.delete(card); }
        } else if (taggedDianlun(trigger.card, trigger.player)) o().noCount(trigger);
      },
    },
    '翰墨_洛神余韵': {
      charlotte: true, forced: true, silent: true, firstDo: true, priority: 100,
      trigger: { global: ['loseAfter', 'loseAsyncAfter', 'gainAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter', 'useCardAfter'] },
      filter() { return luoshen.size > 0; },
      mod: {
        ignoredHandcard(card, player) { if (taggedLuoshen(card, player)) return true; },
        cardDiscardable(card, player, name) { if (name === 'phaseDiscard' && taggedLuoshen(card, player)) return false; },
      },
      async content(event, trigger) {
        for (const [card, record] of luoshen) {
          const owner = o().player(record.owner), loss = trigger.getl?.(owner);
          const cards = loss?.cards2 || loss?.cards || (trigger.player === owner && trigger.name === 'lose' ? trigger.cards : []);
          if (cards?.includes(card) && !internalTransit(trigger, card, owner)) luoshen.delete(card);
          else if (trigger.name === 'gain' && (trigger.getg?.(trigger.player) || trigger.cards || []).includes(card) && trigger.player !== owner) luoshen.delete(card);
          else if (['equip', 'addJudge', 'addToExpansion', 'useCard'].includes(trigger.name) && get.owner(card) !== owner) luoshen.delete(card);
        }
      },
    },
    '翰墨_洛神作闪': {
      charlotte: true, enable: ['chooseToUse', 'chooseToRespond'], position: 'h', selectCard: 1,
      viewAs: { name: 'shan' }, prompt: '将一张洛神赋所得且尚未失去的手牌当闪使用或打出',
      filterCard(card, player) { return taggedLuoshen(card, player); },
      viewAsFilter(player) { return player.getCards('h').some(c => taggedLuoshen(c, player)); },
    },
    '翰墨_名都余韵': {
      charlotte: true, forced: true, silent: true, firstDo: true, priority: 100,
      trigger: { global: 'useCard1' },
      filter(event) { return hasMingdu(event.card, event.player); },
      mod: {
        cardUsable(card, player) { if (hasMingdu(card, player)) return Infinity; },
        targetInRange(card, player) { if (hasMingdu(card, player)) return true; },
      },
      async content(event, trigger) { if (hasMingdu(trigger.card, trigger.player)) o().noCount(trigger); },
    },
    '翰墨_杨书禁基本': {
      charlotte: true,
      mod: {
        cardEnabled(card, player) { if (hasYangshu(player) && get.type(card, null, false) === 'basic') return false; },
        cardRespondable(card, player) { if (hasYangshu(player) && get.type(card, null, false) === 'basic') return false; },
        cardSavable(card, player) { if (hasYangshu(player) && get.type(card, null, false) === 'basic') return false; },
      },
    },
  };
  function reset() {
    for (const card of dianlun.keys()) card.removeGaintag?.('dcdianlun');
    dianlun.clear(); luoshen.clear(); mingdu.length = 0; yangshu.clear();
  }
  return { works, rules, reset };
})(context),(function createCaoCanWorks(context) {
  const { lib, game, get, _status } = context;
  const phaseEffects = new Map();
  const roundEffects = new Map();
  const jinglieEffects = new Map();
  const everDying = new Set();
  let jinglieTurnEnds = new WeakSet();
  const o = () => game.huazhang.ops;
  const id = player => o().id(player);
  const live = player => o().live(player);
  function seatOrder() {
    const players = o().players().slice();
    if (players.sortBySeat) players.sortBySeat();
    return players;
  }
  function key(life) { return life.workId + ':' + life.instanceId; }
  function valid(record) { return o().isInstance(record.workId, record.instanceId); }
  function clean(map) {
    for (const [k, value] of map) if (!valid(value)) map.delete(k);
    return Array.from(map.values());
  }
  function phaseOf(event) {
    return o().scope(event || o().currentEvent(), 'phaseUse');
  }
  function phaseRecords(player, event) {
    const phase = phaseOf(event);
    return clean(phaseEffects).filter(record => record.ownerId === id(player) && phase && record.phase === phase);
  }
  function putPhase(event, holder, life, extra) {
    phaseEffects.set(key(life), {
      workId: life.workId, instanceId: life.instanceId, ownerId: id(holder), phase: phaseOf(event), ...extra,
    });
    life.until('phaseUse');
    life.targets([holder]);
  }
  function unlimited(player, event) {
    return phaseRecords(player, event).some(record => record.unlimited);
  }
  function marked(target) {
    return !!target && clean(roundEffects).some(record => record.targetId === id(target) && live(target));
  }
  function protection(player) {
    return clean(jinglieEffects).find(record => record.ownerId === id(player));
  }
  function hasDiedBefore(player) {
    if (everDying.has(id(player))) return true;
    return !!game.getAllGlobalHistory?.('everything', event => event.name === 'dying' && event.player === player).length;
  }
  function givenMoves(event) {
    return o().moves(event).filter(move => move.given && move.giver && move.receiver && move.giver !== move.receiver && move.cards?.length && live(move.receiver));
  }
  function suit(card, player) { return get.suit(card, player) || 'none'; }
  function congjunCost(card, holder) {
    return !o().damageCard(card) && (!lib.filter.cardDiscardable || lib.filter.cardDiscardable(card, holder, '翰墨_从军诗'));
  }
  function neighbors(player) {
    const players = o().players();
    if (players.length < 2) return [];
    const n = players.indexOf(player);
    const candidates = [player.getPrevious?.() || players[(n + players.length - 1) % players.length], player.getNext?.() || players[(n + 1) % players.length]];
    return [...new Set(candidates)].filter(other => other !== player && live(other) && other.countCards('h') > 0);
  }
  const works = [
    {
      id: 'cao_duangexing', trigger: { player: 'damageEnd' },
      filter(event, holder) { return !event.unreal && event.num > 0 && o().players().some(player => player !== holder && player.countCards('hej') > 0); },
      async effect(event, holder) {
        for (const other of seatOrder().filter(player => player !== holder)) {
          if (!live(holder)) break;
          if (live(other) && other.countCards('hej') > 0) await holder.gainPlayerCard(other, 'hej', true);
        }
      },
    },
    {
      id: 'cao_guancanghai', active: true,
      async effect(event, holder, api, data, life) {
        // Take all snapshots together. Show-card reactions cannot change the set
        // of names/numbers which this activation observed.
        const snapshots = seatOrder().filter(player => player !== holder).map(player => ({ player, cards: player.getCards('h').slice() }));
        const cards = snapshots.flatMap(snapshot => snapshot.cards);
        const names = new Set(cards.map(card => o().name(card)));
        const numbers = new Set(cards.map(card => o().number(card)));
        putPhase(event, holder, life, { names, numbers, drawnNumbers: new Set() });
        for (const snapshot of snapshots) if (snapshot.cards.length) await snapshot.player.showCards(snapshot.cards, '观沧海');
      },
    },
    {
      id: 'cao_guisuishou', trigger: { global: 'phaseAfter' }, forced: true,
      filter(event, holder) { return live(holder) && holder.hp < holder.maxHp - holder.hp; },
      async effect(event, holder) {
        // Native phaseUse is the standalone phase event: no preparation, draw,
        // discard or turn-after event is inserted, and awaiting it holds the work.
        if (live(holder)) await holder.phaseUse();
      },
    },
    {
      id: 'cao_haolixing', trigger: { global: 'damageEnd' }, forced: true,
      filter(event) {
        if (event.unreal || !(event.num > 0)) return false;
        const players = o().players();
        const injured = players.filter(player => player.isDamaged()).length;
        return injured > players.length - injured;
      },
      async effect() {
        for (const player of seatOrder()) {
          if (!live(player)) continue;
          const cards = player.getCards('h');
          if (cards.length) await player.discard(cards[Math.floor(Math.random() * cards.length)]);
        }
      },
    },
    {
      id: 'cao_jinglie', active: true,
      filter(event, holder) { return !hasDiedBefore(holder) && !holder.isDying?.() && !(_status.dying || []).includes(holder); },
      async effect(event, holder, api, data, life) {
        jinglieEffects.set(key(life), { workId: life.workId, instanceId: life.instanceId, ownerId: id(holder) });
        life.targets([holder]);
        life.defer('jinglie_dying', { ownerId: id(holder) });
      },
      stages: {
        jinglie_dying: {
          trigger: { global: 'dyingBefore' },
          filter(event, holder, api, data) { return id(event.player) === data.ownerId; },
          async effect(event, holder, api, data, life) { jinglieEffects.delete(key(life)); },
        },
      },
    },
    {
      id: 'cao_xieluxing', trigger: { global: ['gainAfter', 'loseAsyncAfter'] },
      filter(event) { return givenMoves(event).length > 0; },
      async effect(event, holder) {
        const receivers = [...new Set(givenMoves(event).map(move => move.receiver))];
        for (const receiver of receivers) {
          if (!live(receiver)) continue;
          const cards = receiver.getCards('h').slice();
          // An empty hand still has zero suits, so showing no cards does not
          // suppress the subsequent damage.
          await receiver.showCards(cards, '薤露行');
          if (live(receiver) && new Set(cards.map(card => suit(card, receiver))).size < 4) await receiver.damage(1, holder);
        }
      },
    },
    {
      id: 'cao_duijiu', active: true,
      async effect() {
        for (const player of seatOrder()) {
          if (!live(player)) continue;
          const choice = await o().control(player, '对酒：选择一项', ['回复1点体力', '摸一张牌']);
          if (!live(player)) continue;
          if (choice === '回复1点体力') await player.recover(1);
          else await player.draw(1);
        }
      },
    },
    {
      id: 'can_dengloufu', active: true,
      async effect(event, holder, api, data, life) {
        const cards = [];
        for (const wanted of ['heart', 'spade', 'club', 'diamond']) {
          cards.push(...o().search(card => !cards.includes(card) && suit(card) === wanted, 1));
        }
        // The privilege starts even when the two source piles contain none of
        // the four suits. Gain reactions also see an already active privilege.
        putPhase(event, holder, life, { unlimited: true });
        if (cards.length) await holder.gain(cards, 'gain2');
      },
    },
    {
      id: 'can_qiaishi', trigger: { player: 'dying' },
      filter(event, holder) { return o().players().some(player => player !== holder && player.countCards('h') > 0); },
      async effect(event, holder) {
        for (const other of seatOrder().filter(player => player !== holder)) {
          if (!live(holder)) break;
          if (!live(other) || !other.countCards('h')) continue;
          const cards = await o().cards(other, '七哀诗：交给其一张手牌', 'h', null, [1, 1], true);
          if (cards?.length && live(holder) && live(other)) await other.give(cards, holder);
        }
      },
    },
    {
      id: 'can_congjunshi', active: true,
      filter(event, holder) { return holder.countCards('he', card => congjunCost(card, holder)) > 0; },
      async prepare(event, holder) {
        const cards = await o().cards(holder, '从军诗：弃置任意张非伤害牌', 'he', card => congjunCost(card, holder), [1, Infinity], false);
        if (!cards?.length || !cards.every(card => congjunCost(card, holder))) return false;
        return { ok: true, data: { cards } };
      },
      async effect(event, holder, api, data) {
        const cards = data.cards;
        await holder.discard(cards);
        if (!live(holder)) return;
        const found = o().search(card => o().damageCard(card), cards.length);
        if (found.length) await holder.gain(found, 'gain2');
      },
    },
    {
      id: 'can_siyoufu', active: true,
      filter(event, holder) { return o().players().some(player => player !== holder); },
      async prepare(event, holder) {
        const target = await o().target(holder, '思友赋：选择一名其他角色', player => player !== holder && live(player), false);
        return target ? { ok: true, data: { target } } : false;
      },
      async effect(event, holder, api, data, life) {
        life.targets([holder, data.target]);
        life.defer('siyou_use', { targetId: id(data.target) });
      },
      stages: {
        siyou_use: {
          trigger: { global: 'useCard' },
          filter(event, holder, api, data) { return id(event.player) === data.targetId; },
          async effect(event, holder) {
            if (!live(holder)) return;
            const name = o().name(event.card, event.player);
            const cards = o().search(card => o().name(card) === name, 1);
            if (cards.length) await holder.gain(cards, 'gain2');
          },
        },
      },
    },
    {
      id: 'can_yuliefu', trigger: { global: 'roundStart' },
      filter(event, holder) { return o().players().some(player => player !== holder); },
      async effect(event, holder, api, data, life) {
        const target = await o().target(holder, '羽猎赋：选择一名其他角色', player => player !== holder && live(player), true);
        if (!target) return;
        roundEffects.set(key(life), { workId: life.workId, instanceId: life.instanceId, targetId: id(target) });
        life.until('round');
        life.targets([target]);
      },
    },
    {
      id: 'can_gongyanshi', active: true,
      filter() { return o().players().some(player => player.countCards('h') && neighbors(player).length); },
      async effect() {
        const actors = seatOrder();
        for (const actor of actors) {
          if (!live(actor) || !actor.countCards('h')) continue;
          const adjacent = neighbors(actor);
          if (!adjacent.length) continue;
          const other = await o().target(actor, '公燕诗：与上家或下家交换一张手牌', player => adjacent.includes(player), true);
          if (!other || !live(actor) || !live(other) || !actor.countCards('h') || !other.countCards('h')) continue;
          const own = await o().cards(actor, '公燕诗：选择交给对方的一张手牌', 'h', null, [1, 1], true);
          const theirs = await o().cards(other, '公燕诗：选择交给对方的一张手牌', 'h', null, [1, 1], true);
          if (own?.length && theirs?.length && live(actor) && live(other)) await o().exchange(actor, other, own[0], theirs[0]);
        }
      },
    },
    {
      id: 'can_nanzhongxun', active: true,
      filter() { return o().players().some(player => player.countCards('h') !== player.hp); },
      async effect(event, holder) {
        const targets = seatOrder().filter(player => player.countCards('h') !== player.hp);
        for (const target of targets) if (live(target)) await target.damage(1, holder);
      },
    },
  ];
  const rules = {
    '翰墨_曹粲无限': {
      charlotte: true,
      mod: {
        targetInRange(card, player, target) { if (unlimited(player) || marked(target)) return true; },
        cardUsable(card, player) { if (unlimited(player)) return Infinity; },
        cardUsableTarget(card, player, target) { if (unlimited(player) || marked(target)) return true; },
      },
    },
    '翰墨_曹粲用牌': {
      charlotte: true, forced: true, popup: false, priority: 30,
      trigger: { global: 'useCard1' },
      filter(event) {
        return phaseRecords(event.player, event).some(record => record.unlimited || record.names?.has(o().name(event.card, event.player))) || (event.targets || []).some(marked);
      },
      async content(event, trigger) {
        const records = phaseRecords(trigger.player, trigger);
        if (records.some(record => record.unlimited) || (trigger.targets || []).some(marked)) o().noCount(trigger);
        if (records.some(record => record.names?.has(o().name(trigger.card, trigger.player)))) o().unrespondable(trigger);
      },
    },
    '翰墨_曹粲用牌后': {
      charlotte: true, forced: true, popup: false,
      trigger: { global: 'useCardAfter' },
      filter(event) {
        const number = o().number(event.card, event.player);
        return phaseRecords(event.player, event).some(record => record.numbers?.has(number) && !record.drawnNumbers.has(number));
      },
      async content(event, trigger) {
        const number = o().number(trigger.card, trigger.player);
        const records = phaseRecords(trigger.player, trigger).filter(record => record.numbers?.has(number) && !record.drawnNumbers.has(number));
        // Mark before drawing: nested card-use effects cannot draw for this
        // number twice in the same instance.
        for (const record of records) record.drawnNumbers.add(number);
        if (records.length && live(trigger.player)) await trigger.player.draw(records.length);
      },
    },
    '翰墨_曹粲濒死记录': {
      charlotte: true, forced: true, popup: false, firstDo: true, priority: 10000,
      trigger: { global: 'dyingBefore' },
      async content(event, trigger) {
        everDying.add(id(trigger.player));
        // Clear every protection before the engine asks for any rescue card.
        // This independent global rule has no caster/owned-skill prerequisite.
        for (const [k, record] of jinglieEffects) if (record.ownerId === id(trigger.player)) jinglieEffects.delete(k);
      },
    },
    '翰墨_精列防护': {
      charlotte: true, forced: true, popup: false, priority: 100,
      trigger: { global: ['damageBegin4', 'recoverBefore'] },
      filter(event) { return !!protection(event.player); },
      async content(event, trigger) { trigger.cancel(); },
    },
    '翰墨_精列失血': {
      charlotte: true, forced: true, popup: false,
      trigger: { global: 'phaseAfter' },
      filter() { return clean(jinglieEffects).some(record => live(o().player(record.ownerId))); },
      async content(event, trigger) {
        if (jinglieTurnEnds.has(trigger)) return;
        jinglieTurnEnds.add(trigger);
        for (const record of clean(jinglieEffects)) {
          const player = o().player(record.ownerId);
          if (valid(record) && live(player)) await player.loseHp(1);
        }
      },
    },
  };
  function reset() { phaseEffects.clear(); roundEffects.clear(); jinglieEffects.clear(); everDying.clear(); jinglieTurnEnds = new WeakSet(); }
  return { works, rules, reset };
})(context),(function createRongLin(context) {
  const { lib, game, get } = context;
  const ops = () => game.huazhang.ops;
  const movementTimings = ['gainAfter', 'loseAsyncAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter'];
  const discardTimings = ['loseAfter', 'loseAsyncAfter', 'cardsDiscardAfter'];
  const hand = player => player.getCards('h');
  const unique = cards => Array.from(new Set(cards));
  const live = player => ops().live(player);
  const legalOwnDiscard = (card, player, reason) => lib.filter.cardDiscardable(card, player, reason);
  const legalOtherDiscard = (card, actor, victim) => lib.filter.canBeDiscarded(card, actor, victim);

  function soleMaximum() {
    const players = ops().players();
    const maximum = Math.max(-1, ...players.map(player => player.countCards('h')));
    const leaders = players.filter(player => player.countCards('h') === maximum);
    return leaders.length === 1 ? leaders[0] : null;
  }

  function recipients(event, givenOnly) {
    const records = [];
    for (const move of ops().moves(event)) {
      if (!move.receiver || !live(move.receiver) || !move.cards?.length || givenOnly && !move.given) continue;
      const old = records.find(item => item.receiver === move.receiver);
      if (old) old.cards = unique(old.cards.concat(move.cards));
      else records.push({ receiver: move.receiver, cards: unique(move.cards) });
    }
    return records;
  }

  function otherGains(event) {
    const records = [];
    for (const move of ops().moves(event)) {
      if (!move.giver || !move.receiver || move.giver === move.receiver || !live(move.receiver) || !move.cards?.length) continue;
      const old = records.find(item => item.receiver === move.receiver);
      if (old) old.cards = unique(old.cards.concat(move.cards));
      else records.push({ receiver: move.receiver, cards: unique(move.cards) });
    }
    return records;
  }

  function allGains(event) {
    // Never reconstruct native child events here: an empty shared parse can
    // deliberately suppress a child of an already-counted aggregate movement.
    return recipients(event, false);
  }

  function ownDraw(event, receiver) {
    const draw = typeof event.getParent === 'function' ? event.getParent('phaseDraw') : event.phaseDraw;
    return !!draw && draw.player === receiver;
  }

  async function discardOther(actor, victim, maximum, position = 'he', filter = () => true, all = false) {
    if (!live(victim)) return [];
    const candidates = victim.getCards(position).filter(card => filter(card) && legalOtherDiscard(card, actor, victim));
    const count = Math.min(maximum, candidates.length);
    if (!count) return [];
    const params = {
      target: victim, position, forced: true, selectButton: [count, count],
      filterButton(button) { return candidates.includes(button.link); },
    };
    // Discarding every black handcard is deterministic and must keep actor as
    // discarder. Native directresult avoids revealing the remaining red hand.
    if (all || count === candidates.length) params.directresult = candidates.slice();
    const result = await actor.discardPlayerCard(params).forResult();
    return result?.cards || result?.links || [];
  }

  function directDiscards(event) {
    return ops().discardInfo(event).filter(item => item.discarder && item.victim && item.discarder !== item.victim && item.cards?.length && live(item.discarder));
  }

  function useRoot(event) {
    if (event.name === 'useCard') return event;
    const parent = typeof event.getParent === 'function' ? event.getParent('useCard') : null;
    return parent?.card ? parent : event;
  }

  async function losingCompare(holder, loser) {
    if (!live(loser)) return;
    const discardable = loser.getCards('he').filter(card => legalOwnDiscard(card, loser, '翰墨_与王朗书'));
    const choice = discardable.length ? await ops().control(loser, '与王朗书：弃置一张牌，或令持有者摸一张牌', ['弃置一张牌', '令持有者摸一张牌']) : '令持有者摸一张牌';
    if (choice === '弃置一张牌') {
      const cards = await ops().cards(loser, '与王朗书：弃置一张牌', 'he', card => legalOwnDiscard(card, loser, '翰墨_与王朗书'), [1, 1], true);
      if (cards?.length) await loser.discard(cards);
    } else if (live(holder)) await holder.draw(1);
  }

  const works = [
    {
      id: 'rong_jianmihengbiao', active: true,
      filter(event, holder) { return !!soleMaximum() && ops().players().some(player => player !== holder); },
      async prepare(event, holder) {
        const chooser = await ops().target(holder, '荐祢衡表：选择作出决定的其他角色', player => player !== holder, false);
        return chooser ? { ok: true, data: { chooser } } : false;
      },
      async effect(event, holder, api, data) {
        const actor = soleMaximum();
        if (!actor || !live(data.chooser)) return;
        let snapshot = hand(actor).slice();
        const choice = await ops().control(data.chooser, '荐祢衡表：令手牌唯一最多者使用任意张当前手牌，或翻面', ['使用手牌', '翻面']);
        if (choice === '翻面') { await actor.turnOver(); return; }
        while (live(actor) && snapshot.some(card => hand(actor).includes(card))) {
          const before = snapshot.filter(card => hand(actor).includes(card));
          const result = await ops().useHand(actor, { prompt: '荐祢衡表：可使用一张初始手牌，或停止', snapshot, noCount: true, noDistance: true });
          if (!result || result.bool === false) break;
          const spent = result.cards?.length ? result.cards : result.card ? [result.card] : [];
          snapshot = snapshot.filter(card => !spent.includes(card) && hand(actor).includes(card));
          // A failed use must not create a non-terminating prompt loop. A used
          // original card regained during its own resolution is now a new gain.
          if (!spent.length && before.every(card => hand(actor).includes(card))) break;
        }
      },
    },
    {
      id: 'rong_chaocaogong', trigger: { global: movementTimings },
      filter(event) { return recipients(event, true).some(item => item.receiver.countCards('h', card => get.color(card, item.receiver) === 'black') > 0); },
      async effect(event, holder) {
        for (const { receiver } of recipients(event, true)) await discardOther(holder, receiver, Infinity, 'h', card => get.color(card, receiver) === 'black', true);
      },
    },
    {
      id: 'rong_yuwanglangshu', active: true,
      filter(event, holder) { return holder.countCards('h') > 0 && ops().players().some(player => player !== holder && holder.canCompare(player)); },
      async prepare(event, holder) {
        const targets = await ops().targets(holder, '与王朗书：选择至多三名角色同时拼点', player => player !== holder && holder.canCompare(player), 1, 3, false);
        return targets?.length ? { ok: true, data: { targets } } : false;
      },
      async effect(event, holder, api, data) {
        const targets = data.targets.filter(player => live(player) && holder.canCompare(player));
        if (!targets.length) return;
        const compare = holder.chooseToCompare(targets);
        // The native multiple-compare event selects one owner card and every
        // opponent card together, then runs this callback once per result.
        compare.callback = async function (result) {
          if (result.winner !== holder) await losingCompare(holder, holder);
          if (result.winner !== result.target) await losingCompare(holder, result.target);
        };
        await compare;
      },
    },
    {
      id: 'rong_ruying', active: true,
      filter(event, holder) { return holder.countCards('h') > 0; },
      async effect(event, holder) {
        const participants = ops().players().filter(player => player.countCards('h') > 0);
        const result = await holder.chooseCardOL({ list: participants, position: 'h', selectCard: 1, forced: true, prompt: '汝颍优劣论：选择一张手牌同时展示' }).forResult();
        const selections = participants.map((player, index) => ({ player, card: result?.[index]?.cards?.[0] })).filter(item => item.card);
        const own = selections.find(item => item.player === holder);
        if (!own) return;
        // Colors are captured before any draw/discard can change card context.
        const ownColor = get.color(own.card, holder);
        for (const item of selections) item.color = get.color(item.card, item.player);
        for (const { player, card } of selections) await player.showCards([card], '汝颍优劣论');
        for (const { player, color } of selections) {
          if (!live(player)) continue;
          if (color === ownColor) await player.draw(1);
          else {
            const cards = await ops().cards(player, '汝颍优劣论：弃置一张手牌', 'h', card => legalOwnDiscard(card, player, '翰墨_汝颍优劣论'), [1, 1], true);
            if (cards?.length) await player.discard(cards);
          }
        }
      },
    },
    {
      id: 'rong_jinjiushu', trigger: { global: discardTimings },
      filter(event) { return directDiscards(event).length > 0; },
      async effect(event, holder) {
        for (const { discarder, victim, cards } of directDiscards(event)) {
          await discarder.damage(1, holder);
          const remaining = unique(cards).filter(card => get.position(card, true) === 'd');
          if (live(victim) && remaining.length) await victim.gain(remaining, 'gain2');
        }
      },
    },
    {
      id: 'rong_shengxiaozhang', trigger: { global: 'useCardToTargeted' },
      filter(event) { return !!event.target && live(event.target) && ops().damageCard(event.card) && ops().players().some(player => player !== event.target && player.countCards('he') > 0); },
      async effect(event, holder, api, data, life) {
        const target = event.target;
        const helper = await ops().target(holder, '盛孝章书：选择一名其他角色交给目标一张牌并为其提供响应', player => player !== target && player.countCards('he') > 0, true);
        if (!helper || !live(target)) return;
        const cards = await ops().cards(helper, '盛孝章书：交给目标一张牌', 'he', null, [1, 1], true);
        const selected = cards?.[0];
        if (!selected || !helper.getCards('he').includes(selected)) return;
        const transfer = helper.give([selected], target);
        await transfer;
        const actual = typeof transfer.getg === 'function' ? transfer.getg(target) : transfer.cards;
        if (transfer.cancelled || !actual?.includes(selected)) return;
        life.targets([target, helper]);
        await ops().delegate(event, target, helper, life);
      },
      stages: {
        sheng_proxy_after: {
          trigger: { global: 'useCardAfter' },
          filter(event, holder, api, data) { return data.useKey === ops().key(event); },
          async effect() {
            // The bridge removes its response record on this event. Returning
            // completes the shared lifecycle token and releases the mother.
          },
        },
      },
    },
    {
      id: 'rong_linzhongshi', trigger: { player: 'dying' },
      filter() { return ops().players().some(player => player.countCards('he') > 0); },
      async effect(event, holder) {
        const target = await ops().target(holder, '临终诗：选择一名角色弃置其至多两张牌', player => player.countCards('he') > 0, true);
        if (target) await discardOther(holder, target, 2);
      },
    },
    {
      id: 'lin_xiwen', active: true,
      filter(event, holder) { return holder.getCards('he').some(card => legalOwnDiscard(card, holder, '翰墨_檄文')); },
      async prepare(event, holder) {
        const cards = await ops().cards(holder, '檄文：弃置一张牌', 'he', card => legalOwnDiscard(card, holder, '翰墨_檄文'), [1, 1], false);
        return cards?.length === 1 ? { ok: true, data: { card: cards[0], length: ops().length(cards[0]) } } : false;
      },
      async effect(event, holder, api, data) {
        if (!holder.getCards('he').includes(data.card)) return;
        await holder.discard([data.card]);
        const revealed = get.cards(data.length);
        if (!revealed.length) return;
        await game.cardsGotoOrdering(revealed);
        await holder.showCards(revealed, '为袁绍檄豫州文');
        try {
          const choices = ['获得非伤害牌'];
          if (ops().players().some(player => player !== holder)) choices.unshift('使用伤害牌');
          const choice = await ops().control(holder, '檄文：使用全部合法伤害牌，或令一名角色获得全部非伤害牌', choices);
          if (choice === '使用伤害牌') {
            const target = await ops().target(holder, '檄文：选择伤害牌的固定其他目标', player => player !== holder, true);
            if (target) for (const card of revealed) {
              if (!live(holder) || !live(target)) break;
              if (get.position(card, true) === 'o' && ops().damageCard(card) && holder.canUse(card, target, false)) await ops().use(holder, card, [target], { noCount: true, noDistance: true });
            }
          } else {
            const target = await ops().target(holder, '檄文：令一名角色获得全部非伤害牌', () => true, true);
            const cards = revealed.filter(card => get.position(card, true) === 'o' && !ops().damageCard(card));
            if (target && cards.length) await target.gain(cards, 'gain2');
          }
        } finally {
          const remaining = revealed.filter(card => get.position(card, true) === 'o');
          if (remaining.length) await game.cardsGotoPile(remaining.slice().reverse(), 'insert');
        }
      },
    },
    {
      id: 'lin_yinma', trigger: { global: movementTimings },
      filter(event) { return otherGains(event).length > 0; },
      async effect(event, holder) {
        for (const { receiver, cards } of otherGains(event)) await discardOther(holder, receiver, cards.length);
      },
    },
    {
      id: 'lin_dadong', active: true,
      filter() { return ops().authorAvailable('caozhi').length > 0; },
      async effect(event, holder) { await ops().writeAuthor(holder, 'caozhi', { exempt: true }); },
    },
    {
      id: 'lin_wujunfu', trigger: { global: 'damageSource' }, consume: 'confirm',
      filter(event) { return live(event.source) && (event.num === undefined || event.num > 0); },
      async effect(event) {
        const source = event.source;
        if (live(source)) await ops().use(source, ops().virtual('wanjian'), null, { noCount: true });
      },
    },
    {
      id: 'lin_shenwufu', trigger: { global: 'useCardToPlayered' },
      filter(event) {
        const use = useRoot(event), target = use.targets?.[0];
        return ops().damageCard(use.card) && use.targets?.length === 1 && live(use.player) && live(target) && target.countCards('h') < use.player.countCards('h');
      },
      async effect(event, holder, api, data, life) {
        const use = useRoot(event), target = use.targets[0];
        ops().unrespondable(use);
        life.targets([use.player, target]);
        life.defer('cardComplete', { useKey: ops().key(use), caster: ops().id(use.player), target: ops().id(target) });
      },
      stages: {
        cardComplete: {
          trigger: { global: 'useCardAfter' },
          filter(event, holder, api, data) { return ops().key(event) === data.useKey; },
          async effect(event, holder, api, data) {
            const caster = ops().player(data.caster), target = ops().player(data.target);
            if (!live(caster) || !live(target) || !target.countCards('hej')) return;
            if (await ops().bool(caster, '神武赋：是否获得目标区域内的一张牌？')) await caster.gainPlayerCard({ target, position: 'hej', selectButton: 1, forced: true });
          },
        },
      },
    },
    {
      id: 'lin_jianhejin', trigger: { global: movementTimings },
      filter(event) { return allGains(event).some(item => !ownDraw(event, item.receiver)); },
      async effect(event) {
        for (const { receiver, cards } of allGains(event)) {
          if (ownDraw(event, receiver)) continue;
          const choice = await ops().control(receiver, '谏何进召外兵：弃置全部本次所得牌，未弃完整失去1点体力；或失去1点体力', ['弃置所得牌', '失去体力']);
          if (choice !== '弃置所得牌') { await receiver.loseHp(1); continue; }
          const remaining = cards.filter(card => receiver.getCards('he').includes(card) && legalOwnDiscard(card, receiver, '翰墨_谏何进召外兵'));
          let discarded = [];
          if (remaining.length) {
            const discard = receiver.discard(remaining);
            const result = await discard;
            const actual = discard.done?.cards2 || result?.cards || discard.cards;
            // Count the actual native loss, even if a later trigger retrieves
            // the discarded card before this discard event finishes.
            discarded = actual ? remaining.filter(card => actual.includes(card)) : remaining.filter(card => get.position(card, true) === 'd');
          }
          if (discarded.length !== cards.length && live(receiver)) await receiver.loseHp(1);
        }
      },
    },
    {
      id: 'lin_zhiyufu', active: true,
      filter() { return ops().players().length > 0; },
      async prepare(event, holder) {
        const target = await ops().target(holder, '止欲赋：选择一名角色回复全部已损体力、摸体力上限张牌并翻面', () => true, false);
        return target ? { ok: true, data: { target } } : false;
      },
      async effect(event, holder, api, data) {
        const target = data.target;
        if (!live(target)) return;
        const lost = Math.max(0, target.maxHp - target.hp);
        if (lost) await target.recover(lost);
        if (live(target)) await target.draw(Math.max(0, target.maxHp));
        if (live(target)) await target.turnOver();
      },
    },
  ];
  return { works, rules: {} };
})(context),(function createFactory(context) {
  const { lib, game, ui, get, _status } = context;
  const o = () => game.huazhang.ops;
  const result = async e => e?.forResult ? e.forResult() : await e;
  const parts = c => c ? [...new Set([c, ...(c.cards || [])])] : [];
  const physicals = e => [...new Set([...(e.cards || []), ...(e.card?.cards || []), ...(!e.card?.cards?.length && get.itemtype?.(e.card) === 'card' ? [e.card] : [])])];
  const ancestor = (e, name) => { const p = e?.getParent?.(name); return p?.name === name ? p : null; };
  const useOf = e => e?.name === 'useCard' ? e : ancestor(e, 'useCard');
  const canDiscard = (c, holder, victim) => !lib.filter.canBeDiscarded || lib.filter.canBeDiscarded(c, holder, victim, '翰墨_华章');
  const poemCards = new Map();
  const borrowed = new Map();
  let damageSerial = 0, damages = [], seenDamage = new WeakSet(), freeUses = new WeakSet();
  const tagged = (card, player) => parts(card).map(c => poemCards.get(c)).find(r => r?.owner === o().id(player));
  const blackHand = player => player.getCards('h').filter(c => get.color(c, player) === 'black');
  const legalWindow = (event, player, c) => typeof event?.filterCard === 'function' && event.filterCard(c, player, event);
  const canWork = (p, id) => !!game.huazhang.canUseWork(p, id);
  async function chooseOther(holder, title, filter = () => true) {
    const target = await o().target(holder, title, p => p !== holder && filter(p), false);
    return target ? { ok: true, data: { target } } : false;
  }
  function cancelNative(event) {
    event.result ||= {}; event.result.bool = false;
    const parent = event.getParent?.();
    if (parent) { parent.result ||= {}; parent.result.bool = false; }
    event.cancel?.();
  }
  function commitNative(event, player, workId) {
    const c = event.result?.card;
    if (!c || !game.huazhang.commitCard(player, workId, c)?.ok) cancelNative(event);
  }
  function forms(event, player, type, materials = []) {
    let list = typeof get.inpileVCardList === 'function' ? get.inpileVCardList() : (lib.inpile || []).map(n => [get.type(n), '', n]);
    return list.filter(info => get.type(info[2]) === type && legalWindow(event, player, o().virtual(info[2], info[3], materials)));
  }
  function activeUseWindow(info, holder) {
    const enable = Array.isArray(info.enable) ? info.enable : [info.enable];
    if (enable.includes('phaseUse')) return true;
    if (!enable.includes('chooseToUse')) return false;
    // Only inspect predicates that depend on the use window. Material-only predicates
    // do not classify a skill: an empty hand must not remove ordinary conversion skills.
    const dependsOnWindow = fn => /(?:\b_status\s*\.\s*(?:currentPhase|event)\b|\bget\s*\.\s*(?:event|player)\s*\(|\.\s*(?:dying|type|name|getParent|filterCard)\b)/.test(String(fn));
    const predicates = [['filter', info.filter], ['viewAsFilter', info.viewAsFilter]].filter(([, fn]) => typeof fn === 'function' && dependsOnWindow(fn));
    if (!predicates.length) return true;
    const oldEvent = _status.event, oldPhase = _status.currentPhase;
    try {
      // Try empty and provisioned hands so an incidental current cost does not
      // turn a normally proactive skill into a response-only classification.
      return [0, 1, 8].some(count => {
        const samples = (lib.inpile || ['sha']).flatMap(name => ['spade', 'heart', 'club', 'diamond'].map(suit => ({ name, suit, number: 7 })));
        const probe = new Proxy(holder, { get(target, key) {
          if (key === 'hasCards') return () => count > 0;
          if (key === 'countCards') return () => count;
          if (key === 'getCards') return () => samples.slice(0, count);
          if (key === 'isPhaseUsing') return () => true;
          const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
        } });
        const phase = { name: 'phaseUse', player: probe }, turn = { name: 'phase', player: probe };
        const window = { name: 'chooseToUse', type: 'phase', player: probe, dying: null,
          getParent: name => name === 'phase' ? turn : name === 'phaseUse' || name === undefined ? phase : {},
          filterCard: card => { const cardInfo = lib.card[card.name]; return !!cardInfo?.enable; }, getTrigger: () => null };
        _status.currentPhase = probe; _status.event = window;
        return predicates.every(([kind, fn]) => {
          try { const answer = kind === 'filter' ? fn.call(info, window, probe) : fn.call(info, probe); return kind === 'filter' ? !!answer : answer !== false; }
          catch (error) { return true; } // Unknown non-window dependencies are not grounds to discard an original active skill.
        });
      });
    } finally { _status.event = oldEvent; _status.currentPhase = oldPhase; }
  }
  function originalActiveSkills(holder) {
    const skills = new Set();
    const allowed = info => info && !info.juexingji && !info.hiddenSkill && !info.charlotte && !info.limited && !info.dutySkill && !info.ai?.notemp;
    for (const dead of game.dead || []) for (const name of [...new Set([dead.name, dead.name1, dead.name2].filter(Boolean))]) {
      const character = lib.character[name];
      const originals = character?.skills || character?.[3] || [];
      for (const skill of originals) {
        if (!allowed(lib.skill[skill])) continue;
        const expanded = game.expandSkills ? game.expandSkills([skill]) : [skill];
        if (expanded.some(id => { const info = lib.skill[id]; return allowed(info) && activeUseWindow(info, holder); })) skills.add(skill);
      }
    }
    return [...skills];
  }
  async function removeBorrow(key) {
    const r = borrowed.get(key); if (!r) return;
    borrowed.delete(key); const player = o().player(r.owner);
    if (player) await result(player.removeAdditionalSkills(key));
  }
  const works = [
    {
      id: 'xg_shisi', active: true,
      filter: (event, holder) => o().players().some(p => p !== holder),
      prepare: (event, holder) => chooseOther(holder, '室思：选择复制下一次摸牌的角色'),
      async effect(event, holder, api, data, life) { life.targets([data.target]); life.defer('独立摸牌', { target: o().id(data.target) }); },
      stages: { '独立摸牌': {
        trigger: { global: 'drawAfter' },
        filter(event, holder, api, data) { return o().id(event.player) === data.target && !ancestor(event, 'draw') && !ancestor(event, 'zishu_draw'); },
        async effect(event, holder) { const count = event.result?.cards?.length || 0; if (count && o().live(holder)) await holder.draw(count); },
      } },
    },
    { id: 'xg_daliuzhenshi', active: true, filter: () => o().authorAvailable('liuzhen').length > 0, async effect(event, holder) { await o().writeAuthor(holder, 'liuzhen', { exempt: true }); } },
    {
      id: 'xg_xudao', active: true,
      prepare: async (event, holder) => { const target = await o().target(holder, '虚道：选择下一张使用牌无效的角色', () => true, false); return target ? { ok: true, data: { target } } : false; },
      async effect(event, holder, api, data, life) { life.targets([data.target]); life.defer('下一次使用', { target: o().id(data.target) }); },
      stages: { '下一次使用': {
        trigger: { global: 'useCard0' },
        filter: (event, holder, api, data) => o().id(event.player) === data.target,
        async effect(event) { event.all_excluded = true; },
      } },
    },
    {
      id: 'xg_zhixue', trigger: { player: 'useCardToPlayered' },
      filter(event, holder) {
        if (!event.isFirstTarget) return false;
        const use = useOf(event); if (!use) return false;
        const turn = o().scope(use, 'phase');
        const history = o().used(holder).filter(e => o().scope(e, 'phase') === turn && e.targets?.length > 0);
        return history[0] === use;
      },
      async effect(event, holder) { const count = (useOf(event)?.targets || event.targets || []).length; if (count) await holder.draw(count); },
    },
    {
      id: 'xg_yuanshanfu', active: true,
      filter: (event, holder) => o().players().some(p => p !== holder && p.countCards('he')),
      prepare: (event, holder) => chooseOther(holder, '圆扇赋：暂时移走一名其他角色的所有手牌和装备', p => p.countCards('he') > 0),
      async effect(event, holder, api, data, life) {
        const target = data.target, cards = target.getCards('he'); if (!cards.length || !o().live(target)) return;
        const tag = '翰墨_圆扇_' + life.instanceId;
        const next = target.addToExpansion('giveAuto', cards, target); next.gaintag.add(tag); await next;
        life.targets([target]);
        life.defer('归还圆扇', { target: o().id(target), tag, turn: o().key(o().scope(event, 'phase')) });
        life.onAbort?.(() => { if (o().live(target)) { const remain = target.getExpansions(tag); if (remain.length) target.gain(remain, 'draw'); } });
      },
      stages: { '归还圆扇': {
        trigger: { global: 'phaseAfter' },
        filter: (event, holder, api, data) => !data.turn || o().key(event) === data.turn,
        async effect(event, holder, api, data) { const target = o().player(data.target); if (o().live(target)) { const cards = target.getExpansions(data.tag); if (cards.length) await target.gain(cards, 'draw'); } },
      } },
    },
    {
      id: 'xg_hebian', active: true,
      filter: (event, holder) => o().players().some(p => p !== holder && holder.canCompare(p)),
      prepare: (event, holder) => chooseOther(holder, '核辩：与一名其他角色拼点', p => holder.canCompare(p)),
      async effect(event, holder, api, data, life) {
        if (!o().live(data.target) || !holder.canCompare(data.target)) return;
        const r = await holder.chooseToCompare(data.target).forResult();
        if (typeof r?.num1 !== 'number' || typeof r?.num2 !== 'number' || r.num1 === r.num2) return;
        const winner = r.num1 > r.num2 ? holder : data.target, loser = winner === holder ? data.target : holder;
        life.targets([loser]); life.defer('重选目标', { winner: o().id(winner), loser: o().id(loser) });
      },
      stages: { '重选目标': {
        trigger: { global: 'useCard2' },
        filter: (event, holder, api, data) => o().id(event.player) === data.loser,
        async effect(event, holder, api, data) {
          const winner = o().player(data.winner), source = event.player, targets = event.targets || [], info = get.info(event.card, false);
          if (!o().live(winner) || !targets.length || info.toself) return;
          let select = info.selectTarget;
          if (typeof select === 'function') select = select(event.card, source);
          if (select === -1 || Array.isArray(select) && select.includes(-1)) return;
          // Target count and the already-paid use count remain unchanged. Recheck only native target legality and distance.
          const legal = target => o().live(target) && (!lib.filter.targetEnabled2 || lib.filter.targetEnabled2(event.card, source, target)) && (!lib.filter.targetInRange || lib.filter.targetInRange(event.card, source, target));
          const r = await winner.chooseTarget({ prompt: '核辩：为此牌重新选择合法目标', forced: true, selectTarget: [targets.length, targets.length], filterTarget: (card, player, target) => legal(target) }).forResult();
          if (r?.bool && r.targets?.length === targets.length && new Set(r.targets).size === targets.length && r.targets.every(legal)) event.targets.splice(0, event.targets.length, ...r.targets);
        },
      } },
    },
    {
      id: 'xg_guiyan', active: true,
      async effect(event, holder) {
        const judged = await holder.judge().forResult();
        const color = judged?.color || get.color(judged?.card), number = typeof judged?.number === 'number' ? judged.number : o().number(judged?.card);
        const target = await o().target(holder, '贵验：选择展示同色手牌的角色', () => true, true); if (!target) return;
        const cards = ['red', 'black'].includes(color) ? target.getCards('h').filter(c => get.color(c, target) === color) : [];
        if (cards.length) await target.showCards(cards, '贵验');
        if (Number.isInteger(number) && number >= 1 && number <= 13 && cards.length < number && o().live(target)) await target.damage(1, holder);
      },
    },
    {
      id: 'ry_weicaogong', active: true,
      filter: () => o().players().length > 1 && o().players().some(p => p.countCards('h')),
      async prepare(event, holder) {
        const actor = await o().target(holder, '为曹公作书与孙权：选择可以使用实体手牌的角色', p => p.countCards('h') > 0, false); if (!actor) return false;
        const target = await o().target(holder, '为曹公作书与孙权：选择基础目标', p => p !== actor, false);
        return target ? { ok: true, data: { actor, target } } : false;
      },
      async effect(event, holder, api, data) {
        if (!o().live(data.actor) || !o().live(data.target)) return;
        const before = damageSerial;
        const r = await o().useHand(data.actor, { prompt: '为曹公作书与孙权：可对指定角色使用一张实体手牌', snapshot: data.actor.getCards('h').slice(), target: data.target });
        if (r?.bool && r.card && damages.some(d => d.serial > before && parts(r.card).some(c => d.cards.includes(c)))) {
          if (o().live(holder)) await holder.draw(2);
          if (o().live(data.actor)) await data.actor.draw(2);
        }
      },
    },
    {
      id: 'ry_yongshishi', trigger: { global: 'damageEnd' },
      filter: event => event.num > 0 && event.card && o().name(event.card) === 'sha',
      async effect(event, holder) {
        const candidates = o().players().filter(p => p.getCards('hej').some(c => canDiscard(c, holder, p)));
        if (candidates.length) {
          const target = await o().target(holder, '咏史诗：弃置一名角色区域内的一张牌', p => candidates.includes(p), true);
          if (target) await holder.discardPlayerCard(target, 'hej', true);
        }
        const cards = physicals(event).filter(c => ['o', 'd'].includes(get.position(c, true)));
        if (!cards.length || !o().live(holder)) return;
        await holder.gain(cards, 'gain2');
        for (const card of cards) if (get.owner(card) === holder) { poemCards.set(card, { owner: o().id(holder) }); card.addGaintag?.('翰墨_咏史'); }
      },
    },
    {
      id: 'ry_qinge', cardUse: true, trigger: { player: 'loseAfter' },
      filter(event, holder) {
        const parent = event.getParent?.();
        return parent?.name === 'useCard' && event.hs?.length === 1 && event.cards?.length === 1 && get.color(event.hs[0], holder) === 'red' && !holder.getCards('h').some(c => get.color(c, holder) === 'red');
      },
      async effect(event, holder) { await holder.draw(1); },
    },
    { id: 'ry_yinshi', cardUse: true },
    {
      id: 'ry_diaoboyiwen', active: true,
      filter: (event, holder) => originalActiveSkills(holder).length > 0,
      async effect(event, holder, api, data, life) {
        const skills = originalActiveSkills(holder); if (!skills.length) return;
        const selected = await o().control(holder, '吊伯夷文：选择一项阵亡武将原始主动技能', skills);
        const skill = skills.includes(selected) ? selected : skills[0], key = '翰墨_吊伯夷_' + life.instanceId;
        borrowed.set(key, { owner: o().id(holder), instance: life.instanceId });
        await result(holder.addAdditionalSkills(key, [skill]));
        life.onAbort?.(() => { const r = borrowed.get(key); if (r) { borrowed.delete(key); holder.removeAdditionalSkills(key); } });
        life.targets([holder]); life.defer('归还借技', { key, phase: o().key(o().scope(event, 'phaseUse')) });
      },
      stages: { '归还借技': {
        trigger: { global: ['phaseUseAfter', 'phaseAfter'] },
        filter(event, holder, api, data) { return event.name === 'phase' || !data.phase || o().key(event) === data.phase; },
        async effect(event, holder, api, data) { await removeBorrow(data.key); },
      } },
    },
    {
      id: 'ry_xietaizujian', trigger: { player: 'gainAfter', global: 'loseAsyncAfter' },
      filter: (event, holder) => o().authorAvailable('caocao').length > 0 && o().moves(event).some(m => m.receiver === holder && m.giver && m.giver !== holder && m.cards.length > 0),
      async effect(event, holder) { await o().writeAuthor(holder, 'caocao', { exempt: true }); },
    },
    {
      id: 'ry_kuyu', active: true,
      async effect() {
        const players = o().players(); if (players.sortBySeat) players.sortBySeat();
        for (const player of players) {
          if (!o().live(player)) continue;
          const next = player.judge(c => get.suit(c) === 'spade' && o().number(c) >= 2 && o().number(c) <= 9 ? -5 : 1);
          next.set?.('judge2', r => r.bool === false); next.set?.('judgeName', 'shandian');
          const r = await result(next); if (r?.bool === false && o().live(player)) await player.damage(3, 'thunder', 'nosource');
        }
      },
    },
  ];
  const rules = {
    '翰墨_阮书伤害': {
      trigger: { global: 'damageEnd' }, forced: true, silent: true, popup: false, priority: 1000,
      filter: e => e.num > 0 && !!useOf(e),
      async content(event, trigger) {
        if (!trigger || seenDamage.has(trigger) || !(trigger.num > 0)) return;
        const use = useOf(trigger); if (!use) return;
        seenDamage.add(trigger); damages.push({ serial: ++damageSerial, cards: parts(use.card) });
      },
    },
    '翰墨_咏史遗墨': {
      trigger: { global: ['useCard0', 'loseAfter', 'gainAfter', 'loseAsyncAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter'] }, forced: true, silent: true, popup: false, priority: 1000,
      filter: event => poemCards.size > 0 || freeUses.has(event),
      mod: {
        cardUsable(card, player) { if (tagged(card, player)) return Infinity; },
        targetInRange(card, player) { if (tagged(card, player)) return true; },
      },
      async content(event, trigger) {
        const use = useOf(trigger);
        if (trigger?.name === 'useCard' && (tagged(trigger.card, trigger.player) || freeUses.has(trigger))) o().noCount(trigger);
        for (const [card, r] of poemCards) {
          const owner = o().player(r.owner); if (get.owner(card) === owner) continue;
          if (use?.player === owner && parts(use.card).includes(card)) freeUses.add(use);
          // Internal movement to the same owner's equipment/judgment is still that owner's card.
          const parent = trigger?.relatedEvent || trigger?.getParent?.();
          if (parent?.player === owner && ['equip', 'addJudge', 'addToExpansion'].includes(parent.name)) continue;
          if (use?.player === owner && parts(use.card).includes(card) && use.targets?.includes(owner) && ['equip', 'delay'].includes(get.type(use.card, null, false))) continue;
          poemCards.delete(card); card.removeGaintag?.('翰墨_咏史');
        }
      },
    },
    '翰墨_琴歌作锦囊': {
      enable: 'chooseToUse',
      filter(event, player) {
        if (!canWork(player, 'ry_qinge')) return false;
        const cards = blackHand(player); return cards.length === 1 && game.checkMod?.(cards[0], player, 'unchanged', 'cardEnabled2', player) !== false && forms(event, player, 'trick', cards).length > 0;
      },
      hiddenCard(player, name) { return canWork(player, 'ry_qinge') && blackHand(player).length === 1 && lib.inpile.includes(name) && get.type(name) === 'trick'; },
      chooseButton: {
        dialog(event, player) { return ui.create.dialog('琴歌', [forms(event, player, 'trick', blackHand(player)), 'vcard'], 'hidden'); },
        check: () => 1,
        backup(links, player) {
          const material = blackHand(player)[0];
          return { selectCard: 1, position: 'h', filterCard: (card, player) => card === material && blackHand(player).length === 1, viewAs: { name: links[0][2] },
            async precontent(event, trigger, player) {
              if (blackHand(player).length !== 1 || blackHand(player)[0] !== material || !parts(event.result?.card).includes(material)) { cancelNative(event); return; }
              commitNative(event, player, 'ry_qinge');
            } };
        },
        prompt: links => '将唯一的黑色手牌当作' + get.translation(links[0][2]) + '使用',
      }, ai: { order: 8, result: { player: 1 } },
    },
    '翰墨_隐士作基本': {
      enable: 'chooseToUse',
      filter: (event, player) => event.type !== 'wuxie' && canWork(player, 'ry_yinshi') && forms(event, player, 'basic').length > 0,
      hiddenCard: (player, name) => canWork(player, 'ry_yinshi') && lib.inpile.includes(name) && get.type(name) === 'basic',
      chooseButton: {
        dialog(event, player) { return ui.create.dialog('隐士', [forms(event, player, 'basic'), 'vcard'], 'hidden'); }, check: () => 1,
        backup(links) { return { selectCard: -1, filterCard: () => false, viewAs: { name: links[0][2], nature: links[0][3], isCard: true }, async precontent(event, trigger, player) { commitNative(event, player, 'ry_yinshi'); } }; },
        prompt: links => '视为使用' + get.translation(links[0][3] || '') + get.translation(links[0][2]),
      }, ai: { order: 8, respondSha: true, respondShan: true, skillTagFilter: (p, tag, arg) => arg !== 'respond', result: { player: 1 } },
    },
  };
  function reset() {
    for (const [c] of poemCards) c.removeGaintag?.('翰墨_咏史'); poemCards.clear();
    for (const key of [...borrowed.keys()]) { const r = borrowed.get(key), p = o().player(r.owner); borrowed.delete(key); p?.removeAdditionalSkills(key); }
    damageSerial = 0; damages = []; seenDamage = new WeakSet(); freeUses = new WeakSet();
  }
  return { works, rules, reset };
})(context),(function createYingLiuWorks(context) {
  const { lib, game, ui, get, _status } = context;
  const o = () => game.huazhang.ops;
  const constituents = card => card ? [card].concat(card.cards || []) : [];
  const visitors = new Map(), growth = new Map(), river = new Map(), melonCards = new Map();
  let recent = [], currentRound = new Set(), previousRound = new Set();
  let observed = new WeakMap(), melonUses = new WeakMap();
  const id = player => o().id(player);
  const live = player => o().live(player);
  const valid = (workId, instance) => o().isInstance(workId, instance);
  const type = card => get.type2(card);
  const phaseKey = (event, kind) => o().key(o().scope(event, kind));
  const discarded = (card, holder) => !lib.filter.cardDiscardable || lib.filter.cardDiscardable(card, holder, '翰墨_华章');
  const moves = event => o().moves(event).filter(move => move.giver && move.receiver && move.giver !== move.receiver && move.cards?.length);
  async function result(event) { return typeof event?.forResult === 'function' ? await event.forResult() : await event; }
  async function draw(player, number) {
    if (!number || !live(player)) return [];
    const next = player.draw(number), r = await result(next);
    return r?.cards || next.result?.cards || [];
  }
  function once(event, timing) {
    if (!event || typeof event !== 'object') return false;
    let seen = observed.get(event);
    if (!seen) { seen = new Set(); observed.set(event, seen); }
    if (seen.has(timing)) return false;
    seen.add(timing); return true;
  }
  function rememberTargets(player, targets) {
    if (!player) return;
    for (const target of targets || []) {
      const key = id(target);
      if (!visitors.has(key)) visitors.set(key, new Set());
      visitors.get(key).add(id(player));
    }
  }
  function useEvent(event) {
    const parent = event.getParent?.('useCard');
    return parent?.name === 'useCard' || parent?.card === event.card ? parent : event;
  }
  function inferTiming(event) {
    if (event.target) return 'useCardToPlayered';
    if (event.name === 'roundStart' || event.name === 'roundEnd') return event.name;
    if (event.name === 'phase') return 'phaseAfter';
    if (event.name === 'gain') return 'gainAfter';
    if (event.name === 'lose') return 'loseAfter';
    return 'useCard1';
  }
  function keepInternal(event, card, owner) {
    if (get.owner(card) === owner) return true;
    const parent = event.relatedEvent || event.getParent?.();
    if (parent?.player === owner && ['equip', 'addJudge', 'addToExpansion'].includes(parent.name)) return true;
    const use = event.getParent?.('useCard');
    return use?.player === owner && constituents(use.card).includes(card) && use.name === 'useCard';
  }
  function cleanMelons(event) {
    for (const [card, record] of melonCards) {
      const owner = o().player(record.owner);
      if (!owner || !keepInternal(event, card, owner)) melonCards.delete(card);
    }
  }
  function returnTop(cards) {
    for (let i = cards.length - 1; i >= 0; i--) ui.cardPile.insertBefore(cards[i], ui.cardPile.firstChild);
    game.updateRoundNumber?.();
  }
  function predictionChoices() {
    return Array.from(new Set((lib.inpile || []).map(name => type(name)).filter(Boolean)));
  }
  async function chooseValue(holder, prompt, values) {
    const labels = values.map(value => get.translation(value));
    const chosen = await o().control(holder, prompt, labels), index = labels.indexOf(chosen);
    return index >= 0 ? values[index] : values.includes(chosen) ? chosen : values[0];
  }
  function availableTricks(event, player) {
    return (lib.inpile || []).filter(name => get.type(name, null, false) === 'trick' && !previousRound.has(name)
      && (!event.filterCard || event.filterCard(o().virtual(name), player, event)));
  }
  function canMinji(event, player) {
    return event?.type === 'phase' && (!_status.currentPhase || _status.currentPhase === player)
      && game.huazhang.canUseWork(player, 'yy_minjifu') && player.countCards('h') > 0 && availableTricks(event, player).length > 0;
  }
  async function write(holder, author) { await o().writeAuthor(holder, author, { exempt: true }); }
  function transferWork(workId, author, incoming) {
    return { id: workId, trigger: { global: ['gainAfter', 'loseAsyncAfter'] },
      filter(event, holder) { return o().authorAvailable(author).length > 0 && moves(event).some(move => incoming ? move.receiver === holder : move.giver === holder); },
      async effect(event, holder) { await write(holder, author); },
    };
  }

  const works = [
    {
      id: 'yy_doujishi', active: true,
      filter() { return o().players().filter(player => player.countCards('h')).length >= 2; },
      async prepare(event, holder) {
        const targets = await o().targets(holder, '斗鸡诗：选择至少两名有手牌的角色同时拼点', player => player.countCards('h') > 0, 2, Infinity, false);
        return targets?.length >= 2 ? { ok: true, data: { targets } } : false;
      },
      async effect(event, holder, api, data) {
        const participants = data.targets.filter(player => live(player) && player.countCards('h'));
        if (participants.length < 2) return;
        const first = participants[0], others = participants.slice(1);
        const next = first.chooseToCompare(others).setContent('chooseToCompareMeanwhile');
        // Meanwhile compares each participant once; final source points live on the event.
        // result.num1 contains earlier snapshots and is not authoritative after modification.
        const comparison = await result(next);
        if (comparison?.cancelled || !Number.isFinite(next.num1) || !comparison?.num2?.length) return;
        const targets = next.targets || others, scores = [[first, next.num1]];
        for (let i = 0; i < targets.length; i++) if (Number.isFinite(comparison.num2[i])) scores.push([targets[i], comparison.num2[i]]);
        const highest = Math.max(...scores.map(pair => pair[1])), winners = scores.filter(pair => pair[1] === highest);
        if (winners.length === 1) await draw(winners[0][0], scores.length);
      },
    },
    transferWork('yy_shiwuguan', 'caopi', true),
    {
      id: 'yy_bieshi', trigger: { player: ['phaseBegin', 'phaseEnd'] },
      async effect(event, holder) { await draw(holder, visitors.get(id(holder))?.size || 0); },
    },
    {
      id: 'yy_zhuanzhengfu', trigger: { player: 'phaseUseBegin' },
      async effect(event, holder, api, data, life) {
        const mode = await o().control(holder, '撰征赋：统一选择本次预测维度', ['颜色预测', '类型预测']);
        const dimension = mode === '颜色预测' || mode === 'color' ? 'color' : 'type2';
        const values = dimension === 'color' ? ['red', 'black'] : predictionChoices();
        const predictions = [];
        for (let i = 0; i < 3; i++) predictions.push(await chooseValue(holder, '撰征赋：预测本阶段第' + (i + 1) + '张牌', values));
        if (!life.valid()) return;
        life.defer('核验撰征', { phase: phaseKey(event, 'phaseUse'), dimension: dimension === 'color' ? 'color' : 'type2', predictions, index: 0, hits: 0, seen: [] });
      },
      stages: {
        '核验撰征': {
          trigger: { global: ['useCard1', 'phaseUseAfter'] },
          filter(event, holder, api, data, timing) {
            if (timing === 'phaseUseAfter' || event.name === 'phaseUse') return o().key(event) === data.phase || phaseKey(event, 'phaseUse') === data.phase;
            return phaseKey(event, 'phaseUse') === data.phase && !data.seen.includes(o().key(event));
          },
          async effect(event, holder, api, data, life, timing) {
            if (!life.valid() || timing === 'phaseUseAfter' || event.name === 'phaseUse') return;
            const actual = data.dimension === 'color' ? get.color(event.card, event.player) : type(event.card);
            const hit = actual === data.predictions[data.index] && (data.dimension !== 'color' || ['red', 'black'].includes(actual));
            const hits = data.hits + Number(hit), index = data.index + 1;
            if (hit) await draw(holder, 1);
            if (!life.valid()) return;
            if (index < 3) life.defer('核验撰征', { ...data, index, hits, seen: data.seen.concat(o().key(event)) });
            else if (hits === 3 && live(holder)) {
              const chosen = await chooseValue(holder, '撰征赋：获得两张所选类型的牌', predictionChoices());
              const cards = o().search(card => type(card) === chosen, 2);
              if (cards.length) await holder.gain(cards, 'gain2');
            }
          },
        },
      },
    },
    {
      id: 'yy_linghefu', trigger: { global: 'useCard1' },
      filter(event) { return recent.length === 3 && recent.every(record => record.player === id(event.player)) && recent[2].key === o().key(event); },
      async effect(event, holder, api, data, life) {
        river.set(id(event.player), { instance: life.instanceId, turn: phaseKey(event, 'phase'), third: o().key(event) });
        life.targets([holder, event.player]); life.until('turn');
      },
    },
    { id: 'yy_minjifu', cardUse: true },
    {
      id: 'yy_chishefu', active: true,
      filter(event, holder) { return o().players().some(player => player !== holder && holder.inRange(player)); },
      async prepare(event, holder) {
        const target = await o().target(holder, '驰射赋：选择攻击范围内的一名其他角色', player => player !== holder && holder.inRange(player), false);
        return target ? { ok: true, data: { target, count: Math.max(0, holder.getAttackRange()) } } : false;
      },
      async effect(event, holder, api, data, life) {
        for (let i = 0; i < data.count && live(holder) && live(data.target) && life.valid(); i++) {
          const snapshot = holder.getCards('h').filter(card => o().name(card, holder) === 'sha');
          if (!snapshot.length) break;
          const used = await o().useHand(holder, { prompt: '驰射赋：可使用一张手牌杀，或停止', snapshot, target: data.target, noCount: true, noDistance: true });
          if (!used?.bool) break;
        }
      },
    },
    {
      id: 'lz_zengcongdi', active: true,
      filter(event, holder) { return o().players().some(player => player !== holder && (growth.get(id(player)) || 0) < 3); },
      async prepare(event, holder) {
        const target = await o().target(holder, '赠从弟：选择下次受伤后增加体力上限的其他角色', player => player !== holder && (growth.get(id(player)) || 0) < 3, false);
        return target ? { ok: true, data: { target } } : false;
      },
      async effect(event, holder, api, data, life) {
        const target = data?.target || await o().target(holder, '赠从弟：选择一名其他角色', player => player !== holder && (growth.get(id(player)) || 0) < 3, true);
        if (!target || (growth.get(id(target)) || 0) >= 3) return;
        life.targets([holder, target]); life.defer('从弟受伤', { target: id(target) });
      },
      stages: {
        '从弟受伤': {
          trigger: { global: 'damageEnd' },
          filter(event, holder, api, data) { return id(event.player) === data.target && event.num > 0; },
          async effect(event, holder, api, data, life) {
            if (!life.valid() || !live(event.player) || (growth.get(data.target) || 0) >= 3) return;
            growth.set(data.target, (growth.get(data.target) || 0) + 1);
            await event.player.gainMaxHp(1);
          },
        },
      },
    },
    transferWork('lz_zengxugan', 'xugan', false),
    {
      id: 'lz_sheyuanshi', trigger: { player: 'useCardToPlayered' },
      filter(event, holder) {
        const use = useEvent(event);
        return o().name(event.card, holder) === 'sha' && !!event.isFirstTarget && (use.targets || []).some(target => live(target) && holder.inRange(target));
      },
      async effect(event, holder, api, data, life) {
        const use = useEvent(event);
        use.effectCount = (typeof use.effectCount === 'number' ? use.effectCount : 1) + 1;
        life.targets([holder, ...(use.targets || [])]); life.defer('射鸢毕用', { use: o().key(use) });
      },
      stages: {
        '射鸢毕用': { trigger: { global: 'useCardAfter' }, filter(event, holder, api, data) { return o().key(event) === data.use; }, async effect() {} },
      },
    },
    transferWork('lz_zengwuguan', 'caopi', false),
    {
      id: 'lz_suizhifu', active: true,
      async effect(event, holder, api, data, life) {
        life.targets([holder]);
        const judged = await result(holder.judge(() => 0));
        if (judged?.card && live(holder) && life.valid()) life.defer('遂志同类', { type: type(judged.card) });
      },
      stages: {
        '遂志同类': {
          trigger: { global: 'useCard1' },
          filter(event, holder, api, data) { return event.player === holder && type(event.card) === data.type; },
          async effect(event, holder, api, data, life) { if (life.valid() && live(holder)) { await holder.recover(1); if (life.valid() && live(holder)) await draw(holder, 2); } },
        },
      },
    },
    {
      id: 'lz_guafu', trigger: { global: 'roundStart' },
      async effect(event, holder, api, data, life) {
        life.targets([holder]);
        const drawn = await draw(holder, 1);
        if (!drawn.length || !live(holder) || !life.valid()) return;
        let sample = drawn[0];
        if (drawn.length > 1) {
          const chosen = await result(holder.chooseCardButton(drawn, '瓜赋：选择一张本次摸牌作为样本', 1, true));
          sample = drawn.includes(chosen?.links?.[0]) ? chosen.links[0] : drawn[0];
        }
        if (!live(holder) || !life.valid()) return;
        life.defer('瓜赋弃牌', { x: o().length(sample), count: 0, seen: [] });
      },
      stages: {
        '瓜赋弃牌': {
          trigger: { global: ['phaseBegin', 'roundEnd'] },
          filter(event, holder, api, data, timing) { return timing === 'roundEnd' || event.name === 'roundEnd' || !data.seen.includes(o().key(event)); },
          async effect(event, holder, api, data, life, timing) {
            if (!live(holder) || !life.valid() || timing === 'roundEnd' || event.name === 'roundEnd') return;
            const selected = await o().cards(holder, '瓜赋：可弃置任意张手牌或装备牌', 'he', card => discarded(card, holder), [0, Infinity], true) || [];
            if (!live(holder) || !life.valid()) return;
            const legal = selected.filter(card => holder.getCards('he').includes(card) && discarded(card, holder));
            let actual = [];
            if (legal.length) {
              const loss = holder.discard(legal), discardedResult = await result(loss);
              const moved = loss.done?.cards2 || loss.getl?.(holder)?.cards2 || discardedResult?.cards || loss.cards;
              // A later discard trigger may already have returned these cards to the holder.
              actual = moved ? legal.filter(card => moved.includes(card)) : legal.filter(card => get.position(card, true) === 'd');
            }
            const count = data.count + actual.length;
            if (!live(holder) || !life.valid()) return;
            if (count > data.x) {
              const reward = await draw(holder, data.x);
              if (!live(holder) || !life.valid()) return;
              for (const card of reward) if (get.owner(card) === holder) melonCards.set(card, { owner: id(holder) });
            } else life.defer('瓜赋弃牌', { ...data, count, seen: data.seen.concat(o().key(event)) });
          },
        },
      },
    },
    {
      id: 'lz_qinglvfu', active: true,
      async effect(event, holder, api, data, life) {
        const hand = holder.getCards('h').slice(), top = get.cards(hand.length), initialTop = top.slice();
        let outgoing = [], incoming = [];
        if (hand.length && top.length) {
          await result(game.cardsGotoOrdering(top));
          const answer = await result(holder.chooseToMove('清虑赋：等量交换手牌与牌堆顶的牌，可交换零张', true)
            .set('list', [['牌堆顶（仅你可见）', top], ['你的手牌', hand]])
            .set('filterMove', (from, to) => typeof to !== 'number')
            .set('filterOk', moved => moved[0].length === top.length && moved[1].length === hand.length)
            .set('processAI', list => list.map(row => row[1].slice())));
          if (answer?.bool && answer.moved?.[0]?.length === top.length && answer.moved?.[1]?.length === hand.length) {
            outgoing = answer.moved[0].filter(card => hand.includes(card));
            incoming = answer.moved[1].filter(card => top.includes(card));
            if (outgoing.length !== incoming.length || !outgoing.every(card => holder.getCards('h').includes(card))) { outgoing = []; incoming = []; }
          }
        }
        // Replacing only removed slots preserves the original order of every unexchanged top card.
        const replacement = outgoing.slice(), finalTop = initialTop.map(card => incoming.includes(card) ? replacement.shift() : card);
        if (outgoing.length) await holder.lose(outgoing, ui.special);
        if (incoming.length) await holder.gain(incoming, 'draw');
        returnTop(finalTop);
        const currentHand = holder.getCards('h');
        if (['red', 'black'].every(color => finalTop.filter(card => get.color(card, holder) === color).length === currentHand.filter(card => get.color(card, holder) === color).length)) await holder.recover(1);
      },
    },
  ];
  const rules = {
    '翰墨_应刘纪事': {
      charlotte: true, forced: true, silent: true, firstDo: true, priority: 100000,
      trigger: { global: ['useCard1', 'useCardToPlayered', 'useCardAfter', 'roundStart', 'phaseAfter', 'loseAfter', 'loseAsyncAfter', 'gainAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter'] },
      async content(event, trigger) {
        const timing = event.triggername || inferTiming(trigger);
        if (!once(trigger, timing)) return;
        if (timing === 'roundStart') { previousRound = currentRound; currentRound = new Set(); return; }
        if (timing === 'useCardToPlayered') {
          if (!trigger.player || !trigger.target) return;
          rememberTargets(trigger.player, [trigger.target]); return;
        }
        if (timing === 'useCard1') {
          rememberTargets(trigger.player, trigger.targets);
          currentRound.add(o().name(trigger.card, trigger.player));
          const key = o().key(trigger), player = id(trigger.player), active = river.get(player);
          if (active && valid('yy_linghefu', active.instance) && active.turn === phaseKey(trigger, 'phase') && active.third !== key) o().unrespondable(trigger);
          recent.push({ key, player }); if (recent.length > 3) recent.shift();
          if (constituents(trigger.card).some(card => melonCards.get(card)?.owner === player)) melonUses.set(trigger, player);
          return;
        }
        if (timing === 'useCardAfter') {
          const owner = melonUses.get(trigger);
          melonUses.delete(trigger);
          if (owner) await draw(o().player(owner), 1);
          cleanMelons(trigger); return;
        }
        if (timing === 'phaseAfter') {
          for (const [player, record] of river) if (record.turn === o().key(trigger) || record.turn === phaseKey(trigger, 'phase')) river.delete(player);
          return;
        }
        cleanMelons(trigger);
      },
    },
    '翰墨_愍骥化牌': {
      charlotte: true, enable: 'chooseToUse',
      filter: canMinji,
      chooseButton: {
        dialog(event, player) { return ui.create.dialog('愍骥赋', [availableTricks(event, player).map(name => ['锦囊', '', name]), 'vcard'], 'hidden'); },
        check() { return 1; },
        prompt(links) { return '将一张手牌当作' + get.translation(links[0][2]) + '使用'; },
        backup(links, player) {
          return {
            position: 'h', selectCard: 1, filterCard: true, popname: true,
            viewAs: { name: links[0][2] },
            async precontent(event, trigger, holder) {
              const submitted = await game.huazhang.commitCard(holder, 'yy_minjifu', event.result.card);
              if (submitted.ok) return;
              event.result.bool = false;
              const parent = event.getParent?.(); if (parent?.result) parent.result.bool = false;
              const choose = event.getParent?.('chooseToUse'); if (choose?.result) choose.result.bool = false;
            },
          };
        },
      },
    },
  };
  function reset() {
    visitors.clear(); growth.clear(); river.clear(); melonCards.clear();
    recent = []; currentRound = new Set(); previousRound = new Set(); observed = new WeakMap(); melonUses = new WeakMap();
  }
  return { works, rules, reset };
})(context)];
  const formal=(function createFormal(context, catalog, modules, bodies, proxy, roster) {
  const { lib, game } = context;
  const implementations = modules.flatMap(module => module.works);
  if (catalog.length !== 70 || new Set(catalog.map(meta => meta.id)).size !== 70 ||
      implementations.length !== 70 || new Set(implementations.map(definition => definition.id)).size !== 70) {
    throw new Error('70 unique works required');
  }
  const definitions = catalog.map(meta => {
    const definition = implementations.find(value => value.id === meta.id);
    if (!definition || (!definition.cardUse && typeof definition.effect !== 'function')) throw new Error('Missing work ' + meta.id);
    return { ...definition, ...meta };
  });

  const characters = {}, characterTranslate = {};
  for (const character of roster.characters) {
    characters[character.id] = [character.sex, character.group, character.hp, character.skills.slice(), ['ext:翰墨凝威/' + character.portrait]];
    characterTranslate[character.id] = character.name;
  }
  const skills = Object.assign({}, ...bodies.map(body => body.skills));
  const skillTranslate = Object.assign({}, ...bodies.map(body => body.translate));
  for (const [id, workId] of [['翰墨_琴歌作锦囊', 'ry_qinge'], ['翰墨_隐士作基本', 'ry_yinshi'], ['翰墨_愍骥化牌', 'yy_minjifu']]) {
    const definition = definitions.find(value => value.id === workId);
    skillTranslate[id] = definition.title;
    skillTranslate[id + '_info'] = definition.text;
  }
  const sources = [...modules, ...bodies, proxy || {}];
  const rules = Object.assign({}, ...sources.map(source => source.rules));

  return {
    definitions, authors: roster.authors, characters, characterTranslate, skills, skillTranslate, rules,
    foreignLimitFor(player) {
      let limit = 3;
      for (const body of bodies) {
        if (typeof body.foreignLimitFor !== 'function') continue;
        const value = body.foreignLimitFor(player);
        if (value === undefined) continue;
        if (value !== Infinity && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError('Invalid body foreign capacity limit');
        limit = Math.max(limit, value);
      }
      return limit;
    },
    install(api) {
      for (const [id, rule] of Object.entries(rules)) {
        lib.skill[id] = rule;
        if (skillTranslate[id]) lib.translate[id] = skillTranslate[id];
        game.addGlobalSkill(id);
      }
      for (const source of sources) if (typeof source.reset === 'function') api.registerReset(source.reset);
    },
  };
})(context,[{"id":"pi_dianlun","author":"caopi","title":"典论·论文","text":"出牌阶段，你可以弃置任意张点数差相同的手牌，然后摸等量的牌，这些牌本回合不受“肃纲”的使用限制且无距离和次数限制。"},{"id":"pi_yangexing","author":"caopi","title":"燕歌行","text":"有角色受到伤害时，你可以防止本次伤害，然后令伤害来源弃置两张牌。"},{"id":"pi_yuwuzhishu","author":"caopi","title":"与吴质书","text":"每回合结束时，你可以将本回合进入弃牌堆的一张牌当做任意你本局游戏使用过的基本牌或锦囊牌使用。"},{"id":"pi_furongchizuo","author":"caopi","title":"芙蓉池作","text":"出牌阶段，你可以令任意名其他角色依次使用一张手牌，然后你摸本次被使用过的牌名数张牌。"},{"id":"pi_qiuhuxing","author":"caopi","title":"秋胡行","text":"回合结束时，你可以选择一名角色，该角色下一次受到伤害后，你摸X张牌（X为其被选择后到本次受到伤害经历的回合数，至少为1）。"},{"id":"pi_dicangshulei","author":"caopi","title":"弟仓舒诔","text":"出牌阶段，你可以展示牌堆顶四张牌，然后令一名角色选择并获得其中任意张点数之和不大于13的牌。其余牌按原顺序返回牌堆顶。"},{"id":"pi_huanghuangjingluoxing","author":"caopi","title":"煌煌京洛行","text":"当一名角色使用牌指定其他角色为目标时，你可以弃置一张牌，令此牌对其中一名目标角色无效。"},{"id":"zhi_luoshenfu","author":"caozhi","title":"洛神赋","text":"准备阶段，你可以进行一次判定，若判定牌为黑色，你获得此牌并可以重复此流程。以此法获得的牌不计入手牌上限且你可以将这些牌当做“闪”使用或打出，直到你失去此牌。"},{"id":"zhi_baimapian","author":"caozhi","title":"白马篇","text":"其他角色使用伤害牌对你造成伤害后，你可以弃置一张牌并视为对其使用一张同牌名、同属性的牌，基础目标仅为该角色。"},{"id":"zhi_qibushi","author":"caozhi","title":"七步诗","text":"出牌阶段，你可以将手牌摸至七张。本阶段结束时，若你本阶段使用的牌数不足七张，你失去本阶段你因此华章摸的牌数点体力。"},{"id":"zhi_zengbaimawangbiao","author":"caozhi","title":"赠白马王彪","text":"出牌阶段，你可以选择一名其他角色。你与其下一次受到伤害后，你与其各摸两张牌，然后本次未受伤的角色交给受伤的角色一张牌。"},{"id":"zhi_mingdupian","author":"caozhi","title":"名都篇","text":"出牌阶段，你可以选择一个常规花色并从牌堆中随机获得一张该花色的牌，若获得了牌，本阶段你使用该花色的牌无距离和次数限制。"},{"id":"zhi_yuyangdezushu","author":"caozhi","title":"与杨德祖书","text":"当你受到伤害后，你可以令伤害来源不能使用或打出基本牌直到其下回合开始。"},{"id":"zhi_qiuzishibiao","author":"caozhi","title":"求自试表","text":"一名其他角色的回合开始时，你可以交给该角色任意张牌，然后该角色选择是否令你先执行一个额外回合。"},{"id":"cao_duangexing","author":"caocao","title":"短歌行","text":"当你受到伤害后，你可以获得所有其他角色区域内各一张牌。"},{"id":"cao_guancanghai","author":"caocao","title":"观沧海","text":"出牌阶段，你可以令所有其他角色展示所有手牌。本阶段你使用其中包含的牌名的牌不能被响应，你使用其中包含的点数的牌结算完成后摸一张牌（每种点数限一次）。"},{"id":"cao_guisuishou","author":"caocao","title":"龟虽寿","text":"每回合结束时，若你的体力值小于已损体力值，你执行一个额外的出牌阶段。"},{"id":"cao_haolixing","author":"caocao","title":"蒿里行","text":"有角色受到伤害后，若此时场上受伤角色数量大于未受伤角色数量，所有角色随机弃置一张手牌。"},{"id":"cao_jinglie","author":"caocao","title":"精列","text":"出牌阶段，若你本局游戏未进入过濒死状态且此时不处于濒死状态，你可以令自己防止受到的所有伤害且每回合结束时失去1点体力，直到你下一次进入濒死状态。在此期间，你不能回复体力。"},{"id":"cao_xieluxing","author":"caocao","title":"薤露行","text":"有角色交给其他角色牌时，你可以令获得牌的角色展示所有手牌，若其中的花色不足四种，你对其造成一点伤害。"},{"id":"cao_duijiu","author":"caocao","title":"对酒","text":"出牌阶段，你可以令所有角色依次选择一项：回复1点体力，或摸一张牌。"},{"id":"rong_jianmihengbiao","author":"kongrong","title":"荐祢衡表","text":"出牌阶段，你可以令一名其他角色选择一项：1.令场上手牌数唯一最多的角色使用任意张当前手牌（无距离和次数限制）；2.令场上手牌数唯一最多的角色翻面。"},{"id":"rong_chaocaogong","author":"kongrong","title":"嘲曹公为子纳甄氏","text":"有角色交给其他角色牌时，你可以弃置获得牌的角色手中的所有黑色牌。"},{"id":"rong_yuwanglangshu","author":"kongrong","title":"与王朗书","text":"出牌阶段，你可以用一张手牌与至多三名角色同时拼点，然后依次结算拼点结果，没赢的角色选择一项：1.弃置一张牌；2.令你摸一张牌。"},{"id":"rong_ruying","author":"kongrong","title":"汝颍优劣论","text":"出牌阶段，你可以和所有其他角色同时展示一张手牌，与你展示的牌颜色相同的角色摸一张牌，颜色不同的弃置一张手牌。"},{"id":"rong_jinjiushu","author":"kongrong","title":"难曹公禁酒书","text":"有角色弃置其他角色的牌时，你可以对该角色造成一点伤害并令被弃牌的角色从弃牌堆获得本次被弃置的牌。"},{"id":"rong_shengxiaozhang","author":"kongrong","title":"与曹公论盛孝章书","text":"有角色成为伤害牌的目标时，你可以选择一名除其以外的角色令其交给该角色一张牌，然后被选择的角色可以代替其通过使用或打出牌响应此牌，直至此牌结算完毕。"},{"id":"rong_linzhongshi","author":"kongrong","title":"临终诗","text":"当你进入濒死状态时，你可以弃置一名角色两张牌。"},{"id":"lin_xiwen","author":"chenlin","title":"为袁绍檄豫州文","text":"出牌阶段，你可以弃置一张牌，展示牌堆顶此牌牌名字数张牌，然后选择一项：1.对一名其他角色依次使用其中符合要求的所有伤害牌（无距离和次数限制）；2.令一名角色获得其中的所有非伤害牌。剩余牌按原顺序回牌堆顶。"},{"id":"lin_yinma","author":"chenlin","title":"饮马长城窟行","text":"有角色获得其他角色的牌时，你可以弃置该角色等量张牌。"},{"id":"lin_dadong","author":"chenlin","title":"答东阿王笺","text":"出牌阶段，你可以选择一篇可书写的曹植所写的华章书写，且这份华章不计入持有上限，标记在回库后清除。"},{"id":"lin_wujunfu","author":"chenlin","title":"武军赋","text":"有角色造成伤害后，你可以令其视为使用一张“万箭齐发”。确认发动时此华章立即回库，后续万箭齐发独立结算。"},{"id":"lin_shenwufu","author":"chenlin","title":"神武赋","text":"有角色使用伤害牌指定唯一目标时，若目标角色手牌数小于该角色，你可以令此牌不能被响应且结算完成后该角色可以获得目标角色区域内一张牌。"},{"id":"lin_jianhejin","author":"chenlin","title":"谏何进召外兵","text":"有角色于摸牌阶段外获得牌时，你可以令该角色选择一项：1.弃置所有本次获得的牌，未弃完整则失去1点体力；2.失去1点体力。"},{"id":"lin_zhiyufu","author":"chenlin","title":"止欲赋","text":"出牌阶段，你可以令一名角色回复所有已损体力并摸体力上限张牌，然后其翻面。"},{"id":"can_dengloufu","author":"wangcan","title":"登楼赋","text":"出牌阶段，你可以从牌堆、弃牌堆检索红桃、黑桃、梅花、方块各一张牌，然后本阶段使用牌无距离和次数限制。无论实际获得几张，后续效果均生效。"},{"id":"can_qiaishi","author":"wangcan","title":"七哀诗","text":"当你进入濒死状态时，你可以令所有其他有手牌的角色各选择一张手牌交给你。"},{"id":"can_congjunshi","author":"wangcan","title":"从军诗","text":"出牌阶段，你可以弃置任意张非伤害牌，然后从牌堆、弃牌堆获得等量张伤害牌。"},{"id":"can_siyoufu","author":"wangcan","title":"思友赋","text":"出牌阶段，你可以选择一名其他角色，该角色下一次使用牌时，你获得一张同牌名牌。"},{"id":"can_yuliefu","author":"wangcan","title":"羽猎赋","text":"每轮开始时，你可以选择一名其他角色，本轮所有角色对其使用牌无距离和次数限制，且不计入通常使用次数。"},{"id":"can_gongyanshi","author":"wangcan","title":"公燕诗","text":"出牌阶段，你可以令所有角色依次与自己的上家或下家交换一张手牌。双方均须有手牌，各自选择交换牌，交换也视为主动交给。"},{"id":"can_nanzhongxun","author":"wangcan","title":"难钟荀太平论","text":"出牌阶段，你可以对所有手牌数和体力值不同的角色各造成一点伤害。"},{"id":"xg_shisi","author":"xugan","title":"室思","text":"出牌阶段，你可以选择一名其他角色，该角色下一次摸牌时，你摸等量张牌。"},{"id":"xg_daliuzhenshi","author":"xugan","title":"答刘桢诗","text":"出牌阶段，你可以选择一篇可书写的刘桢所写的华章书写，且这篇华章不计入持有上限。"},{"id":"xg_xudao","author":"xugan","title":"虚道","text":"出牌阶段，你可以令一名角色使用的下一张牌无效。"},{"id":"xg_zhixue","author":"xugan","title":"治学","text":"每回合你首次使用牌指定目标时，你可以摸此牌目标数张牌。"},{"id":"xg_yuanshanfu","author":"xugan","title":"圆扇赋","text":"出牌阶段，你可以将一名其他角色的所有手牌和装备牌置于其武将牌上，然后其于当前回合结束时获得这些牌。"},{"id":"xg_hebian","author":"xugan","title":"核辩","text":"出牌阶段，你可以和一名其他角色进行一次拼点。若有角色赢，没赢的角色下一次使用牌时，目标由赢的角色选择；无目标牌也消耗此效果。"},{"id":"xg_guiyan","author":"xugan","title":"贵验","text":"出牌阶段，你可以进行一次判定并令一名角色展示手牌中所有和判定牌颜色相同的牌，若其展示的手牌数小于判定牌点数，你对其造成一点伤害。"},{"id":"ry_weicaogong","author":"ruanyu","title":"为曹公作书与孙权","text":"出牌阶段，你可以选择一名角色和另一名角色，前者可以对后者使用一张手牌。若此牌造成伤害，你与用牌者各摸两张牌（整张牌限一次）。"},{"id":"ry_yongshishi","author":"ruanyu","title":"咏史诗","text":"有“杀”造成伤害后，你可以弃置一名角色区域内一张牌并获得这张“杀”的实体牌，你使用以此法获得的牌无距离和次数限制。"},{"id":"ry_qinge","author":"ruanyu","title":"琴歌","text":"若你的手牌中仅有一张黑色牌，你可将此牌当作任意一张普通锦囊牌使用；若你的手牌中仅有一张红色牌，你使用此牌时可以摸一张牌。两个分支共用一次华章消耗。"},{"id":"ry_yinshi","author":"ruanyu","title":"隐士","text":"你可以视为使用一张基本牌。"},{"id":"ry_diaoboyiwen","author":"ruanyu","title":"吊伯夷文","text":"出牌阶段，你可以获得一名已阵亡武将原有的一个出牌阶段主动技能（不含限定技、觉醒技、使命技等特殊技能）。本阶段结束时，你失去以此法获得的技能。"},{"id":"ry_xietaizujian","author":"ruanyu","title":"谢太祖笺","text":"你获得其他角色的牌时，可以选择一篇可书写的曹操所写的华章书写，且这篇华章不计入持有上限。"},{"id":"ry_kuyu","author":"ruanyu","title":"苦雨","text":"出牌阶段，你可以令所有角色依次判定一次“闪电”。"},{"id":"yy_doujishi","author":"yingyang","title":"斗鸡诗","text":"出牌阶段，你可以令至少两名有手牌的角色同时进行一次拼点，唯一点数最高的角色摸本次实际拼点人数张牌。"},{"id":"yy_shiwuguan","author":"yingyang","title":"侍五官中郎将建章台集诗","text":"你获得其他角色的牌时，可以选择一篇可书写的曹丕所写的华章书写，且这篇华章不计入持有上限。"},{"id":"yy_bieshi","author":"yingyang","title":"别诗","text":"你的回合开始或结束时，你可以摸X张牌（X为本局游戏使用牌指定过你的不同角色数，包含自己与已阵亡者）。"},{"id":"yy_zhuanzhengfu","author":"yingyang","title":"撰征赋","text":"出牌阶段开始时，你可以选择颜色或类别，并依次预测本阶段全场前三张被使用的牌，允许重复预测。每命中一次，你摸一张牌；若三次全部命中，你选择一种类型并获得两张该类型的牌。"},{"id":"yy_linghefu","author":"yingyang","title":"灵河赋","text":"全场连续被使用的三张牌均为一名角色使用时，你可以令其本回合接下来使用的牌不能被响应。"},{"id":"yy_minjifu","author":"yingyang","title":"愍骥赋","text":"出牌阶段，你可以将一张手牌当做任意上轮没有被使用过的普通锦囊牌使用。"},{"id":"yy_chishefu","author":"yingyang","title":"驰射赋","text":"出牌阶段，你可以选择攻击范围内的一名其他角色，然后依次对其使用至多X张手牌中的“杀”（无距离和次数限制，X为发动时你的攻击范围数值）。"},{"id":"lz_zengcongdi","author":"liuzhen","title":"赠从弟","text":"出牌阶段，你可以选择一名其他角色，该角色下一次受到伤害后增加一点体力上限（每名角色每局游戏至多因此增加3点体力上限）。"},{"id":"lz_zengxugan","author":"liuzhen","title":"赠徐干","text":"其他角色获得你的牌时，你可以选择一篇可书写的徐干所写的华章书写，且这篇华章不计入持有上限。"},{"id":"lz_sheyuanshi","author":"liuzhen","title":"射鸢诗","text":"你对攻击范围内的角色使用“杀”时，可以令这张“杀”对所有第一次指定的目标额外结算一次。"},{"id":"lz_zengwuguan","author":"liuzhen","title":"赠五官中郎将诗","text":"其他角色获得你的牌时，你可以选择一篇可书写的曹丕所写的华章书写，且这篇华章不计入持有上限。"},{"id":"lz_suizhifu","author":"liuzhen","title":"遂志赋","text":"出牌阶段，你可以进行一次判定。你下一次使用与判定牌类型相同的牌时，回复一点体力，然后摸两张牌。"},{"id":"lz_guafu","author":"liuzhen","title":"瓜赋","text":"每轮开始时，你可以摸一张牌，本轮每回合开始时，你可以弃置任意张牌。当你因此累计弃置的牌数量大于轮初样本牌的牌名字数，你摸其牌名字数张牌，然后此华章回库；以此法摸到的奖励牌，使用结算完成后摸一张牌，直到失去这些牌。轮末未达标亦回库。"},{"id":"lz_qinglvfu","author":"liuzhen","title":"清虑赋","text":"出牌阶段，你可以观看牌堆顶你此时手牌数张牌，然后你可以用手牌交换其中任意张。交换完成后，若这些牌和你的手牌中红色、黑色的张数分别相同，你回复一点体力。可以交换零张，零手牌也可发动。"}],modules,bodies,proxy,roster);
  return {
    name: "翰墨凝威", editable: true, connect: false,
    content: function(config, pack) { const existing=game.huazhang;const api=install(context, createCore, createResolver, formal.definitions, formal.authors,{formal:true,ops,foreignLimitFor:formal.foreignLimitFor});if(existing!==api)formal.install(api); },
    precontent: function() {}, help: {}, config: {},
    package: {
      character: {character: formal.characters, translate: formal.characterTranslate},
      card: {card: {}, translate: {}, list: []},
      skill: {skill: formal.skills, translate: formal.skillTranslate},
      intro: "翰墨凝威：文人之威。正式武将威曹丕、威曹植、威曹操，完整收录十位作者70篇华章。自作不限、外来三篇、建安生效时持有不限，免额独立、延时结算后回库。适配无名杀1.11.6单机。",
      author: "辟境归元", diskURL: "", forumURL: "", version: "1.2.0"
    },
    files: {character: ["hm_weicaopi.jpg","hm_weicaozhi.jpg","hm_weicaocao.jpg"], card: [], skill: [], audio: []}
  };
});
