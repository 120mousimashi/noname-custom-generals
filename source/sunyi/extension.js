// 孙伊 v0.1.0 测试版；技能设计：辟境归元；实现与打包：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createZhangua(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_sunyi_zhangua';
 const isIn=player=>!!player&&player.isIn();
 let installed=false;
 api.zhangua={install(){if(installed)return;installed=true;}};

 function wasGiven(choice,result,giver,recipient){
  const card=result?.cards?.[0],gain=choice.done;
  if(!result?.bool||result.cards.length!==1||!card||!gain||gain.player!==recipient||gain.giver!==giver)return false;
  // Native self-gain records the gain before it removes the already-owned
  // hand card from gain.cards. It deliberately creates no loss in this case.
  if(!recipient.getHistory('gain').includes(gain))return false;
  if(giver===recipient)return recipient.getCards('h').includes(card);
  return gain.getg(recipient).includes(card)&&gain.getl(giver).hs.includes(card);
 }

 async function blackDamage(source){
  if(!isIn(source)||!game.hasPlayer(target=>isIn(target)&&target!==source))return;
  const result=await source.chooseTarget('占卦：选择一名其他角色，对其造成1点普通伤害',true,
   (card,player,target)=>target!==player&&target.isIn())
   .set('forced',true)
   .set('ai',target=>get.damageEffect(target,source,source))
   .forResult();
  const target=result.targets?.[0];
  if(!isIn(source)||!isIn(target)||target===source)return;
  await target.damage({num:1,source,nocard:true});
 }

 return {
  skills:{
   [ID]:{
    trigger:{global:'phaseBegin'},
    group:['bjgy_sunyi_zhangua_judge'],
    forced:true,
    locked:false,
    popup:false,
    forceDie:true,
    filter(event,player){
     return isIn(player)&&isIn(event.player)&&event.player.getCards('h').some(card=>lib.filter.canBeGained(card,player,event.player));
    },
    async content(event,trigger,player){
     const current=trigger.player;
     if(!isIn(player)||!isIn(current))return;
     const choice=current.chooseToGive({target:player,position:'h',selectCard:[1,1],forced:false,
      prompt:'占卦：你可以交给'+get.translation(player)+'一张手牌，令其选择是否进行判定'});
     const result=await choice.forResult();
     if(!wasGiven(choice,result,current,player)||!isIn(player)||!isIn(current))return;
     const consent=await player.chooseBool('占卦：是否进行判定？')
      .set('prompt2','红色：你与当前回合角色各摸两张牌；黑色：你与其依次各选择一名其他角色，造成1点普通伤害')
      .set('ai',()=>true).forResult();
     if(!consent.bool||!isIn(player)||!isIn(current))return;
     player.logSkill(ID);
     const judged=await player.judge(ID,card=>card.color==='red'?1:card.color==='black'?-1:0).forResult();
     if(judged.color==='red'){
      if(isIn(player))await player.draw(2);
      if(isIn(current))await current.draw(2);
     }else if(judged.color==='black'){
      await blackDamage(player);
      await blackDamage(current);
     }
    },
   },
  },
  translate:{
   [ID]:'占卦',
   [ID+'_info']:'每回合开始时，当前回合角色可以交给你一张手牌，然后你可以进行一次判定：红色，你与该角色各摸两张牌；黑色，你与该角色依次各对一名其他角色造成1点普通伤害。允许自己交给自己并分别结算两次。你进行判定时，可以弃置一张手牌，根据所弃牌颜色、当前判定牌颜色的顺序执行：红黑，摸1并获得原判定牌，本次判定以弃置牌完整信息为准；红红，视为使用一张基本牌；黑红，弃置一名其他角色两张牌，本次判定以弃置牌完整信息为准；黑黑，视为使用一张普通锦囊牌（每轮每种牌名限一次）。每次判定此效果至多发动一次，印牌遵守正常距离和次数限制，无合法选项则无事发生。',
  },
 };
},
function createDivination(lib, game, ui, get, ai, _status, api) {
  const id = 'bjgy_sunyi_zhangua_judge';
  const attempted = new WeakSet();
  const isColor = color => color === 'red' || color === 'black';
  const discardable = (card, player) => lib.filter.cardDiscardable(card, player, id);
  const roundKey = '占卦本轮锦囊';

  function usedNames(player) {
    const state = player.storage[roundKey];
    return state?.round === game.roundNumber ? state.names : [];
  }

  function legalUse(card, player) {
    if (!lib.filter.cardEnabled(card, player) || !lib.filter.cardUsable(card, player, _status.event)) return false;
    return !!get.info(card)?.notarget || player.hasUseTarget(card, null, true);
  }

  async function printCard(player, type) {
    const entries = [];
    for (const name of lib.inpile) {
      if (get.type(name) !== type || (type === 'trick' && usedNames(player).includes(name))) continue;
      const natures = name === 'sha' ? [undefined, ...lib.inpile_nature] : [undefined];
      for (const nature of natures) {
        const card = { name, isCard: true };
        if (nature) card.nature = nature;
        if (legalUse(card, player)) entries.push([type, '', name, nature]);
      }
    }
    if (!entries.length) return;
    const result = await player.chooseButton(['占卦：视为使用一张' + (type === 'basic' ? '基本牌' : '普通锦囊牌'), [entries, 'vcard']], true)
      .set('ai', button => player.getUseValue({ name: button.link[2], nature: button.link[3], isCard: true })).forResult();
    const selected = result.links?.[0];
    if (!result.bool || !selected || !entries.some(entry => entry[2] === selected[2] && entry[3] === selected[3])) return;
    const card = { name: selected[2], isCard: true };
    if (selected[3]) card.nature = selected[3];
    if (!legalUse(card, player) || (type === 'trick' && usedNames(player).includes(card.name))) return;
    const choice = player.chooseUseTarget(card, true);
    if (type === 'trick') {
      // Native useCard invokes oncard at its actual use entrance, before card
      // effects or nested judges. Failed target selection/canceled use costs no
      // name; successful nested uses already see this name as consumed.
      choice.set('oncard', function () {
        let state = player.storage[roundKey];
        if (state?.round !== game.roundNumber) state = player.storage[roundKey] = { round: game.roundNumber, names: [] };
        if (!state.names.includes(card.name)) state.names.push(card.name);
        player.syncStorage(roundKey);
      });
    }
    await choice;
  }

  function fallbackResult(trigger, player, original, snapshot) {
    const previous = Object.getOwnPropertyDescriptor(trigger, 'fixedResult');
    let replaced = false, assigned;
    let active = true;
    const baseline = () => replaced ? assigned : previous?.get ? previous.get.call(trigger) : previous?.value;
    const fallback = { ...baseline(), ...snapshot };
    Object.defineProperty(trigger, 'fixedResult', {
      configurable: true,
      enumerable: previous?.enumerable ?? true,
      get() {
        const value = baseline();
        // The judge consumes fixedResult before shifting judging. A later
        // physical rejudge automatically supersedes this event-local snapshot.
        return active && player.judging[0] === original ? fallback : value;
      },
      set(value) {
        active = false;
        if (previous?.set) previous.set.call(trigger, value);
        else { replaced = true; assigned = value; }
      },
    });
  }

  async function replaceJudge(trigger, player, snapshot, original, gainOriginal) {
    const discarded = snapshot.card;
    // Content.judge queues the revealed card's movement before invoking its
    // rejudge timing, then awaits it afterward. Complete that one native move
    // before gaining/discarding the placeholder, including the snapshot path.
    const revealedMove = trigger.next.find(next => next.name === 'cardsGotoOrdering' && next.cards?.includes(original));
    if (revealedMove) await revealedMove;
    // This is an actual rejudge, so the installed judge builds its result from
    // the replacement card and later rejudge skills retain normal precedence.
    const physical = get.position(discarded, true) === 'd' && !get.owner(discarded, 'judge');
    if (original.clone) {
      original.clone.classList.remove('thrownhighlight');
      game.broadcast(function (card) {
        if (card.clone) card.clone.classList.remove('thrownhighlight');
      }, original);
      game.addVideo('deletenode', player, get.cardsInfo([original.clone]));
    }
    trigger.orderingCards ??= [];
    trigger.orderingCards.remove(original);
    if (physical) {
      await game.cardsGotoOrdering(discarded).set('relatedEvent', trigger);
      player.judging[0] = discarded;
    } else {
      // A paid discard may already have been gained by another skill. Preserve
      // its full result without stealing it, duplicating it, or suppressing the
      // rest of this branch. A metadata-only vcard is a safe placeholder: later
      // native guicai/guidao cannot discard or gain either already-owned card.
      const placeholder = { name: snapshot.name, suit: snapshot.suit, number: snapshot.number, isCard: true };
      player.judging[0] = placeholder;
      fallbackResult(trigger, player, placeholder, snapshot);
    }
    if (!get.owner(original, 'judge') && ['o', 'd'].includes(get.position(original, true))) {
      if (gainOriginal) await player.gain(original, 'gain2');
      else await game.cardsDiscard(original);
    }
    game.log(player, '的判定牌改为', discarded);
  }

  api.divination = { install() {} };
  return {
    skills: {
      [id]: {
        trigger: { player: 'judge' },
        direct: true,
        popup: false,
        filter(event, player) {
          return !attempted.has(event) && event.player === player &&
            !!player.judging[0] && isColor(get.color(player.judging[0])) &&
            player.countCards('h', card => discardable(card, player)) > 0;
        },
        async content(event, trigger, player) {
          if (attempted.has(trigger)) return;
          attempted.add(trigger);
          const choice = player.chooseToDiscard('占卦：可以弃置一张手牌', 'h', 1)
            .set('filterCard', card => discardable(card, player))
            .set('ai', card => 6 - get.value(card));
          const result = await choice.forResult();
          const discarded = result.cards?.[0];
          const loss = choice.done?.done;
          // A selection is not payment: validate the actual native discard loss.
          if (!result.bool || !discarded || !loss || loss.type !== 'discard' || !loss.cards2?.includes(discarded)) return;
          player.logSkill('bjgy_sunyi_zhangua');
          const original = player.judging[0];
          if (!original) return;
          const snapshot = Object.freeze({ card: discarded, name: discarded.name,
            suit: get.suit(discarded, false), number: get.number(discarded, false), color: get.color(discarded, false) });
          const left = snapshot.color, right = get.color(original);
          if (!isColor(left) || !isColor(right)) return;
          if (left === 'red' && right === 'black') {
            await player.draw(1);
            await replaceJudge(trigger, player, snapshot, original, true);
          } else if (left === 'black' && right === 'red') {
            const selection = await player.chooseTarget('占卦：弃置一名其他角色的两张牌', true,
              (card, source, target) => target !== source && target.countCards('he') > 0)
              .set('ai', target => -get.attitude(player, target)).forResult();
            const target = selection.targets?.[0];
            if (selection.bool && target) await player.discardPlayerCard(target, 'he', 2, true);
            await replaceJudge(trigger, player, snapshot, original, false);
          } else if (left === 'red' && right === 'red') {
            await printCard(player, 'basic');
          } else if (left === 'black' && right === 'black') {
            await printCard(player, 'trick');
          }
        },
      },
    },
    translate: {},
  };
},
function createShaoyi(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_sunyi_shaoyi';
  const EFFECT = ID + '_effect', COMMIT = ID + '_commit', DRAW = ID + '_draw';
  const CAST = ID + '_cast';
  const phaseStates = new WeakMap(), activeUses = new WeakMap();
  const pending = player => player.storage[EFFECT] || { damage: 0, drawLayers: 0 };
  function phaseOf(player, event = _status.event) {
    const seen = new Set();
    while (event && !seen.has(event)) {
      seen.add(event);
      if (event.name === 'phaseUse') return event.player === player ? event : null;
      event = event.parent || event.getParent?.();
    }
    return null;
  }
  function quota(player, phase = phaseOf(player)) {
    const state = phase && phaseStates.get(phase);
    return { used: state?.used || 0, limit: state?.limit || 1, nextX: (state?.used || 0) + 1 };
  }
  function mutableQuota(phase) {
    let state = phaseStates.get(phase);
    if (!state) phaseStates.set(phase, state = { used: 0, limit: 1 });
    return state;
  }
  function refresh(player) {
    player.syncStorage(EFFECT);
    if (pending(player).damage || pending(player).drawLayers) player.markSkill(EFFECT);
    else player.unmarkSkill(EFFECT);
  }
  function freeze(player, cards, phase) {
    const colors = { phase, red: 0, black: 0 };
    for (const card of cards) {
      const color = get.color(card, player);
      if (color === 'red' || color === 'black') colors[color]++;
    }
    return colors;
  }
  function hasUsed(player, use) {
    return player.actionHistory.some(history => history.useCard?.includes(use));
  }
  function damageUse(event) {
    const seen = new Set();
    while (event && !seen.has(event)) {
      seen.add(event);
      if (event.name === 'useCard') return event;
      event = event.parent || event.getParent?.();
    }
    return null;
  }
  const skills = {
    [ID]: {
      enable: 'phaseUse', position: 'he', locked: false,
      filter(event, player) {
        const phase = phaseOf(player, event), q = quota(player, phase);
        return !!phase && q.used < q.limit && player.countCards('he') >= q.nextX;
      },
      viewAs: { name: 'sha', storage: { [ID]: true } },
      viewAsFilter(player) { return skills[ID].filter(_status.event, player); },
      filterCard(card, player) { return player.getCards('he').includes(card); },
      selectCard() { return [quota(_status.event.player).nextX, Infinity]; },
      async precontent(event, trigger, player) {
        event.getParent().addCount = false;
        event.result._apply_args ??= {};
        event.result._apply_args[CAST] = freeze(player, event.result.cards, phaseOf(player, event));
      },
      mod: { cardUsable(card) { if (card.storage?.[ID]) return Infinity; } },
      check(card) { return 6 - get.value(card); },
      ai: { order: 3 },
    },
    [EFFECT]: {
      charlotte: true, forced: true, silent: true, popup: false, firstDo: true, priority: Infinity,
      trigger: { player: 'useCardBefore' },
      filter(event, player) {
        return get.name(event.card, player) === 'sha' && !activeUses.has(event) &&
          (!!event.card.storage?.[ID] || pending(player).damage > 0 || pending(player).drawLayers > 0);
      },
      async content(event, trigger, player) {
        const benefits = { ...pending(player) };
        const cast = trigger.card.storage?.[ID] ? trigger[CAST] || freeze(player, trigger.cards, phaseOf(player, trigger)) : null;
        const record = { ...benefits, cast, committed: false, x: 0 };
        activeUses.set(trigger, record);
        player.storage[EFFECT] = { damage: 0, drawLayers: 0 };
        if (cast) trigger.addCount = false;
        if (benefits.damage) trigger.baseDamage = (typeof trigger.baseDamage === 'number' ? trigger.baseDamage : get.info(trigger.card, false).baseDamage || 1) + benefits.damage;
        refresh(player);
        // Native after events run after this complete use, including all targets,
        // repeated effects, responses and damage. New rewards cannot affect it.
        trigger.insertAfter(async function () {
          try {
            if (!hasUsed(player, trigger)) {
              const next = pending(player);
              player.storage[EFFECT] = { damage: next.damage + benefits.damage, drawLayers: next.drawLayers + benefits.drawLayers };
              refresh(player);
              return;
            }
            if (!cast?.phase || !record.committed || !player.isIn()) return;
            const unequal = cast.red !== cast.black;
            if (unequal) await player.loseHp();
            else await player.recover();
            if (!player.isIn()) return;
            const majority = cast.red > cast.black ? 'red' : 'black';
            const result = await player.judge(judge => unequal ? (judge.color === majority ? 1 : -1) : (get.tag({ name: judge.name }, 'damage') ? 1 : -1)).forResult();
            if (!player.isIn() || !result?.card) return;
            const success = unequal ? result.color === majority : !!get.tag({ name: result.name }, 'damage');
            if (!success) return;
            mutableQuota(cast.phase).limit++;
            const next = { ...pending(player) };
            if (unequal) next.damage += record.x;
            else next.drawLayers++;
            player.storage[EFFECT] = next;
            refresh(player);
          } finally { activeUses.delete(trigger); }
        }, { player, forceDie: true, includeOut: true });
      },
      marktext: '翊',
      intro: { content(storage, player) {
        const next = pending(player), parts = [];
        if (next.damage) parts.push('下一张使用的杀伤害+' + next.damage);
        if (next.drawLayers) parts.push('该杀每次造成伤害后摸' + 2 * next.drawLayers + '张牌');
        return parts.join('；') || '暂无待生效收益';
      } },
    },
    [COMMIT]: {
      charlotte: true, forced: true, silent: true, popup: false, firstDo: true, priority: Infinity,
      trigger: { player: 'useCard0' },
      filter(event) { const record = activeUses.get(event); return !!record?.cast?.phase && !record.committed; },
      async content(event, trigger) {
        const record = activeUses.get(trigger);
        record.committed = true;
        record.x = ++mutableQuota(record.cast.phase).used;
      },
    },
    [DRAW]: {
      charlotte: true, forced: true, silent: true, popup: false,
      trigger: { source: 'damageSource' },
      filter(event, player) {
        const use = damageUse(event), record = use && activeUses.get(use);
        return !event.unreal && event.num > 0 && use?.player === player && event.card === use.card &&
          get.name(use.card, player) === 'sha' && record?.drawLayers > 0;
      },
      async content(event, trigger, player) { await player.draw(2 * activeUses.get(damageUse(trigger)).drawLayers); },
    },
  };
  let installed = false;
  api.shaoyi = { state: player => ({ ...pending(player) }), quota,
    install() { if (installed) return; installed = true; for (const skill of [EFFECT, COMMIT, DRAW]) game.addGlobalSkill(skill); },
  };
  return { skills, translate: {
    [ID]: '绍翊', [EFFECT]: '绍翊', [COMMIT]: '绍翊', [DRAW]: '绍翊',
    [ID + '_info']: '出牌阶段限一次，你可以将至少X张手牌或装备牌当做一张不计次且无次数限制的普通【杀】使用（距离限制照常，X为本阶段实际发动次数）。此【杀】结算后，若素材中红、黑牌数量不等，你失去1点体力并判定，若判定牌颜色为素材较多的颜色，本阶段发动次数上限+1，且下一张使用的【杀】伤害+X；若红、黑牌数量相等，你回复1点体力并判定，若判定牌为伤害牌，本阶段发动次数上限+1，且下一张使用的【杀】每次造成伤害后摸两张牌。同种收益可叠加，两种收益可共存并保留至下一张使用的【杀】。',
  } };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'孙伊',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   (lib.arenaReady??=[]).push(function installSunyi(){
    api.zhangua.install();api.divination.install();api.shaoyi.install();
   });
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_sunyi:['female','wu',4,['bjgy_sunyi_zhangua','bjgy_sunyi_shaoyi'],['die:false','ext:孙伊/bjgy_sunyi.jpg']]},
    translate:{bjgy_sunyi:'孙伊'},characterIntro:{bjgy_sunyi:'孙伊，吴、女性、初始体力4，体力上限4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'孙伊：吴、女、4/4。占卦、绍翊。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_sunyi.jpg'],card:[],skill:[],audio:[]}
 };
});
