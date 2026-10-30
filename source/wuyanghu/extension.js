// 武羊祜 v0.1.0 测试版；技能设计：辟境归元；实现与打包：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createDexin(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuyanghu_dexin';
  const EFFECT = ID + '_effect';
  // A real phaseUse event, including an inserted one, owns its own allowance.
  const phaseStates = new WeakMap();
  const uses = new WeakSet();
  const increased = new WeakSet();
  const paid = new WeakSet();

  function phaseOf(event, player) {
    const phase = event?.name === 'phaseUse' ? event : event?.getParent?.('phaseUse', true, true);
    return phase?.name === 'phaseUse' && phase.player === player ? phase : null;
  }

  function stateOf(phase, player, create = false) {
    let states = phaseStates.get(phase);
    if (!states && create) phaseStates.set(phase, states = new Map());
    let state = states?.get(player);
    if (!state && create) states.set(player, state = { used: 0, limit: 1 });
    return state || { used: 0, limit: 1 };
  }

  function available(event, player) {
    const phase = phaseOf(event, player);
    if (!phase) return false;
    const state = stateOf(phase, player);
    return state.used < state.limit && game.hasPlayer(target =>
      target !== player && target.isIn() && (player.countCards('he') > 0 || target.countCards('he') > 0));
  }

  function relatedDamage(event) {
    if (!event.card || event.unreal || event.num <= 0) return false;
    // Nearest useCard prevents unrelated nested card uses from borrowing the buff.
    // Duel counterdamage and native chain propagation retain this card and ancestry.
    const use = event.getParent('useCard', true, true);
    return !!use && uses.has(use) && event.card === use.card;
  }

  function randomJacks() {
    const cards = [];
    for (const pile of [ui.cardPile, ui.discardPile]) {
      const candidates = Array.from(pile.childNodes).filter(card => get.number(card, false) === 11);
      while (candidates.length && cards.length < 2) {
        cards.push(candidates.splice(get.rand(0, candidates.length - 1), 1)[0]);
      }
      if (cards.length === 2) break;
    }
    return cards;
  }

  const skills = {
    [ID]: {
      enable: 'phaseUse',
      filter: available,
      selectTarget: 1,
      filterTarget(card, player, target) {
        return target !== player && target.isIn() && (player.countCards('he') > 0 || target.countCards('he') > 0);
      },
      async content(event, trigger, player) {
        const phase = phaseOf(event, player);
        if (!phase || !available(event, player)) return;
        const target = event.target || event.targets?.[0];
        if (!target?.isIn() || target === player) return;
        const choices = [];
        if (player.countCards('he')) choices.push('交给对方');
        if (target.countCards('he')) choices.push('令其交给你');
        if (!choices.length) return;
        let direction = choices[0];
        if (choices.length > 1) {
          const result = await player.chooseControl(choices)
            .set('prompt', '德信：选择交牌方向')
            .set('ai', () => 0).forResult();
          direction = result.control;
        }
        if (!choices.includes(direction)) return;
        const giver = direction === '交给对方' ? player : target;
        const receiver = giver === player ? target : player;
        const selected = await giver.chooseCard('he', 1, true)
          .set('prompt', '德信：交给' + get.translation(receiver) + '一张牌')
          .set('ai', card => (get.tag(card, 'damage') ? 0 : 8) - get.value(card))
          .forResult();
        const card = selected.cards?.[0];
        if (!selected.bool || !card || !giver.getCards('he').includes(card) || !giver.isIn() || !receiver.isIn()) return;

        // These are properties of the offered card before its owner/zone changes.
        const snapshot = { damage: !!get.tag(card, 'damage'), name: get.name(card, giver), nature: get.nature(card, giver) };
        const state = stateOf(phase, player, true);
        state.used++;
        await giver.give(card, receiver);
        if (snapshot.damage) {
          const count = Math.min(Math.max(0, giver.hp), giver.countCards('h'));
          if (count > 0 && giver.isIn()) {
            await giver.chooseToDiscard('h', count, true).set('prompt', '德信：弃置等同于当前体力值的手牌（不足则全部弃置）');
          }
          if (!giver.isIn() || !receiver.isIn()) return;
          const virtual = { name: snapshot.name, suit: 'none', color: 'none', number: null, isCard: true };
          if (snapshot.name === 'sha') virtual.nature = snapshot.nature;
          // Native canUse(false, false) skips range/use count only; prohibitions,
          // card enable checks, target filters and multicheck remain effective.
          if (!giver.canUse(virtual, receiver, false, false)) return;
          const use = giver.useCard(virtual, [receiver], false);
          // Native useCard can run a card's changeTarget synchronously. The rule
          // starts with precisely the recipient; later skill target changes work.
          use.targets = [receiver];
          uses.add(use);
          await use;
        } else {
          state.limit = 2;
          if (giver.isIn()) await giver.draw(2);
          if (receiver.isIn()) await receiver.draw(2);
          if (player.isIn()) {
            const jacks = randomJacks();
            if (jacks.length) await player.gain(jacks, 'gain2');
          }
        }
      },
      ai: {
        order: 7,
        result: { target(player, target) { return get.attitude(player, target); } },
      },
    },
    [EFFECT]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      forceOut: true,
      trigger: { global: ['damageBegin1', 'damageAfter'] },
      filter(event, player, name) {
        if (event.player !== player || !relatedDamage(event)) return false;
        return name === 'damageBegin1' ? !increased.has(event) : !paid.has(event) && !!event.source?.isIn();
      },
      async content(event, trigger) {
        if (event.triggername === 'damageBegin1') {
          if (!increased.has(trigger)) {
            increased.add(trigger);
            trigger.num++;
          }
        } else if (!paid.has(trigger) && trigger.num > 0 && !trigger.unreal && trigger.source?.isIn()) {
          paid.add(trigger);
          await trigger.source.loseHp(1);
        }
      },
    },
  };

  function install() {
    game.addGlobalSkill(EFFECT);
  }
  api.dexin = { install };
  return {
    skills,
    translate: {
      [ID]: '德信',
      [EFFECT]: '德信',
      [ID + '_info']: '出牌阶段限一次，你可以交给一名其他角色一张牌，或令一名其他角色交给你一张牌（由给牌者从手牌和装备区选择）。若此牌为伤害牌，给牌者弃置等同于其当前体力值的手牌（不足则全部弃置），然后视为对获牌者使用一张同名牌（若为【杀】，属性相同），此牌无色无点数、无距离和次数限制且不计入次数，其每次伤害+1，每次造成伤害后，伤害来源失去1点体力；否则双方各摸两张牌，你从牌堆中随机获得两张J（不足则从弃牌堆补足），本出牌阶段此技能改为限两次。',
    },
  };
},
function (lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuyanghu_huangshi';
  const TAG = 'visible_' + ID;
  const useStates = new WeakMap();
  const compareStates = new WeakMap();
  const active = player => !!player?.hasSkill(ID);
  const shown = player => player.getShownCards();
  function comparison(event) {
    if (!event) return null;
    if (event.name === 'chooseToCompareEffect') return event.parentEvent || event;
    if (event.name?.startsWith('chooseToCompare') && event.name !== 'chooseToCompareLose') return event;
    const parent = event.relatedEvent || event.getParent?.();
    return parent && parent !== event ? comparison(parent) : null;
  }
  function participants(root) {
    const entries = new Map();
    for (const [player, cards] of root.lose_list || []) if (cards?.[0]) entries.set(player, cards[0]);
    if (root.card1 && (root.player || root.tempplayer)) entries.set(root.player || root.tempplayer, root.card1);
    if (root.cardlist && root.targets) root.targets.forEach((p, i) => entries.set(p, root.cardlist[i]));
    else if (root.card2 && get.itemtype(root.target) === 'player') entries.set(root.target, root.card2);
    return entries;
  }
  function snapshotCompare(root) {
    if (!root || compareStates.has(root)) return;
    const entries = participants(root);
    if (!entries.size) return;
    // Capture every participant before the first material leaves hand. In a
    // multiple comparison the qualifying player can be a later target.
    compareStates.set(root, [...entries].filter(([p, c]) => active(p) && get.number(c, p) === 11).map(([p]) => p));
  }
  function forceTie(event) {
    event.num1 = event.num2 = 11;
    delete event.forceWinner;
    event.winner = null;
    if (event.compareMeanwhile) event.maxNum = 11;
    const result = event.result;
    if (!result) return;
    for (const key of ['num1', 'num2']) {
      if (Array.isArray(result[key])) result[key] = (event.targets || result[key]).map(() => 11);
      else result[key] = 11;
    }
    if (event.compareMeanwhile) result.winner = null;
    else delete result.winner;
    result.bool = false;
    result.tie = true;
  }
  const skills = {
    [ID]: {
      locked: true, forced: true,
      trigger: { global: 'phaseUseBegin' },
      group: [ID + '_effect'],
      filter(event, player) { return active(player) && player.countCards('h') > 0; },
      async content(event, trigger, player) {
        const result = await player.chooseCard('h', [0, 1], '煌势：你可以明置一张手牌（直至其离开手牌区）')
          .set('ai', card => get.is.shownCard(card) ? 0 : 7 - get.value(card)).forResult();
        const card = result.cards?.[0];
        if (result.bool && card && player.getCards('h').includes(card)) await player.addShownCards([card], TAG);
      },
      mod: {
        cardnumber(card, player, number) {
          if (!active(player)) return;
          if (shown(player).includes(card)) return 11;
          // Native get.number inherits only when the virtual card does not
          // declare number at all. Explicit null and multi-material cards
          // keep their native no-number result.
          if (!('number' in card) && card.cards?.length === 1 && number !== null && shown(player).includes(card.cards[0])) return 11;
        },
      },
      ai: { threaten: 1.7 },
    },
    [ID + '_effect']: {
      charlotte: true, forced: true, popup: false,
      trigger: { player: 'useCardToPlayered' },
      filter(event, player) {
        const use = event.getParent('useCard');
        return active(player) && event.target !== player && useStates.get(use)?.jack && !useStates.get(use).applied;
      },
      async content(event, trigger, player) {
        const use = trigger.getParent('useCard');
        const state = useStates.get(use);
        state.applied = true;
        state.count = Math.min(3, shown(player).length);
        if (state.count) {
          player.logSkill(ID);
          use.effectCount += state.count;
        }
      },
    },
    [ID + '_snapshot']: {
      charlotte: true, forced: true, silent: true, popup: false,
      firstDo: true, priority: Infinity,
      trigger: { global: ['useCardBefore', 'loseAsyncBefore', 'loseBefore', 'compareCardShowBefore'] },
      filter(event, player) {
        if (!active(player)) return false;
        if (event.name === 'useCard') return event.player === player;
        return !!comparison(event);
      },
      async content(event, trigger, player) {
        if (trigger.name === 'useCard') useStates.set(trigger, { jack: get.number(trigger.card, player) === 11, applied: false });
        else snapshotCompare(comparison(trigger));
      },
    },
    [ID + '_compare']: {
      charlotte: true, forced: true, popup: false,
      lastDo: true, priority: -Infinity,
      trigger: { global: 'compareFixing' },
      filter(event, player) {
        const qualified = compareStates.get(comparison(event)) || [];
        return qualified.find(active) === player;
      },
      async content(event, trigger, player) {
        player.logSkill(ID);
        forceTie(trigger);
      },
    },
  };
  let installed = false;
  function install() {
    if (installed) return;
    installed = true;
    const nativeAutoViewAs = get.autoViewAs;
    get.autoViewAs = function (card, cards, owner) {
      const result = nativeAutoViewAs.apply(this, arguments);
      // Player.useCard calls autoViewAs without owner. Native VCard then
      // freezes the physical printed number for a one-card conversion,
      // before useCardBefore can recover whether that number was inherited.
      // Resolve only genuinely inherited numbers while the source still
      // exists, and let explicit numbers/null and owner=false remain native.
      if (owner !== false && card && typeof card === 'object' && !('number' in card)) {
        const materials = Array.isArray(cards) ? cards : card.cards;
        if (materials?.length === 1) {
          const player = owner || get.owner(materials[0]);
          if (active(player) && shown(player).includes(materials[0])) {
            const number = get.number({ ...card, cards: materials }, player);
            if (number === 11) result.number = number;
          }
        }
      }
      return result;
    };
    game.addGlobalSkill(ID + '_snapshot');
    game.addGlobalSkill(ID + '_compare');
  }
  api.huangshi = { install };
  return { skills, translate: {
    [ID]: '煌势',
    [ID + '_effect']: '煌势',
    [ID + '_compare']: '煌势',
    [TAG]: '煌势',
    [ID + '_info']: '锁定技，你的明置手牌点数视为J。每名角色的出牌阶段开始时，你可以明置一张手牌，直至其离开手牌区。你使用J牌指定其他角色为目标时，该牌额外结算X次（X为此时你剩余的明置手牌数，至多为3）。你以J牌参与拼点时，此次拼点均视为平局。',
  } };
},
function (lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuyanghu_mingxian';
  const TAG = 'visible_bjgy_wuyanghu_mingxian';
  const stages = new Map();
  const exposed = new Map();
  const synced = new WeakSet();
  const targeted = new WeakSet();
  let installed = false;

  function phaseUseOf(event) {
    const seen = new Set();
    while (event && !seen.has(event)) {
      if (event.name === 'phaseUse') return event;
      seen.add(event);
      event = event.parent || event.getParent?.();
    }
    return null;
  }

  function inPlay(player) {
    return Boolean(player && !player.removed && (!player.isIn || player.isIn()));
  }

  async function syncShown() {
    const eligible = new Map();
    for (const player of stages.values()) {
      if (inPlay(player)) for (const card of player.getCards('h')) eligible.set(card, player);
    }
    // Explicit card lists also clean cards that have left their old hand.
    // Never remove another skill's visible_ tag.
    for (const [card, player] of exposed) {
      if (eligible.get(card) !== player) {
        player.removeGaintag(TAG, [card]);
        exposed.delete(card);
      }
    }
    const pending = new Map();
    for (const [card, player] of eligible) {
      exposed.set(card, player);
      if (card.hasGaintag(TAG)) continue;
      if (!pending.has(player)) pending.set(player, []);
      pending.get(player).push(card);
    }
    for (const [player, cards] of pending) await player.addShownCards(cards, TAG);
  }

  function eligibleTarget(event, player) {
    const phase = phaseUseOf(event);
    const target = event.target;
    return stages.get(phase) === player && inPlay(player) && inPlay(target) && target !== player &&
      get.color(event.card, player) === 'black' && target.countCards('h') > player.countCards('h');
  }

  function install() {
    if (installed) return;
    installed = true;
    game.addGlobalSkill(ID + '_shown');
    game.addGlobalSkill(ID + '_discard');
  }

  const skills = {
    [ID]: {
      enable: 'phaseUse', limited: true,
      skillAnimation: true, animationColor: 'orange',
      filter(event, player) {
        const phase = phaseUseOf(event);
        return Boolean(inPlay(player) && !player.storage?.[ID] && phase && phase.player === player);
      },
      async content(event, trigger, player) {
        const phase = phaseUseOf(event);
        if (!phase || phase.player !== player || !inPlay(player) || player.storage?.[ID]) return;
        install();
        player.storage[ID] = true;
        player.awakenSkill(ID);
        stages.set(phase, player);
        // Attach to the exact phase, not a temporary skill expiring on the
        // next phaseUseAfter. Nested phases must not end this effect. The
        // cleanup has no player so death, removal or being out cannot skip it.
        phase.insertAfter(async function () {
          stages.delete(phase);
          await syncShown();
        }, {});
        await syncShown();
      },
      ai: { order: 9, result: { player: 1 }, threaten: 1.5 },
    },
    [ID + '_shown']: {
      trigger: { global: ['gainAfter', 'loseAfter', 'loseAsyncAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter', 'hideShownCardsAfter', 'dieAfter'] },
      forced: true, charlotte: true, silent: true, popup: false,
      firstDo: true, priority: 100000, forceDie: true, forceOut: true,
      filter(event) { return (stages.size > 0 || exposed.size > 0) && !synced.has(event); },
      async content(event, trigger) {
        if (synced.has(trigger)) return;
        synced.add(trigger);
        await syncShown();
      },
    },
    [ID + '_discard']: {
      trigger: { player: 'useCardToPlayered' },
      forced: true, charlotte: true, popup: false,
      filter(event, player) { return !targeted.has(event) && eligibleTarget(event, player); },
      async content(event, trigger, player) {
        // Native effectCount returns to card resolution after the target
        // declaration steps; each original declaration has one event here.
        if (targeted.has(trigger) || !eligibleTarget(trigger, player)) return;
        targeted.add(trigger);
        await player.discardPlayerCard({ target: trigger.target, position: 'he', selectButton: 1, forced: true });
      },
    },
  };
  const translate = {
    [ID]: '明贤',
    [ID + '_info']: '限定技。出牌阶段，你可以令本阶段你的所有手牌始终明置（包括此后获得的手牌）。本阶段你使用黑色牌指定其他角色为目标后，若其手牌数大于你，你弃置其一张牌。',
    [ID + '_discard']: '明贤',
    [TAG]: '明贤',
  };
  api.mingxian = { install, tag: TAG };
  return { skills, translate };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武羊祜',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   (lib.arenaReady??=[]).push(function installWuyanghu(){
    api.dexin.install();api.huangshi.install();api.mingxian.install();
   });
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wuyanghu:['male','qun',3,['bjgy_wuyanghu_dexin','bjgy_wuyanghu_huangshi','bjgy_wuyanghu_mingxian'],['die:false','ext:武羊祜/bjgy_wuyanghu.jpg']]},
    translate:{bjgy_wuyanghu:'武羊祜'},characterIntro:{bjgy_wuyanghu:'武羊祜，群、男性、初始体力3，体力上限3。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武羊祜：群、男、3/3。德信、煌势、明贤。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuyanghu.jpg'],card:[],skill:[],audio:[]}
 };
});
