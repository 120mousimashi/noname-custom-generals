// 达里奥 v0.1.0 测试版。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助。
// 原创代码MIT；设计文字与用户提供的GPT原画分别署名，见README与LICENSE。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const createFenghao=function createFenghao(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'bjgy_dario_fenghao';
  const STATUS = 'bjgy_dario_fenghao_status';

  function getSeal(target) {
    const state = target && target.storage && target.storage[STATUS];
    return state && (state.kind === 'hand' || state.kind === 'skill')
      ? { kind: state.kind }
      : null;
  }

  function sealed(target) {
    return getSeal(target) !== null;
  }

  function applySeal(target, kind) {
    if (!target || !target.storage || (kind !== 'hand' && kind !== 'skill') || sealed(target)) {
      return false;
    }
    target.storage[STATUS] = { kind };
    // The target owns a permanent Charlotte status. There is deliberately no
    // source reference, additional-skill owner, temp-skill expiry or turn hook.
    target.addSkill(STATUS);
    target.syncStorage(STATUS);
    target.markSkill(STATUS);
    return true;
  }

  function clearSeal(target) {
    if (!sealed(target)) return false;
    delete target.storage[STATUS];
    target.removeSkill(STATUS);
    return true;
  }

  function handSealed(player) {
    return getSeal(player)?.kind === 'hand';
  }

  function includesHandMaterial(card) {
    if (!card) return false;
    // Checking every material matters when an equipped card precedes a hand
    // card in a multi-card conversion. Materialless virtual cards remain legal.
    if (get.position(card) === 'h') return true;
    return Array.isArray(card.cards) && card.cards.some((material) => get.position(material) === 'h');
  }

  function currentCardSelection() {
    let event = get.event();
    const visited = new Set();
    while (event && !visited.has(event)) {
      if (event.name === 'chooseToUse' || event.name === 'chooseToRespond') return event.name;
      visited.add(event);
      event = typeof event.getParent === 'function' ? event.getParent() : null;
    }
    return null;
  }

  function preventHandUse(card, player) {
    if (handSealed(player) && includesHandMaterial(card)) return false;
  }

  const skills = {
    [MAIN]: {
      enable: 'phaseUse',
      usable: 1,
      selectTarget: 1,
      filter(event, player) {
        return game.hasPlayer((current) => current !== player && !sealed(current));
      },
      filterTarget(card, player, target) {
        return target !== player && !sealed(target);
      },
      async content(event, trigger, player) {
        const target = event.target;
        if (!target || target === player || sealed(target)) return;
        const controls = ['不能使用手牌', '非锁定技失效'];
        const result = await player.chooseControl(controls)
          .set('prompt', '封号：选择对' + get.translation(target) + '施加的限制')
          .set('ai', () => target.countCards('h') > 0 ? 0 : 1)
          .forResult();
        const index = Number.isInteger(result.index) ? result.index : controls.indexOf(result.control);
        if (index !== 0 && index !== 1) return;
        const kind = index === 0 ? 'hand' : 'skill';
        if (applySeal(target, kind)) {
          game.log(target, '受到', '#g【封号】', '：' + controls[index]);
        }
      },
      ai: {
        order: 10,
        result: { target: -1 },
        threaten: 2,
      },
    },
    [STATUS]: {
      charlotte: true,
      mark: true,
      marktext: '封',
      init(player, skill) {
        player.addSkillBlocker(skill);
      },
      onremove(player, skill) {
        player.removeSkillBlocker(skill);
        delete player.storage[skill];
      },
      skillBlocker(skill, player) {
        if (getSeal(player)?.kind !== 'skill') return false;
        const info = lib.skill[skill];
        // Match native fengyin. Equipped skills are already excluded from
        // blockers by Player.getSkills -> game.filterSkills(exclude).
        return Boolean(info && !info.persevereSkill && !info.charlotte && !get.is.locked(skill, player));
      },
      mod: {
        cardEnabled: preventHandUse,
        cardSavable: preventHandUse,
        cardEnabled2(card, player) {
          // Native GameEvent.backup checks this hook for viewAs materials.
          // The same hook also runs for responses, so never ban unconditionally.
          if (currentCardSelection() === 'chooseToUse') return preventHandUse(card, player);
        },
      },
      intro: {
        content(storage, player) {
          const state = getSeal(player);
          if (!state) return '未被封号';
          return state.kind === 'hand'
            ? '不能使用手牌（含以手牌为材料的转化牌），可以打出手牌。仅申诉获胜解除。'
            : '非锁定技失效，装备技能及独立机制照常生效。仅申诉获胜解除。';
        },
      },
    },
  };

  api.fenghao = { MAIN, STATUS, getSeal, sealed, applySeal, clearSeal };
  return {
    skills,
    translate: {
      [MAIN]: '封号',
      [MAIN + '_info']: '出牌阶段限一次，你可以选择一名没有“封号”的其他角色，令其获得由你选择的一项永久限制：不能使用手牌（包括以手牌为材料使用转化牌，但可以打出手牌）；或非锁定技失效（装备技能及独立机制照常生效）。该限制仅在其申诉获胜后解除。',
      [STATUS]: '封号',
      [STATUS + '_info']: '所受封号限制永久保留，仅申诉获胜后解除。',
    },
  };
};
 const createShensu=function createShensu(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'bjgy_dario_shensu';
  const TRACK = 'bjgy_dario_shensu_track';
  const frames = new WeakMap();

  function alive(player) {
    return Boolean(player && player.isAlive() && player.isIn());
  }

  function appealCard() {
    return { name: 'juedou', isCard: true };
  }

  function canAppeal(trigger, owner) {
    const appellant = trigger.player;
    return alive(owner) && alive(appellant) && appellant !== owner &&
      api.fenghao.sealed(appellant) && appellant.canUse(appealCard(), owner);
  }

  function start(useEvent, owner, appellant) {
    const frame = { useEvent, owner, appellant, card: useEvent.card, x: 0, seen: new WeakSet() };
    frames.set(useEvent, frame);
    return frame;
  }

  function finish(useEvent) {
    frames.delete(useEvent);
  }

  function frameFor(current) {
    if (!current || typeof current.getParent !== 'function') return null;
    const duel = current.getParent('juedou');
    if (!duel || duel.name !== 'juedou' || typeof duel.getParent !== 'function') return null;
    const useEvent = duel.getParent('useCard');
    const frame = frames.get(useEvent);
    if (!frame || duel.card !== frame.card || duel.player !== frame.appellant || duel.target !== frame.owner) return null;
    if (current.name === 'respond') {
      const choice = current.getParent();
      if (!choice || choice.name !== 'chooseToRespond' || typeof choice.getParent !== 'function' || choice.getParent() !== duel) return null;
      if (current.player !== frame.owner && current.player !== frame.appellant) return null;
      if (choice.player !== current.player || get.name(current.card) !== 'sha') return null;
      if (current.respondTo?.[0] !== frame.appellant || current.respondTo?.[1] !== frame.card) return null;
      return frame;
    }
    if (current.name === 'damage') {
      // The native duel calls turn.damage(source) directly. Nested skill damage
      // and in-place victim/source redirection must not settle this appeal.
      if (current.getParent() !== duel || current.card !== frame.card || current.unreal || !(current.num > 0)) return null;
      if (current.player !== duel.turn || current.source !== duel.source) return null;
      if (current.player === frame.owner && current.source === frame.appellant) return frame;
      if (current.player === frame.appellant && current.source === frame.owner) return frame;
    }
    return null;
  }

  const skills = {
    [MAIN]: {
      trigger: { global: 'phaseBegin' },
      forced: true,
      locked: true,
      global: TRACK,
      filter: canAppeal,
      async content(event, trigger, player) {
        if (!canAppeal(trigger, player)) return;
        // Keep the independent tracker available if the owner loses this skill
        // while the already-created duel is resolving.
        game.addGlobalSkill(TRACK);
        const appellant = trigger.player;
        const useEvent = appellant.useCard(appealCard(), player, false);
        start(useEvent, player, appellant);
        try {
          await useEvent;
        } finally {
          finish(useEvent);
        }
      },
    },
    [TRACK]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      trigger: { global: ['respondAfter', 'damageAfter'] },
      filter(current) {
        const frame = frameFor(current);
        return Boolean(frame && !frame.seen.has(current));
      },
      async content(event, trigger) {
        const frame = frameFor(trigger);
        if (!frame || frame.seen.has(trigger)) return;
        frame.seen.add(trigger);
        if (trigger.name === 'respond') {
          frame.x++;
          return;
        }
        if (trigger.player === frame.owner) {
          api.fenghao.clearSeal(frame.appellant);
          return;
        }
        if (!alive(frame.owner)) return;
        const number = Math.min(frame.x, frame.appellant.countCards('he'));
        if (number > 0) {
          await frame.owner.gainPlayerCard(frame.appellant, 'he', true, number);
        }
      },
    },
  };

  api.shensu = { MAIN, TRACK, start, finish, frameFor };
  return {
    skills,
    translate: {
      [MAIN]: '申诉',
      [`${MAIN}_info`]: '锁定技，有“封号”的角色的回合开始时，若其能对你使用【决斗】，其视为对你使用一张【决斗】。此【决斗】直接对你造成伤害后，解除其“封号”；直接对其造成伤害后，你获得其手牌区和装备区内的共X张牌（不足则全部获得），X为你与其在此【决斗】中成功打出【杀】的总次数。',
      [TRACK]: '申诉',
    },
  };
};
 const api={};
 const modules=[createFenghao(lib,game,ui,get,ai,_status,api),createShensu(lib,game,ui,get,ai,_status,api)];
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 const dynamicTranslate=Object.assign({},...modules.map(module=>module.dynamicTranslate||{}));
 return {
  name:'达里奥',editable:true,connect:false,
  async content(...args){for(const module of modules)if(module.content)await module.content.apply(this,args);},
  async precontent(...args){for(const module of modules)if(module.precontent)await module.precontent.apply(this,args);},
  help:{},config:{},
  package:{
   character:{character:{bjgy_dario:['male','qun',4,['bjgy_dario_fenghao','bjgy_dario_shensu'],['die:false','ext:达里奥/bjgy_dario.jpg']]},
    translate:{bjgy_dario:'达里奥'},characterIntro:{bjgy_dario:'原创武将达里奥。群势力，男性，体力/体力上限4/4。技能设计：辟境归元；代码与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'},dynamicTranslate},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'达里奥：群、男、4/4。封号与申诉，按设计者确认规则制作，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_dario.jpg'],card:[],skill:[],audio:[]}
 };
});
