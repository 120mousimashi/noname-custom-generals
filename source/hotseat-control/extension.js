// 全席接管 v0.1.2。设计与制作：辟境归元、OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createHotseatSession(lib,game,ui,get,ai,_status,api){
 const BOOT='bjgy_hotseat_boot',LIMIT=2000;
 const starts=[],stops=[],log=[];let configured=true,running=false,installed=false,reference=null,sequence=0;
 let attempted=false,blocked=false,reason='',note='',restores=[],panel=null,label=null,lastLabel='';
 const id=player=>player&&(player.playerid||player.name1||player.name)||null;
 function enabled(){return configured;}
 function active(){return running&&!_status.over&&!_status.connectMode&&!game.online&&!_status.video;}
 function status(){return{version:'0.1.2',enabled:configured,installed,active:active(),blocked,reason,note,anchor:id(reference),actor:id(game.me),records:log.length,attempted};}
 function render(){
  if(!attempted&&!installed)return;
  if(!panel&&ui.window&&typeof ui.create?.div==='function'){
   panel=ui.create.div('.bjgy-hotseat-panel',ui.window.ownerDocument?.body||ui.window);
   if(panel.style)panel.style.cssText='position:fixed;display:flex;flex-direction:column;align-items:flex-start;left:8px;top:110px;z-index:100000;background:rgba(20,20,25,.94);color:#fff;padding:7px 10px;border-radius:6px;font-size:14px;width:300px;max-width:calc(100vw - 36px);box-sizing:border-box;pointer-events:auto;';
   label=ui.create.div('',panel);if(label.style)label.style.cssText='position:relative;display:block;white-space:normal;line-height:1.5;width:100%;';
   const button=ui.create.div('.menubutton',panel);button.textContent='导出接管记录';if(button.style)button.style.cssText='position:relative;display:block;white-space:nowrap;width:auto;height:auto;margin-top:5px;';button.addEventListener?.('click',exportLog);
  }
  const name=game.me?get.translation(game.me):'待选择';
  const text=blocked?'全席接管已暂停：'+reason:(active()?'全席手动 · 当前操作：'+name:(!attempted?(configured?'全席接管已加载 · 等待四人身份局开局':'全席接管已关闭'):'全席接管未启用'+(reason?'：'+reason:'')));
  if(label&&lastLabel!==text){label.textContent=text;lastLabel=text;}
  if(panel)panel.title=note||'接管本地四人标准身份局；选牌、选目标和响应由你逐席操作。';
 }
 function record(kind,event,detail){
  const safe={};for(const[key,value]of Object.entries(detail||{}))if(value===null||['string','number','boolean'].includes(typeof value))safe[key]=value;
  log.push({seq:++sequence,kind,event:event?.name||null,eventId:event?.id||null,step:Number.isInteger(event?.step)?event.step:null,actor:id(event?.player),view:id(game.me),type:typeof event?.type==='string'?event.type:null,detail:safe});
  if(log.length>LIMIT)log.splice(0,log.length-LIMIT);
  if(kind==='control-ready'||kind==='control-swap'||kind==='blocked')render();
 }
 function records(){return log.map(entry=>({...entry,detail:{...entry.detail}}));}
 function notice(text){note=String(text);render();}
 function exportLog(){
  const data=JSON.stringify({tool:'全席接管',status:status(),records:records()},null,2);
  if(typeof game.export==='function')game.export(data,'全席接管_记录.json');
  return data;
 }
 function block(code,event,detail){
  blocked=true;reason=detail?.reason||reason||'无法安全接管本次选择，请导出记录并重开。';
  record('blocked',event,{code,reason});render();game.pause?.();
  const error=new Error('全席接管已暂停：'+reason+'（'+code+'）。请导出接管记录并重开测试。');error.name='HotseatControlBlocked';throw error;
 }
 function guard(event){if(blocked)block('SESSION_ALREADY_BLOCKED',event,{reason});}
 function validate(){
  if(!configured)return'扩展设置已关闭';
  if(_status.connectMode||game.online)return'仅支持单机，当前为联机环境';
  if(_status.video)return'不接管录像回放';
  if(_status.over)return'本局已经结束';
  if((get.mode?.()||lib.config.mode)!=='identity')return'当前不是身份模式；请使用普通四人标准身份局或乱斗的四人身份场景';
  const mode=_status.mode||_status.brawl?.submode||lib.config.identity_mode||'normal';
  if(mode!=='normal')return'仅支持标准normal身份局';
  const year=typeof get.config==='function'?get.config('enable_year_limit'):(lib.config.mode_config?.identity?.enable_year_limit??lib.config.enable_year_limit);
  if(year)return'请关闭身份模式的年机制后重新开局';
  const scene=_status.brawl?.scene;
  if(scene&&(scene.turns||scene.washes))return'请关闭场景的回合数或洗牌次数强制胜负条件';
  const people=[...new Set([...(game.players||[]),...(game.dead||[])])];
  if(people.length!==4)return'实际对局必须恰好四席；可使用“全席接管·四人测试”预设';
  for(const player of people){
   const name=player.name1||player.name;
   if(!name||!lib.character[name])return'四席必须先完成选将，且使用已加载的武将';
   if(player.name2&&player.name2!=='none')return'当前版本仅支持单武将，请关闭副将';
  }
  if(!people.includes(game.me))return'开局控制席位不在本场景中';
  return'';
 }
 function ownMethod(object,key,wrapper){
  const original=object[key];if(typeof original!=='function')return;
  const fn=wrapper(original);object[key]=fn;restores.push(()=>{if(object[key]===fn)object[key]=original;});
 }
 function keepResultView(){
  ownMethod(game,'checkResult',original=>function(){
   if(!active()||!reference)return original.apply(this,arguments);
   const previous=game.me;
   if(previous!==reference)game.swapControl(reference);
   try{return original.apply(this,arguments);}finally{
    if(!_status.over&&running&&previous&&previous!==game.me)game.swapControl(previous);
   }
  });
  ownMethod(game,'over',original=>function(){
   const wasRunning=running;
   if(wasRunning){record('game-over',null,{reference:id(reference)});stop('本局结束，已恢复原设置');}
   return original.apply(this,arguments);
  });
 }
 function start(event){
  if(running)return active();attempted=true;const failure=validate();
  if(failure){reason=failure;record('inactive',event,{reason:failure});render();return false;}
  reference=game.me;running=true;blocked=false;reason='';note='';
  try{for(const fn of starts){const value=fn();if(value&&typeof value.then==='function')throw new Error('会话安装器必须同步完成');}keepResultView();}
  catch(error){const message=reason||error.message;stop('接管启动失败');blocked=true;reason=message;render();game.pause?.();throw error;}
  record('session-start',event,{anchor:id(reference),seats:4});render();return true;
 }
 function stop(why='已停用，请重开以恢复普通游戏'){
  if(!running)return;running=false;blocked=false;reason=why;
  let error;
  for(let i=stops.length-1;i>=0;i--)try{stops[i]();}catch(value){error??=value;}
  for(let i=restores.length-1;i>=0;i--)try{restores[i]();}catch(value){error??=value;}
  restores=[];record('session-stop',null,{reason:why});render();if(error)throw error;
 }
 function configure(config){configured=config?.enabled!==false;render();}
 function install(){if(installed)return;game.bjgyHotseat=api.session;if(game.addGlobalSkill(BOOT)===false)throw new Error('全席接管启动技能尚未注册');installed=true;render();}
 api.session={configure,start,active,enabled,onStart:fn=>starts.push(fn),onStop:fn=>stops.push(fn),stop,record,block,guard,anchor:()=>reference,status,records,notice,export:exportLog,install,refresh:render};
 return{skills:{[BOOT]:{charlotte:true,forced:true,popup:false,firstDo:true,priority:1e9,forceDie:true,trigger:{global:['gameStart','phaseBefore']},filter(){return configured&&!attempted&&!running;},content:[function(event,trigger){start(trigger);}] }},translate:{[BOOT]:'全席接管'}};
},
function createHotseatManual(lib, game, ui, get, ai, _status, api) {
  const session = api.session;
  let installed = false;
  let running = false;
  let restores = [];
  let frequentSkills = new Set();
  let arraySlots = [];
  let glowNodes = new Map();

  function record(kind, event, detail) {
    session.record(kind, event, detail);
  }

  // Restore only a wrapper we still own. A later extension may wrap ours;
  // that retained inner wrapper becomes an ordinary pass-through on stop.
  function wrapMethod(object, key, handler) {
    if (!object || typeof object[key] !== 'function') return;
    const previous = object[key];
    const wrapper = function () {
      if (!session.active()) return previous.apply(this, arguments);
      return handler.call(this, previous, arguments);
    };
    object[key] = wrapper;
    restores.push(function () {
      if (object[key] === wrapper) object[key] = previous;
    });
  }

  function interceptProperty(object, key, transform, guard) {
    const previous = Object.getOwnPropertyDescriptor(object, key);
    if (previous && (!previous.configurable || ('value' in previous && !previous.writable))) {
      session.block('MANUAL_GUARD_UNAVAILABLE', _status.event, { property: key });
      return;
    }
    let value = object[key];
    let assigned = false;
    const readOriginal = function () {
      return previous && previous.get ? previous.get.call(object) : value;
    };
    const getter = function () {
      const original = readOriginal();
      return session.active() ? transform(original) : original;
    };
    const setter = function (next) {
      if (session.active() && guard && guard(next) === false) return;
      if (previous && previous.set) previous.set.call(object, next);
      else { value = next; assigned = true; }
    };
    Object.defineProperty(object, key, { configurable: true, enumerable: previous ? previous.enumerable : true, get: getter, set: setter });
    restores.push(function () {
      const current = Object.getOwnPropertyDescriptor(object, key);
      if (!current || current.get !== getter || current.set !== setter) return;
      if (!previous) {
        if (assigned) Object.defineProperty(object, key, { configurable: true, enumerable: true, writable: true, value });
        else delete object[key];
      }
      else if ('value' in previous) Object.defineProperty(object, key, Object.assign({}, previous, { value }));
      else Object.defineProperty(object, key, previous);
    });
  }

  function adaptArray(object, key, override) {
    const current = object[key];
    if (arraySlots.some(function (slot) { return slot.object === object && slot.key === key && slot.proxy === current; })) return;
    if (!Array.isArray(current)) {
      session.block('MANUAL_PREFERENCE_UNSUPPORTED', _status.event, { property: key });
      return;
    }
    const proxy = new Proxy(current, {
      get: function (target, property, receiver) {
        const original = Reflect.get(target, property, receiver);
        if (property !== 'includes' || typeof original !== 'function') return original;
        return function () {
          if (session.active()) {
            const answer = override(arguments[0]);
            if (answer !== undefined) return answer;
          }
          return original.apply(this, arguments);
        };
      },
    });
    object[key] = proxy;
    arraySlots.push({ object, key, proxy });
    restores.push(function () { if (object[key] === proxy) object[key] = current; });
  }

  function refreshPreferences() {
    adaptArray(lib.config, 'autoskilllist', function (skill) { return frequentSkills.has(skill) ? true : undefined; });
    // Every use in the 1.11.6 engine is the user's prehidden preference,
    // including chooseControl's arrangeSkill branch, never skill legality.
    adaptArray(_status, 'prehidden_skills', function () { return false; });
  }

  function clearPreferenceGlow() {
    ['auto', 'wuxie', 'tempnowuxie'].forEach(function (key) {
      const node = ui[key];
      if (!node || !node.classList) return;
      if (!glowNodes.has(node)) glowNodes.set(node, node.classList.contains('glow'));
      node.classList.remove('glow');
    });
  }

  function buttonInPath(event) {
    const candidates = [ui.auto, ui.autonode, ui.wuxie, ui.tempnowuxie].filter(Boolean);
    if (typeof event.composedPath === 'function') {
      return event.composedPath().find(function (node) { return candidates.includes(node); });
    }
    for (let node = event.target; node; node = node.parentNode) {
      if (candidates.includes(node)) return node;
    }
  }

  function denyPreference(message, event) {
    record('manual-preference-blocked', event || _status.event, { reason: message });
    session.notice(message);
  }

  function installButtonCapture() {
    const root = ui.window && (ui.window.ownerDocument || ui.window);
    if (!root || typeof root.addEventListener !== 'function') {
      session.block('MANUAL_UI_GUARD_UNAVAILABLE', _status.event, { reason: '无法阻止已绑定的原生托管按钮' });
      return;
    }
    const capture = function (event) {
      if (!session.active() || !buttonInPath(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      denyPreference('全席接管中请直接选择，本局不启用托管或自动拒绝无懈');
    };
    ['click', 'touchend'].forEach(function (type) {
      root.addEventListener(type, capture, true);
      restores.push(function () { root.removeEventListener(type, capture, true); });
    });
    // init.js toggles glow directly for W, bypassing ui.click.wuxie.
    const keyCapture = function (event) {
      if (!session.active() || String(event.key).toLowerCase() !== 'w' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      denyPreference('全席接管中不启用自动拒绝无懈快捷键');
    };
    root.addEventListener('keydown', keyCapture, true);
    restores.push(function () { root.removeEventListener('keydown', keyCapture, true); });
  }

  function timerValue(event) {
    const info = event && event.player && event.player.forceCountChoose;
    if (!info) return undefined;
    if (event.name === 'chooseToUse' && event.type === 'phase' && typeof info.phaseUse === 'number') return info.phaseUse;
    if (typeof info[event.name] === 'number') return info[event.name];
    if (info.default) return info.default;
    return undefined;
  }

  function assertNoTimer(event) {
    const limit = timerValue(event);
    if (limit !== undefined) {
      session.block('MANUAL_RULE_TIME_LIMIT', event, { limit, reason: '本角色的原生强制计时会超时代选，当前版本无法无损全手动接管' });
    }
  }

  function begin() {
    if (!session.active() || running) return;
    running = true;
    restores = [];
    frequentSkills = new Set();
    arraySlots = [];
    glowNodes = new Map();
    if (_status.countDown) {
      session.block('MANUAL_EXISTING_TIME_LIMIT', _status.event, { reason: '会话开始时已有计时器，不能无损撤除' });
      return;
    }
    if (ui.arena && ui.arena.classList) {
      const arena = ui.arena;
      const wasAuto = arena.classList.contains('auto');
      arena.classList.remove('auto');
      restores.push(function () { if (wasAuto) arena.classList.add('auto'); });
    }
    if (_status.auto && ui.control && ui.control.classList && ui.control.classList.contains('hidden')) {
      const control = ui.control;
      control.classList.remove('hidden');
      restores.push(function () { control.classList.add('hidden'); });
    }
    interceptProperty(_status, 'auto', function () { return false; }, function (next) {
      if (next) {
        session.block('MANUAL_AUTO_REQUESTED', _status.event, { reason: '检测到绕过按钮的托管设置' });
        return false;
      }
      return false;
    });
    [['auto_confirm', false], ['unauto_choose', true], ['skip_shan', false], ['tao_enemy', false], ['wuxie_self', false]].forEach(function (entry) {
      interceptProperty(lib.config, entry[0], function () { return entry[1]; });
    });
    // 十周年UI otherwise selects the first eligible response/discard cards
    // in checkEnd, even while the event is controlled by a human.
    interceptProperty(lib.config, 'extension_十周年UI_autoSelect', function () { return false; });
    refreshPreferences();
    // Disable only the native preferences, then preserve the actual previous
    // filter, including any extension wrapper installed before this session.
    wrapMethod(lib.filter, 'wuxieSwap', function (previous, args) {
      const event = args[0];
      if (!event || event.type !== 'wuxie') return previous.apply(this, args);
      clearPreferenceGlow();
      const refusal = previous.apply(this, args);
      if (refusal) {
        session.block('MANUAL_WUXIE_RULE_CONFLICT', event, { reason: '停用原生无懈自动偏好后仍被拒绝，可能有其他扩展规则包装；当前版本暂停以免绕过规则或自动放弃' });
      }
      return refusal;
    });
    ['auto', 'wuxie', 'tempnowuxie'].forEach(function (key) {
      wrapMethod(ui.click, key, function () { denyPreference('全席接管中不启用托管或自动拒绝无懈'); });
    });
    wrapMethod(game, 'countChoose', function (previous, args) {
      assertNoTimer(_status.event);
      if (_status.connectMode) session.block('MANUAL_CONNECTED_TIME_LIMIT', _status.event, { reason: '全席接管仅支持离线场景' });
      return previous.apply(this, args);
    });
    clearPreferenceGlow();
    installButtonCapture();
    record('manual-start', _status.event, { preferences: 'temporary-only', nativeWuxie: true });
  }

  function end() {
    if (!running) return;
    running = false;
    for (let index = restores.length - 1; index >= 0; index--) restores[index]();
    glowNodes.forEach(function (glow, node) {
      if (glow) node.classList.add('glow');
      else node.classList.remove('glow');
    });
    restores = [];
    arraySlots = [];
    glowNodes.clear();
    frequentSkills.clear();
  }

  function prepare(event) {
    if (!session.active()) return;
    if (!running) session.block('MANUAL_NOT_STARTED', event, { reason: '人工偏好适配未随会话启动' });
    assertNoTimer(event);
    if (event && event.name === 'chooseBool' && event.frequentSkill) {
      frequentSkills.add(event.frequentSkill);
      record('manual-frequent-prompt', event, { reason: '可选频繁技能保留人工询问' });
    }
    refreshPreferences();
    clearPreferenceGlow();
  }

  function install() {
    if (installed) return;
    installed = true;
    session.onStart(begin);
    session.onStop(end);
  }

  api.manual = { install, prepare };
  return { skills: {}, translate: {} };
},
function controlFactory(lib, game, ui, get, ai, _status, api) {
  // autoswap's 19 entrances plus the newer native rearrangement chooser.
  const decisionNames = new Set([
    'chooseToUse', 'chooseToRespond', 'chooseToDiscard', 'chooseToCompare',
    'chooseButton', 'chooseCard', 'chooseTarget', 'chooseCardTarget',
    'chooseControl', 'chooseBool', 'choosePlayerCard', 'discardPlayerCard',
    'gainPlayerCard', 'chooseToMove', 'chooseToPlayBeatmap', 'chooseToGive',
    'chooseToGuanxing', 'chooseButtonTarget', 'chooseNumbers', 'chooseToMove_new',
  ]);
  // These native containers delegate any variable decision to the entrances
  // above. They keep their original offline order and result structures.
  const containerNames = new Set([
    'chooseCardOL', 'chooseButtonOL', 'chooseAnyOL', 'chooseUseTarget',
    'chooseDrawRecover', 'chooseToCompareLose', 'chooseToCompareEffect',
    'chooseToCompareMultiple', 'chooseToCompareMeanwhile',
  ]);
  let installed = false;
  let generation = 0;
  let registrations = [];
  let creationHook = null;

  function isActive(epoch) {
    return epoch === generation && api.session.active();
  }

  function record(kind, event, detail) {
    api.session.record(kind, event, detail);
  }

  function nativePrevents(event) {
    const player = event && event.player;
    if (!player) return 'missing-player';
    if (player.removed) return 'removed';
    if (typeof player.isDead === 'function' && player.isDead() && !event.forceDie) return 'dead';
    if (typeof player.isOut === 'function' && player.isOut() && !event.includeOut) return 'out';
    return null;
  }

  function seatExists(player) {
    return (game.players || []).includes(player) || (game.dead || []).includes(player);
  }

  function ensureActor(event, reason) {
    const actor = event.player;
    if (!seatExists(actor)) {
      api.session.block('unknown-actor', event, { reason: '选择者不在本局四席中' });
      return;
    }
    if (game.me !== actor) {
      if (typeof game.swapControl !== 'function') {
        api.session.block('missing-swapControl', event, { reason: '本机缺少原生控制切换接口' });
        return;
      }
      game.swapControl(actor);
      record('control-swap', event, { reason });
    }
    // Preserve native isMine/isUnderControl and all rule loss of control. Never
    // clear madness, notMe, or _trueMe to make this assertion pass.
    if (typeof actor.isMine !== 'function' || !actor.isMine()) {
      api.session.block('control-conflict', event, {
        reason: '原生 isMine 拒绝人工接管；请检查狂乱、规则失控或托管冲突',
        auto: Boolean(_status.auto),
        notMe: Boolean(game.notMe),
        mad: typeof actor.isMad === 'function' ? Boolean(actor.isMad()) : null,
      });
      return;
    }
    record('control-ready', event, { reason });
  }

  function closestParent(event) {
    const seen = new Set([event]);
    let parent = event.parent;
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      if (decisionNames.has(parent.name) && !parent.finished && !nativePrevents(parent)) return parent;
      parent = parent.parent;
    }
    return null;
  }

  function restoreParent(event) {
    const parent = closestParent(event);
    if (parent) {
      ensureActor(parent, 'resume-parent');
      return;
    }
    // The last chooser may just have died. Keep a living hand panel available
    // without rewriting death, revival, or identity victory rules.
    const current = game.me;
    if (current && !current.removed && !(current.isDead && current.isDead()) && !(current.isOut && current.isOut())) return;
    const anchor = api.session.anchor();
    const living = (game.players || []).filter(player =>
      !player.removed && !(player.isDead && player.isDead()) && !(player.isOut && player.isOut()));
    const fallback = living.includes(anchor) ? anchor : living[0];
    if (fallback && fallback !== current) {
      game.swapControl(fallback);
      record('control-living-panel', event, { reason: '当前操作者死亡或离场后恢复存活席位面板' });
    }
  }

  function auditAI(event) {
    if (event.result === 'ai') {
      api.session.block('ai-result', event, { reason: '原生选择将进入 AI 分支，已暂停以便检查遗漏' });
    }
  }

  function skillEvent(name) {
    if (typeof name !== 'string' || !lib.skill) return null;
    const isCost = name.endsWith('_cost');
    const key = isCost ? name.slice(0, -5) : name;
    const info = Object.prototype.hasOwnProperty.call(lib.skill, key) ? lib.skill[key] : null;
    if (!info || (isCost && typeof info.cost !== 'function')) return null;
    const source = isCost ? [info.cost] : [info.content, info.cost];
    const functions = source.flat().filter(value => typeof value === 'function');
    return { key, functions };
  }

  function auditCustomSkillChoice(event, skill) {
    // A small conservative source marker, not a parser or an AI detector.
    // Native dclieqiong_cost builds a private UI and directly calls its own
    // switchToAuto, leaving no 'ai' result for the choose* audit to observe.
    if (skill.functions.some(fn => /\bswitchToAuto\b/.test(Function.prototype.toString.call(fn)))) {
      const label = lib.translate && lib.translate[skill.key] || skill.key;
      api.session.block('custom-skill-choice', event, {
        skill: skill.key,
        reason: '技能“' + label + '”自建选择界面并含自动代选入口，当前版本无法无损接管；请导出记录并重开测试',
      });
    }
  }

  function dispatch(event, option, epoch) {
    if (!isActive(epoch) || !event || !option) return;
    if (typeof api.session.guard === 'function') api.session.guard(event);
    const isDecision = decisionNames.has(event.name);
    const isContainer = containerNames.has(event.name);
    const skill = !isDecision && !isContainer && !/^choose/.test(event.name) ? skillEvent(event.name) : null;
    if (skill) {
      if (option.state === 'begin' && !event.finished) auditCustomSkillChoice(event, skill);
      return;
    }
    if (!isDecision && !isContainer) {
      if (option.state === 'begin' && !event.finished) {
        api.session.block('unknown-choice', event, { reason: '发现未核验的选择入口：' + event.name });
      }
      return;
    }
    if (option.state === 'begin') {
      if (event.finished) return;
      if (api.manual && typeof api.manual.prepare === 'function') api.manual.prepare(event);
      if (!isActive(epoch)) return;
      auditAI(event);
      if (isContainer) {
        record('native-choice-container', event, { reason: '保留本机离线子选择与原生结果结构' });
        return;
      }
      const prevented = nativePrevents(event);
      if (prevented === 'missing-player') {
        api.session.block('missing-actor', event, { reason: '单角色选择没有 event.player' });
      } else if (prevented) {
        record('native-choice-prevented', event, { reason: prevented });
      } else {
        ensureActor(event, 'step-begin');
      }
    } else if (option.state === 'end') {
      auditAI(event);
      if (event.result && typeof event.result === 'object' && event.result.autochoose === true) {
        // Observe the native result; calling autochoose here would execute its
        // filter twice and can have side effects in extension content.
        record('native-deterministic', event, { reason: '原生结果标记 autochoose' });
      }
      // ArrayCompiler fires end after each step, before its final implicit
      // finish. Restoring here also covers async parents immediately after an
      // awaited child, while the next child's/parent's begin reacquires actor.
      restoreParent(event);
    }
  }

  function start() {
    const epoch = ++generation;
    const manager = game.globalEventHandlers;
    if (!manager || typeof manager.pushHandler !== 'function' || typeof manager.removeHandler !== 'function' || typeof manager.addHandlerToEvent !== 'function') {
      api.session.block('missing-native-handlers', null, { reason: '本机缺少可恢复的原生每步事件接口' });
      return;
    }
    const handler = (event, option) => dispatch(event, option, epoch);
    for (const name of [...decisionNames, ...containerNames]) {
      const type = 'on' + name[0].toUpperCase() + name.slice(1);
      manager.pushHandler(name, type, handler);
      registrations.push({ manager, name, type, handler });
    }
    // Native registrations have no wildcard. This reversible creation hook
    // attaches a native step handler to unknown choose* and known skill/cost
    // events. It never executes content or changes player/cards/result.
    const original = manager.addHandlerToEvent;
    const wrapper = function hotseatAddHandlerToEvent(event) {
      const result = original.apply(this, arguments);
      if (isActive(epoch) && event && typeof event.name === 'string' && !decisionNames.has(event.name) && !containerNames.has(event.name) && (/^choose/.test(event.name) || skillEvent(event.name))) {
        const type = 'on' + event.name[0].toUpperCase() + event.name.slice(1);
        event.pushHandler(type, handler);
      }
      return result;
    };
    manager.addHandlerToEvent = wrapper;
    creationHook = { manager, original, wrapper };
    record('control-installed', null, {
      entrances: decisionNames.size,
      reason: '审计原生事件系统 choose* 与技能自建UI明确标记；无标记私有AI不在全面检测范围',
    });
  }

  function stop() {
    ++generation;
    for (const { manager, name, type, handler } of registrations) manager.removeHandler(name, type, handler);
    registrations = [];
    if (creationHook && creationHook.manager.addHandlerToEvent === creationHook.wrapper) {
      creationHook.manager.addHandlerToEvent = creationHook.original;
    }
    creationHook = null;
  }

  api.control = {
    install() {
      if (installed) return;
      installed = true;
      api.session.onStart(start);
      api.session.onStop(stop);
    },
  };
  return { skills: {}, translate: {} };
},
function createHotseatPreset(lib, game, ui, get, ai, _status, api) {
  const name = '全席接管·四人测试';

  function install() {
    if (!api.session || typeof api.session.enabled !== 'function' || !api.session.enabled()) return false;
    if (lib.config.mode !== 'brawl' || _status.connectMode || game.online || _status.video) return false;
    if (!lib.storage || typeof lib.storage !== 'object' || typeof game.save !== 'function') return false;
    const scenes = lib.storage.scene || {};
    if (typeof scenes !== 'object' || Array.isArray(scenes) || name in scenes) return false;

    const characters = ['caocao', 'liubei', 'sunquan', 'huatuo'];
    const identities = ['zhu', 'zhong', 'fan', 'nei'];
    const scene = {
      name,
      intro: '四人标准身份测试：曹操主公、刘备忠臣、孙权反贼、华佗内奸，四席均由你操作。',
      players: characters.map(function (character, index) {
        return {
          name: character,
          name2: 'none',
          identity: identities[index],
          position: index + 1,
          playercontrol: index === 0,
          handcards: [],
          equips: [],
          judges: [],
        };
      }),
      gameDraw: true,
      cardPileTop: [],
      cardPileBottom: [],
      discardPile: [],
    };

    // Extension content runs before brawl.start enumerates storage.scene.
    // Store native scene data only; the native start creates the actual UI.
    scenes[name] = scene;
    lib.storage.scene = scenes;
    game.save('scene', lib.storage.scene);
    return true;
  }

  api.preset = { install };
  return { skills: {}, translate: {} };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills)),translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'全席接管',editable:true,connect:false,
  content(config){
   api.session.configure(config);if(scheduled)return;scheduled=true;
   for(const [id,info] of Object.entries(skills))if(!lib.skill[id])game.addSkill(id,info,translate[id]);
   api.manual.install();api.control.install();api.session.install();api.preset.install();
   if(Array.isArray(lib.arenaReady))lib.arenaReady.push(function refreshHotseat(){api.session.refresh();});
   else api.session.refresh();
  },
  precontent(){},help:{'全席接管':'支持单机四人标准身份局及乱斗的四人身份场景，开局后逐席人工选牌、选目标和响应。若要在开局前自己指定四席武将，可用乱斗中的“全席接管·四人测试”预设并编辑主将。'},
  config:{enabled:{name:'启用四席接管',init:true,intro:'接管普通单机四人标准身份局，也支持乱斗四人身份场景；不要求主忠反内各一名。更改开关后请完整重启。'}},
  package:{character:{character:{},translate:{},characterIntro:{}},card:{card:{},translate:{},list:[]},skill:{skill:{},translate:{}},
   intro:'单机四人标准身份局的全席人工操控工具，支持普通身份局和乱斗身份场景。自动切到决策者，由你选牌、目标和响应；导出记录仅用于排错。',author:'辟境归元',version:'0.1.2',diskURL:'',forumURL:''},
  files:{character:[],card:[],skill:[],audio:[]}
 };
});
