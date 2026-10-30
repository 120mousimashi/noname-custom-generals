// 武吕蒙 v0.1.0 测试版。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助。
// 原创代码MIT；设计文字和GPT原画分别署名，见README与LICENSE。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function(lib,game,ui,get,ai,_status,api){
 const RECORD='bjgy_wulvmeng_record',CLOCK='bjgy_wulvmeng_clock';
 const frames=new WeakMap(),turns=new WeakMap(),completed=new WeakSet(),queued=new WeakSet(),callbacks=[];
 let installed=false;
 function inPlay(player){return Boolean(player&&typeof player.isIn==='function'&&player.isIn());}
 function ancestor(event,name){
  if(!event||typeof event!=='object')return null;if(event.name===name)return event;
  if(typeof event.getParent==='function'){const found=event.getParent(name,true,true);if(found?.name===name)return found;}
  const seen=new Set();for(let p=event.parent;p&&!seen.has(p);p=p.parent){if(p.name===name)return p;seen.add(p);}return null;
 }
 function turnOf(event){return ancestor(event||_status.event,'phase');}
 function phaseUseOf(event){return ancestor(event||_status.event,'phaseUse');}
 function useOf(event){return ancestor(event||_status.event,'useCard');}
 function frame(event){const use=useOf(event);return use?frames.get(use)||null:null;}
 function data(turn){if(!turn)return null;let value=turns.get(turn);if(!value){value={damageUsers:new Set()};turns.set(turn,value);}return value;}
 function usedDamage(player,event){return data(turnOf(event))?.damageUsers.has(player)||false;}
 function capture(use){
  if(frames.has(use)||!use.player)return;
  const player=use.player,limit=player.getHandcardLimit(),hp=player.hp,raw=get.number(use.card,player);
  const number=typeof raw==='number'&&Number.isFinite(raw)?raw:0;
  const branch=limit>hp?(number<limit?'low':number===limit?'equal':'high'):null;
  frames.set(use,Object.freeze({use,player,limit,hp,number,branch}));
 }
 function onTurnEnd(fn){if(!callbacks.includes(fn))callbacks.push(fn);}
 async function finishTurn(turn){if(!turn||completed.has(turn))return;completed.add(turn);for(const fn of callbacks)await fn(turn);}
 function queueCleanup(turn){
  if(!turn||!Array.isArray(turn.after)||queued.has(turn))return;queued.add(turn);data(turn);
  const event=game.createEvent('bjgy_wulvmeng_turn_cleanup',false,turn);
  event.player=turn.player;event.forceDie=true;event.includeOut=true;event._bjgy_wulvmeng_turn=turn;
  event.setContent(async function(event){await finishTurn(event._bjgy_wulvmeng_turn);});
  const at=turn.next?.indexOf(event)??-1;if(at>=0)turn.next.splice(at,1);turn.after.push(event);
 }
 function install(){if(installed)return;installed=true;game.addGlobalSkill(RECORD);game.addGlobalSkill(CLOCK);}
 api.core={inPlay,turnOf,phaseUseOf,usedDamage,frame,useOf,onTurnEnd,finishTurn,install};
 return {skills:{
  [RECORD]:{charlotte:true,silent:true,forced:true,popup:false,forceDie:true,forceOut:true,firstDo:true,priority:10000000,
   trigger:{global:['useCardBefore','useCard1']},
   async content(event,trigger){
    capture(trigger);
    if(event.triggername==='useCard1'&&get.tag(trigger.card,'damage'))data(turnOf(trigger))?.damageUsers.add(trigger.player);
   }},
  [CLOCK]:{charlotte:true,silent:true,forced:true,popup:false,forceDie:true,forceOut:true,lastDo:true,priority:-10000000,
   trigger:{global:['phaseBegin','phaseAfter','phaseCancelled','phaseSkipped']},
   async content(event,trigger){if(event.triggername==='phaseBegin')queueCleanup(trigger);else await finishTurn(trigger);}},
 },translate:{},content:install};
},
function createLimits(lib, game, ui, get, ai, _status, api) {
  const STATE = 'bjgy_wulvmeng_limit_state';
  const UNLIMITED = 'bjgy_wulvmeng_unlimited';
  const DRAW_SIX = 'bjgy_wulvmeng_compensation';
  const VIDEO_SIX = 'bjgy_wulvmeng_permanent_six';
  const KEXIAN = 'bjgy_wulvmeng_kexian';
  const unlimited = new Map();
  let installed = false;

  function state(player) {
    player.storage ??= {};
    return player.storage[STATE] ??= { delta: 0, fixedSix: false };
  }

  function syncState(player) {
    const snapshot = { ...state(player) };
    game.broadcastAll(function (target, key, value) {
      target.storage ??= {};
      target.storage[key] = value;
    }, player, STATE, snapshot);
    player.syncStorage?.(STATE);
  }

  function value(player) {
    return player.getHandcardLimit();
  }

  function adjust(player, delta) {
    if (!Number.isFinite(delta)) throw new TypeError('Hand limit delta must be finite');
    const data = state(player);
    data.delta += delta;
    syncState(player);
    return value(player);
  }

  function lockSix(player) {
    const before = value(player);
    state(player).fixedSix = true;
    syncState(player);
    return Math.max(0, before - 6);
  }

  // This function is sent through broadcastAll, so it must be self-contained.
  // Only change the physical rank and its visible rank nodes: Card.init would
  // erase gaintags, vanish tags, custom storage and other extensions' marks.
  function writePhysicalSix(cards, oldLabels, suitLabels) {
    cards.forEach(function (card, index) {
      if (!card || typeof card !== 'object') return;
      card.number = 6;
      const node = card.node;
      if (!node) return;
      if (node.number) node.number.textContent = '6';
      const spans = node.info?.querySelectorAll?.('span');
      if (spans?.length) spans[spans.length - 1].textContent = '6';
      if (node.name2 && typeof node.name2.innerHTML === 'string') {
        const prefix = suitLabels[index] + oldLabels[index];
        if (node.name2.innerHTML.startsWith(prefix)) {
          node.name2.innerHTML = suitLabels[index] + '6' + node.name2.innerHTML.slice(prefix.length);
        }
      }
    });
  }

  function permanentSix(cards) {
    const physical = Array.from(new Set(cards || [])).filter(card => get.itemtype(card) === 'card');
    if (!physical.length) return;
    const oldLabels = physical.map(card => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.number] || String(card.number ?? '')));
    const suitLabels = physical.map(card => get.translation(card.suit));
    game.broadcastAll(writePhysicalSix, physical, oldLabels, suitLabels);
    game.addVideo(VIDEO_SIX, null, [get.cardsInfo(physical), oldLabels, suitLabels]);
  }

  function grantUnlimited(player, event) {
    const turn = api.core.turnOf(event || _status.event);
    if (turn) unlimited.set(player, turn);
  }

  function hasUnlimited(player, event) {
    const turn = api.core.turnOf(event || _status.event);
    return !!turn && unlimited.get(player) === turn;
  }

  function compensationDraw(event) {
    // Native Content.draw creates its gain as a direct child. A later draw or
    // gain inside one of its reactions is a separate effect, not compensation.
    const draw = event?.parent;
    return draw?.name === 'draw' && draw[DRAW_SIX] ? draw : null;
  }

  function install() {
    if (installed) return;
    installed = true;
    game.addGlobalSkill(STATE);
    game.addGlobalSkill(UNLIMITED);
    game.addGlobalSkill(DRAW_SIX);
    game.videoContent[VIDEO_SIX] = function (record) {
      writePhysicalSix(get.infoCards(record[0]), record[1], record[2]);
    };
    api.core.onTurnEnd(function (turn) {
      for (const [player, activeTurn] of unlimited) {
        if (activeTurn === turn) unlimited.delete(player);
      }
    });
  }

  api.limits = { value, adjust, lockSix, permanentSix, grantUnlimited, hasUnlimited, install };

  const skills = {
    [STATE]: {
      charlotte: true,
      forced: true,
      silent: true,
      forceDie: true,
      // Player.getModableSkills sorts mods by increasing priority. Apply this
      // permanent final delta/lock after the engine's ordinary limit modifiers.
      priority: 1e9,
      mod: {
        maxHandcardFinal(player, number) {
          const data = player.storage?.[STATE];
          if (data?.fixedSix) return 6;
          if (data?.delta) return number + data.delta;
        },
      },
    },
    [UNLIMITED]: {
      charlotte: true,
      forced: true,
      silent: true,
      forceDie: true,
      firstDo: true,
      priority: 1e8,
      trigger: { global: ['useCardBefore', 'useCard1'] },
      filter(event, player) {
        return event.player === player && hasUnlimited(event.player, event);
      },
      async content(event, trigger, player) {
        // Before catches the native counter before it increments. useCard1 is
        // a fallback for uses already counted or altered by another skill.
        if (event.triggername === 'useCard1' && trigger.addCount !== false) {
          const counts = trigger.player.getStat().card;
          const name = trigger.card?.name;
          if (typeof counts[name] === 'number' && counts[name] > 0) counts[name]--;
        }
        trigger.addCount = false;
      },
      mod: {
        targetInRange(card, player) {
          if (hasUnlimited(player, _status.event)) return true;
        },
        cardUsable(card, player) {
          if (hasUnlimited(player, _status.event)) return Infinity;
        },
      },
    },
    [DRAW_SIX]: {
      charlotte: true,
      forced: true,
      silent: true,
      forceDie: true,
      firstDo: true,
      priority: 1e8,
      trigger: { global: 'gainBefore' },
      filter(event, player) {
        return event.player === player && !!compensationDraw(event);
      },
      async content(event, trigger, player) {
        permanentSix(trigger.cards);
      },
    },
    [KEXIAN]: {
      enable: 'phaseUse',
      limited: true,
      unique: true,
      skillAnimation: true,
      animationColor: 'wood',
      filter(event, player) {
        return !player.storage[KEXIAN];
      },
      async content(event, trigger, player) {
        if (player.storage[KEXIAN]) return;
        player.awakenSkill(KEXIAN);
        player.storage[KEXIAN] = true;
        player.syncStorage?.(KEXIAN);
        const reduction = lockSix(player);
        grantUnlimited(player, event);
        if (reduction > 0) {
          const draw = player.draw(reduction);
          draw[DRAW_SIX] = true;
          const result = await draw.forResult();
          permanentSix(result?.cards || []);
        }
      },
      ai: { order: 10, result: { player: 1 } },
    },
  };

  const translate = {
    [KEXIAN]: '克贤',
    [KEXIAN + '_info']: '限定技，出牌阶段，你将本局的最终手牌上限固定为6。若此前手牌上限大于6，你摸等同于减少值的牌，此次实际摸到的牌永久变为6点。本实际回合内，你使用牌无距离和次数限制，且不计入使用次数。',
    [STATE]: '克贤·上限',
    [UNLIMITED]: '克贤·畅用',
    [DRAW_SIX]: '克贤·六点',
  };

  return { skills, translate, content: install };
},
function createZhiji(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wulvmeng_zhiji';

  // Choose uniformly among matching cards, keeping the draw pile strictly
  // ahead of the discard pile. A random traversal start would bias matches.
  function findSix() {
    for (const pile of [ui.cardPile, ui.discardPile]) {
      const cards = Array.from(pile.childNodes).filter(card => get.number(card) === 6);
      if (cards.length) return cards[get.rand(0, cards.length - 1)];
    }
    return null;
  }

  return {
    skills: {
      [ID]: {
        trigger: { global: 'phaseEnd' },
        filter(event, player) {
          return api.core.inPlay(player) && !api.core.usedDamage(player, event);
        },
        check() {
          return true;
        },
        async content(event, trigger, player) {
          await player.recover(1);
          const card = findSix();
          if (card) await player.gain(card, 'gain2');
          api.limits.adjust(player, 1);
        },
        ai: { threaten: 1.6 },
      },
    },
    translate: {
      [ID]: '制己',
      [`${ID}_info`]: '每个回合结束时，若你本回合未使用过伤害牌，你可以回复1点体力，然后优先从牌堆、其次从弃牌堆中随机获得一张当前点数为6的牌，并令你本局游戏的手牌上限永久+1。满体力或未找到符合条件的牌不影响后续效果。若“克贤”已将你的最终手牌上限固定为6，此增量不改变最终上限。',
    },
  };
},
function fujingModule(lib, game, ui, get, ai, _status, api) {
  const main = 'bjgy_wulvmeng_fujing';
  const effects = main + '_effects';
  const confirmed = new WeakMap();
  const damaged = new WeakSet();
  const targetRecords = new WeakMap();
  let installed = false;

  function inPlay(player) {
    return !!api.core.inPlay(player);
  }

  function parentOf(event) {
    return event?.parent || event?.getParent?.() || null;
  }

  function canActivate(use, player) {
    const frame = api.core.frame(use);
    return !!frame?.branch && frame.use === use && frame.player === player && inPlay(player) && !confirmed.has(use);
  }

  function lockResponses(use) {
    if (!Array.isArray(use.directHit)) use.directHit = [];
    // The installed standard _wuxie checks this same useCard.directHit list
    // before asking any player for 无懈. Include the user as well as targets.
    for (const player of game.players.concat(game.dead || [])) {
      if (!use.directHit.includes(player)) use.directHit.push(player);
    }
  }

  async function activate(use, player) {
    if (!canActivate(use, player)) return false;
    const frame = api.core.frame(use);
    confirmed.set(use, frame);
    install();
    if (frame.branch === 'low') lockResponses(use);
    else if (frame.branch === 'high') {
      if (frame.limit > 6) {
        api.limits.adjust(player, -1);
        await player.draw(2);
      } else await player.draw(1);
    }
    return true;
  }

  function cardEffect(effect, use) {
    if (!effect || use?.name !== 'useCard' || effect.card !== use.card || effect.player !== use.player || effect.skill !== use.skill) return false;
    if (effect.type === 'card') return effect.name === use.card.name;
    if (effect.type === 'precard') return effect.name === use.card.name + 'ContentBefore';
    if (effect.type === 'postcard') return effect.name === use.card.name + 'ContentAfter';
    return false;
  }

  function damageOrigin(event, seen = new Set()) {
    if (event?.name !== 'damage' || seen.has(event)) return null;
    seen.add(event);
    const parent = parentOf(event);
    if (parent?.name === '_lianhuan') {
      // Native chain damage is the one skill boundary allowed to inherit a
      // card's damage. A descendant skill carrying that card is insufficient.
      const original = parent._trigger || parent.getTrigger?.();
      if (original?.name !== 'damage' || original.num <= 0 || original.unreal || original.card !== event.card || original.source !== event.source) return null;
      return damageOrigin(original, seen);
    }
    const use = parentOf(parent);
    return cardEffect(parent, use) && event.card === use.card ? use : null;
  }

  function qualifiesDamage(event, player) {
    if (event?.name !== 'damage' || !(event.num > 0) || event.unreal || damaged.has(event) || !inPlay(player)) return false;
    const use = damageOrigin(event);
    const frame = use && confirmed.get(use);
    // Damage source may be the opponent in 决斗, or the recipient may be self.
    return frame?.branch === 'low' && frame.player === player;
  }

  function canTakeHeart(card, player, victim) {
    return get.suit(card, victim) === 'heart' && lib.filter.canBeGained(card, player, victim, main);
  }

  async function resolveDamage(event, player) {
    if (!qualifiesDamage(event, player)) return false;
    damaged.add(event);
    const victim = event.player;
    if (!victim?.getCards) return true;
    // viewHandcards uses the native private viewCards event; showCards would
    // publish the victim's hand to every player. Viewing still happens if the
    // hand has no heart (or is empty).
    await player.viewHandcards(victim);
    // Native gain records statistics before discarding cards already in the
    // recipient's hand. Self damage must not create a redundant gain event.
    if (!inPlay(player) || victim === player) return true;
    const hearts = victim.getCards('h').filter(card => canTakeHeart(card, player, victim));
    if (!hearts.length) return true;
    const result = await player.choosePlayerCard(victim, 'h', 'visible', true)
      .set('prompt', '复荆：获得' + get.translation(victim) + '的一张红桃手牌')
      .set('filterButton', button => canTakeHeart(button.link, player, victim))
      .set('ai', button => get.value(button.link, player))
      .forResult();
    const card = result.cards?.[0];
    if (result.bool && card && inPlay(player) && victim.getCards('h').includes(card) && canTakeHeart(card, player, victim)) {
      await player.gain([card], victim, 'giveAuto');
    }
    return true;
  }

  function targetFrame(event, player) {
    if (event?.name !== 'useCardToPlayered' || !inPlay(player)) return null;
    const frame = api.core.frame(event);
    if (frame?.player !== player || confirmed.get(frame.use)?.branch !== 'equal') return null;
    return frame;
  }

  function canTarget(event, player) {
    const frame = targetFrame(event, player);
    const target = event?.target;
    return !!frame && !!target && inPlay(target) && !!frame.use.targets?.includes(target) && !targetRecords.get(frame.use)?.has(target);
  }

  async function resolveTarget(event, player) {
    if (!canTarget(event, player)) return false;
    const frame = api.core.frame(event);
    let settled = targetRecords.get(frame.use);
    if (!settled) targetRecords.set(frame.use, settled = new WeakSet());
    const target = event.target;
    settled.add(target);
    let recover = false;
    if (target.isDamaged()) {
      const result = await player.chooseControl(['失去1点体力', '回复1点体力'])
        .set('prompt', '复荆：令' + get.translation(target) + '失去或回复1点体力')
        .set('ai', () => get.attitude(player, target) > 0 ? 1 : 0)
        .forResult();
      recover = result.control === '回复1点体力';
    }
    if (!inPlay(player) || !inPlay(target)) return true;
    if (recover && target.isDamaged()) await target.recover(1);
    else await target.loseHp(1);
    return true;
  }

  function install() {
    if (installed) return;
    game.addGlobalSkill(effects);
    installed = true;
  }

  api.fujing = { activate, damageOrigin, qualifiesDamage, canTarget, resolveTarget, resolveDamage, install };
  return {
    skills: {
      [main]: {
        forced: true,
        trigger: { player: 'useCard' },
        filter(event, player) { return canActivate(event, player); },
        async content(event, trigger, player) { await activate(trigger, player); },
        ai: { threaten: 2.2 },
      },
      [effects]: {
        charlotte: true, forced: true, silent: true, popup: false,
        // Global registration keeps a confirmed card's effects after skill
        // removal. The stored user check prevents every other holder from
        // resolving the same global trigger. Death still stops user actions.
        trigger: { global: ['damageEnd', 'useCardToPlayered'] },
        filter(event, player) { return qualifiesDamage(event, player) || canTarget(event, player); },
        async content(event, trigger, player) {
          if (trigger.name === 'damage') await resolveDamage(trigger, player);
          else await resolveTarget(trigger, player);
        },
      },
    },
    translate: {
      [main]: '复荆',
      [main + '_info']: '锁定技，你使用牌时，记录当前手牌上限M、体力值及此牌点数N（无点数视为0）。若M大于体力值：N小于M，此牌不能被响应，此牌每次实际造成伤害后，你观看受伤角色的全部手牌并获得其中一张红桃；N等于M，你分别令此牌每名目标失去或回复1点体力（满体力只能失去）；N大于M，若M大于6，你本局手牌上限增量减1并摸两张牌，否则摸一张牌。各分支以使用时记录为准。',
    },
    async content() { install(); },
  };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武吕蒙',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   // Native loading registers package skills after content; arenaReady is
   // drained synchronously, so install every helper without awaiting between.
   (lib.arenaReady??=[]).push(function installWulvmeng(){api.core.install();api.limits.install();api.fujing.install();});
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wulvmeng:['male','wu','3/6',['bjgy_wulvmeng_zhiji','bjgy_wulvmeng_fujing','bjgy_wulvmeng_kexian'],['die:false','ext:武吕蒙/bjgy_wulvmeng.jpg']]},
    translate:{bjgy_wulvmeng:'武吕蒙'},characterIntro:{bjgy_wulvmeng:'武吕蒙，吴、男性、初始体力3，体力上限6。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武吕蒙：吴、男、3/6。制己、复荆、克贤，含手牌上限成长、固定为六及永久六点牌，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wulvmeng.jpg'],card:[],skill:[],audio:[]}
 };
});
