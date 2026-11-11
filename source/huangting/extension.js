// 皇庭 v0.1.0。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const api={},factories=[function royalFactory(lib, game, ui, get, ai, _status, api) {
  const POKER='皇庭扑克', QPOKER='皇庭黑桃Q', KPOKER='皇庭黑桃K', HPOKER='皇庭红桃J', HQPOKER='皇庭红桃Q', HKPOKER='皇庭红桃K', CPOKER='皇庭梅花J', CQPOKER='皇庭梅花Q', CKPOKER='皇庭梅花K', DJPOKER='皇庭方片J', DQPOKER='皇庭方片Q', DKPOKER='皇庭方片K', STATE='皇庭_公共状态', VERSION=12;
  const ids={entry:'皇庭_登场',recycle:'皇庭_回收',draw:'皇庭_黑桃J摸牌',lose:'皇庭_黑桃J失去',gain:'皇庭_黑桃J获得',discard:'皇庭_黑桃J弃置',aura:'皇庭_光环',catalog:'皇庭_红桃牌名记录'};
  const series={bjgy_jzhangliao:{suit:'spade',number:11,card:POKER},bjgy_qguozhao:{suit:'spade',number:12,card:QPOKER},bjgy_kcaopi:{suit:'spade',number:13,card:KPOKER},bjgy_jguanyu:{suit:'heart',number:11,card:HPOKER},bjgy_qwuxian:{suit:'heart',number:12,card:HQPOKER},bjgy_kliubei:{suit:'heart',number:13,card:HKPOKER},bjgy_jluxun:{suit:'club',number:11,card:CPOKER},bjgy_qpanshu:{suit:'club',number:12,card:CQPOKER},bjgy_ksunquan:{suit:'club',number:13,card:CKPOKER},bjgy_jyanghu:{suit:'diamond',number:11,card:DJPOKER},bjgy_qyangyan:{suit:'diamond',number:12,card:DQPOKER},bjgy_ksimayan:{suit:'diamond',number:13,card:DKPOKER}};
  const processedStartup=new WeakMap(), processedRecycle=new WeakSet(), processedGains=new WeakMap(), processedLosses=new WeakSet();
  let installed=false;
  function state(){return _status[STATE]||(_status[STATE]={active:false,started:false,entries:{},cards:[]});}
  function living(){return game.players.filter(player=>player.isIn());}
  function anchor(player){return living()[0]===player;}
  function inGame(player){return !!player&&player.isIn();}
  function rawNames(player){return [player.name,player.name1,player.name2].filter((name,index,list)=>typeof name==='string'&&list.indexOf(name)===index);}
  function identity(player, wanted){
    if(!player)return false;
    const identities=wanted==='郭照'?['郭照','郭女王']:wanted==='潘淑'?['潘淑','潘氏']:[wanted];
    for(const id of rawNames(player)){
      let info;
      try { info=get.character?get.character(id):lib.character[id]; } catch (_) { info=lib.character[id]; }
      let names=info&&info.names;
      if(!names&&Array.isArray(info))names=(info[4]||[]).find(tag=>typeof tag==='string'&&tag.startsWith('name:'))?.slice(5);
      if(names){
        const historical=String(names).split('-').map(name=>name.replace(/\|/g,''));
        if(historical.some(name=>identities.includes(name)))return true;
        // Lady Wu of Shu is Empress Wu Xian; do not conflate her with the
        // unrelated Wu kingdom ladies sharing the same surname/title.
        const originalGroup=info.group||(Array.isArray(info)?info[1]:undefined);
        if(wanted==='吴苋'&&originalGroup==='shu'&&historical.includes('吴氏'))return true;
        continue;
      }
      const known=wanted==='张辽'?['zhangliao']:wanted==='郭照'?['guozhao','guonvwang']:wanted==='曹丕'?['caopi']:wanted==='关羽'?['guanyu']:wanted==='刘备'?['liubei']:wanted==='吴苋'?['wuxian']:wanted==='陆逊'?['luxun']:wanted==='孙权'?['sunquan']:wanted==='潘淑'?['panshu','panshi']:wanted==='杨艳'?['yangyan']:wanted==='羊祜'?['yanghu']:wanted==='杜预'?['duyu']:wanted==='司马炎'?['simayan']:[];
      if(known.some(base=>id===base||id.endsWith('_'+base))||identities.includes(id))return true;
      const translated=lib.translate[id]||id;
      if(typeof translated==='string'&&identities.some(name=>translated===name||translated.endsWith(name)))return true;
    }
    return false;
  }
  function isPoker(card){return !!card&&(card.name===POKER||card.name===QPOKER||card.name===KPOKER||card.name===HPOKER||card.name===HQPOKER||card.name===HKPOKER||card.name===CPOKER||card.name===CQPOKER||card.name===CKPOKER||card.name===DJPOKER||card.name===DQPOKER||card.name===DKPOKER||(typeof get.type==='function'&&get.type(card,false)==='poker'));}
  function recordHeartNames(){
    const s=state();if(Array.isArray(s.heartNames))return;
    const pile=Array.from(ui.cardPile?.childNodes||[]),table=Array.isArray(lib.card?.list)?lib.card.list:[];
    // Normal startup uses the fully assembled physical deck. A mode which
    // first exposes this extension after dealing can fall back to its initial
    // deck table rather than accidentally freezing only the remaining pile.
    const late=s.started||_status.gameDrawed||game.phaseNumber>0;
    const cards=late&&table.length?table.map(row=>({suit:row[0],name:row[2]})):pile.length?pile:table.map(row=>({suit:row[0],name:row[2]}));
    if(!cards.length)return;
    const names=[];
    for(const card of cards){
      const name=card.name,info=lib.card[name],type=typeof get.type==='function'?get.type({name},false):info?.type;
      if(card.suit==='heart'&&['basic','trick'].includes(type)&&info?.subtype!=='delay'&&!names.includes(name))names.push(name);
    }
    s.heartNames=names;
  }
  function heartNames(){recordHeartNames();return (state().heartNames||[]).slice();}
  function isSpadeJ(card, holder){return !!card&&get.suit(card,holder)==='spade'&&get.number(card,holder)===11;}
  function isBlackJ(card){return isPoker(card)&&card.suit==='spade'&&Number(card.number)===11;}
  function countSpadeJ(player){return player.getCards('h').filter(card=>isSpadeJ(card,player)).length;}
  function countBlackJ(player){return player.getCards('h').filter(isBlackJ).length;}
  function active(){return state().active;}
  function activate(){
    const s=state();s.active=true;
    for(const player of living())if(player.markSkill)player.markSkill(ids.aura);
    return s;
  }
  function discover(){
    const s=state();
    for(const player of living())for(const name of rawNames(player))if(series[name]){
      const key=String(player.playerid||game.players.indexOf(player))+'|'+name;
      if(!s.entries[key])s.entries[key]={player,name,key,spec:series[name],prepared:false,collected:false};
    }
    // An already established entry survives its creator dying or changing
    // character before the initial deal, just like the persistent aura.
    const entries=Object.values(s.entries);
    if(entries.length)activate();
    return entries;
  }
  function convert(entry){
    if(entry.prepared)return [];
    recordHeartNames();
    entry.prepared=true;
    const s=state(),cards=Array.from(ui.cardPile.childNodes).filter(card=>!isPoker(card)&&card.suit===entry.spec.suit&&Number(card.number)===entry.spec.number);
    for(const card of cards){
      game.broadcastAll((physical,name)=>{
        const cardid=physical.cardid,suit=physical.suit,number=physical.number;
        delete physical.nature;delete physical.destroyed;delete physical._destroy;delete physical.viewAs;
        physical.init([suit,number,name]);
        if(cardid!==undefined)physical.cardid=cardid;
      },card,entry.spec.card||POKER);
      if(!s.cards.includes(card))s.cards.push(card);
    }
    if(cards.length&&game.updateRoundNumber)game.updateRoundNumber();
    return cards;
  }
  function allPokers(spec){
    // Entry collection claims only the new cards created by this extension.
    // Existing Chen Shou pokers retain their independent pile and owner.
    const cards=[],add=card=>{if(card.name===(spec.card||POKER)&&card.suit===spec.suit&&Number(card.number)===spec.number&&!cards.includes(card))cards.push(card);};
    for(const area of ['cardPile','discardPile','ordering','special'])for(const card of Array.from(ui[area]?.childNodes||[]))add(card);
    for(const player of game.players.concat(game.dead||[]))for(const card of player.getCards('hejx'))add(card);
    return cards;
  }
  async function collect(entry){
    if(entry.collected||!entry.prepared)return;
    entry.collected=true;
    // Collection is a single setup opportunity. A dead owner does not defer
    // it until revival, although the already established public aura remains.
    if(!inGame(entry.player))return;
    const cards=allPokers(entry.spec).filter(card=>get.owner(card)!==entry.player||!entry.player.getCards('h').includes(card));
    if(cards.length)await entry.player.gain(cards,'gain2');
  }
  function onceTiming(trigger,timing){
    let seen=processedStartup.get(trigger);if(!seen)processedStartup.set(trigger,seen=new Set());
    if(seen.has(timing))return false;seen.add(timing);return true;
  }
  async function entryContent(event, trigger){
    const timing=event.triggername||trigger.triggername||(trigger.name==='enterGame'?'enterGame':trigger.name==='phase'?'phaseBefore':trigger.name);
    if(!onceTiming(trigger,timing))return;
    recordHeartNames();
    const entries=discover(),s=state();
    if(!entries.length)return;
    if(timing==='gameDrawBefore')for(const entry of entries)convert(entry);
    else if(timing==='gameDrawAfter'){
      s.started=true;
      for(const entry of entries){convert(entry);await collect(entry);}
    } else if(timing==='enterGame'){
      if(s.started||_status.gameDrawed||game.phaseNumber>0)for(const entry of entries){convert(entry);await collect(entry);}
    } else if(timing==='phaseBefore'){
      // Modes which bypass gameDraw still finish setup before the first turn.
      s.started=true;
      for(const entry of entries){convert(entry);await collect(entry);}
    }
  }
  async function redistribute(trigger){
    if(!active()||processedRecycle.has(trigger))return;
    processedRecycle.add(trigger);
    const recipients=living();if(!recipients.length)return;
    const snapshot=Array.from(ui.discardPile.childNodes).filter(isPoker),groups=new Map();
    for(const card of snapshot){const target=recipients[Math.floor(Math.random()*recipients.length)];if(!groups.has(target))groups.set(target,[]);groups.get(target).push(card);}
    for(const [target,cards] of groups){
      if(!inGame(target))continue;
      const current=cards.filter(card=>get.position(card,true)==='d');
      if(current.length)await target.gain(current,'gain2');
    }
  }
  function chainContains(record,parent){
    if(record===parent)return true;
    const seen=new Set();let current=record;
    while(current&&!seen.has(current)){
      if(current===parent)return true;seen.add(current);
      current=typeof current.getParent==='function'?current.getParent():current.parent;
    }
    return false;
  }
  function losses(trigger){
    const list=[];
    if(trigger.name==='lose'&&trigger.player)list.push({player:trigger.player,record:trigger});
    for(const player of living()){
      const history=typeof player.getHistory==='function'?player.getHistory('lose'):[];
      for(const record of history||[])if(chainContains(record,trigger)&&!list.some(item=>item.record===record))list.push({player,record});
    }
    return list.filter(item=>!processedLosses.has(item.record)&&identity(item.player,'张辽')&&inGame(item.player)&&(item.record.cards2||item.record.cards||[]).some(isBlackJ));
  }
  function gains(trigger){
    if(trigger.name==='gain'&&trigger.player){
      // Native aggregate gain children suppress getg until loseAsyncAfter.
      if(trigger.getlx===false)return [];
      return [{player:trigger.player,cards:trigger.cards||[],records:[trigger]}];
    }
    if(typeof trigger.getg!=='function')return [];
    return living().map(player=>{
      const history=typeof player.getHistory==='function'?player.getHistory('gain'):[];
      const records=(history||[]).filter(record=>record.parent===trigger||(typeof record.getParent==='function'&&record.getParent()===trigger));
      const unseen=records.filter(record=>!processedGains.get(record)?.has(player));
      return {player,cards:records.length?unseen.flatMap(record=>record.cards||[]):trigger.getg(player)||[],records:records.length?unseen:[trigger]};
    });
  }
  function gainSeen(trigger, player){
    let set=processedGains.get(trigger);if(!set)processedGains.set(trigger,set=new Set());
    if(set.has(player))return true;set.add(player);return false;
  }
  function publicRule(rule){return Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},rule);}
  function onCharacterReady(player){
    // init/reinit are synchronous and do not reliably emit enterGame. Only
    // playing seats may activate the aura; character previews are ignored.
    if(!game.players.includes(player)||!inGame(player))return;
    const entries=discover().filter(entry=>entry.player===player);
    if(!(state().started||_status.gameDrawed||game.phaseNumber>0))return;
    for(const entry of entries){
      convert(entry);
      if(entry.collected||entry.scheduled)continue;
      entry.scheduled=true;
      const content=[async function(){try{await collect(entry);}finally{entry.scheduled=false;}}];
      const started=_status.eventManager?.getStartedEvent?.();
      const parent=started||(_status.event&&!_status.event.finished?_status.event:null);
      if(typeof game.createEvent==='function'){
        const next=game.createEvent('皇庭_登场补办',false,parent||undefined);
        next.player=player;next.forceDie=true;next.setContent(content);
        if(!parent&&typeof next.start==='function')next.start().catch(error=>{if(game.print)game.print(error);else throw error;});
      } else {
        // A non-event embedding can still await this explicit initialization.
        entry.pending=content[0]();
      }
    }
  }
  function protectProperty(object,key,accept){
    const descriptor=Object.getOwnPropertyDescriptor(object,key);
    if(descriptor?.get?.['皇庭_保护版本']>=VERSION)return;
    let current=object[key];
    const read=function(){return current;};
    Object.defineProperty(read,'皇庭_保护版本',{value:VERSION});
    Object.defineProperty(object,key,{configurable:true,enumerable:descriptor?.enumerable??true,get:read,
      set(value){if(accept(value,current))current=value;},
    });
  }
  function installEntryHook(){
    let prototype=lib.element?.Player?.prototype;
    if(!prototype&&lib.element)try{prototype=lib.element.player;}catch(_){}
    if(!prototype)return;
    for(const method of ['init','reinit']){
      const prior=prototype[method];
      if(typeof prior!=='function'||prior['皇庭_版本']>=VERSION)continue;
      // Upgrade the old J-only wrapper without nesting two entry observers.
      const original=prior['皇庭_原方法']||prior;
      const wrapped=function(){const result=original.apply(this,arguments);onCharacterReady(this);return result;};
      Object.defineProperty(wrapped,'皇庭_包装',{value:true});
      Object.defineProperty(wrapped,'皇庭_版本',{value:VERSION});
      Object.defineProperty(wrapped,'皇庭_原方法',{value:original});
      prototype[method]=wrapped;
      // Older Q packets install a J/Q-only observer unconditionally. Accept
      // ordinary third-party wrappers but refuse a known older royal wrapper.
      protectProperty(prototype,method,value=>typeof value==='function'&&
        (!value['皇庭_包装']||Number(value['皇庭_版本']||0)>=VERSION));
    }
  }
  const skills={
    [ids.aura]:{charlotte:true,ruleSkill:true,mark:true,marktext:'庭',intro:{name:'皇庭',content:'皇庭系列公共光环已建立。本局持续生效，不受武将技能失效、失去技能或阵亡影响；每回合结束回收弃牌堆中的皇庭扑克牌。'}},
    [ids.catalog]:publicRule({
      firstDo:true,priority:1000000001,
      trigger:{global:['gameStart','gameDrawBefore']},
      filter(trigger,player){return inGame(player)&&!Array.isArray(state().heartNames);},
      content:[async function(){recordHeartNames();}],
    }),
    [ids.entry]:publicRule({
      firstDo:true,priority:1000000000,
      trigger:{global:['gameStart','gameDrawBefore','gameDrawAfter','enterGame','phaseBefore']},
      filter(trigger,player){return inGame(player)&&(active()||game.players.some(current=>inGame(current)&&rawNames(current).some(name=>!!series[name])));},
      content:[async function(event,trigger){await entryContent(event,trigger);}],
    }),
    [ids.recycle]:publicRule({
      trigger:{global:'phaseAfter'},
      filter(trigger,player){return active()&&inGame(player)&&!processedRecycle.has(trigger)&&Array.from(ui.discardPile.childNodes).some(isPoker);},
      content:[async function(event,trigger){await redistribute(trigger);}],
    }),
    [ids.draw]:publicRule({
      trigger:{player:'phaseDrawBegin2'},
      filter(trigger,player){return active()&&inGame(player)&&identity(player,'张辽')&&countBlackJ(player)>0;},
      content:[async function(event,trigger,player){
        const num=countBlackJ(player);if(!num)return;
        const result=await player.chooseBool('黑桃J：是否额外摸'+num+'张牌？').set('ai',()=>true).forResult();
        if(result.bool&&inGame(player))trigger.num+=countBlackJ(player);
      }],
    }),
    [ids.lose]:publicRule({
      trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},
      filter(trigger,player){return active()&&inGame(player)&&losses(trigger).length>0;},
      content:[async function(event,trigger){
        const entries=losses(trigger);
        for(const {record} of entries)processedLosses.add(record);
        for(const {player} of entries){
          if(!inGame(player)||!living().some(target=>target!==player&&target.countCards('h')>0))continue;
          const result=await player.chooseTarget([1,2],'黑桃J：可以获得至多两名其他角色各一张手牌',function(card,player,target){return target!==player&&target.isIn()&&target.countCards('h')>0;}).set('ai',target=>-get.attitude(player,target)).forResult();
          if(!result.bool)continue;
          for(const target of result.targets||[])if(inGame(player)&&inGame(target)&&target!==player&&target.countCards('h'))await player.gainPlayerCard(target,'h',true);
        }
      }],
    }),
    [ids.gain]:publicRule({
      trigger:{global:['gainAfter','loseAsyncAfter']},
      filter(trigger,player){return active()&&inGame(player)&&gains(trigger).some(item=>inGame(item.player)&&!identity(item.player,'张辽')&&!identity(item.player,'曹丕')&&item.cards.some(isBlackJ)&&!item.records.every(record=>processedGains.get(record)?.has(item.player)));},
      content:[async function(event,trigger){
        for(const {player,cards,records} of gains(trigger))if(inGame(player)&&cards.some(isBlackJ)&&!identity(player,'张辽')&&!identity(player,'曹丕')){
          if(records.every(record=>processedGains.get(record)?.has(player)))continue;
          for(const record of records)gainSeen(record,player);
          await player.damage(1,'nosource');
        }
      }],
    }),
    [ids.discard]:{
      charlotte:true,ruleSkill:true,enable:'phaseUse',position:'h',selectCard:1,selectTarget:1,discard:true,lose:true,delay:false,
      filter(event,player){return active()&&inGame(player)&&identity(player,'曹丕')&&player.countCards('h',card=>isBlackJ(card)&&lib.filter.cardDiscardable(card,player,ids.discard))>0&&living().some(target=>target!==player);},
      filterCard(card,player){return isBlackJ(card)&&lib.filter.cardDiscardable(card,player,ids.discard);},
      filterTarget(card,player,target){return target!==player&&target.isIn();},
      content:[async function(event,trigger,player){if(inGame(player)&&inGame(event.target))await event.target.damage(1,player);}],
      ai:{order:7,result:{target(player,target){return get.damageEffect(target,player,player);}}},
    },
  };
  const translate={
    [ids.aura]:'皇庭',[ids.aura+'_info']:'皇庭为系列公共光环，登场自动建立，不属于武将技能，持续至本局游戏结束。',
    [ids.entry]:'皇庭',[ids.recycle]:'皇庭',[ids.catalog]:'皇庭',
    [ids.draw]:'黑桃J',[ids.lose]:'黑桃J',[ids.gain]:'黑桃J',[ids.discard]:'黑桃J',
    [ids.discard+'_info']:'出牌阶段，你可以弃置一张黑桃J扑克牌，对一名其他角色造成1点伤害。',
  };
  api.royal={ids,isPoker,isSpadeJ,isBlackJ,countSpadeJ,countBlackJ,identity,active,activate,state,convert,collect,redistribute,onCharacterReady,heartNames,
    install(){
      if(installed)return;installed=true;
      // Preserve a single newest controller even if the old Q extension is
      // loaded later and attempts to assign its J/Q-only rule objects.
      for(const id of Object.keys(skills)){
        skills[id]['皇庭_版本']=VERSION;
        lib.skill[id]=skills[id];
        protectProperty(lib.skill,id,value=>!!value&&Number(value['皇庭_版本']||0)>=VERSION);
      }
      for(const id of [ids.catalog,ids.entry,ids.recycle,ids.draw,ids.lose,ids.gain,ids.discard])game.addGlobalSkill(id);
      installEntryHook();
    },
  };
  return {skills,translate,cards:{
    [DKPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/方片K.svg',enable:false,ai:{basic:{value:5,useful:5}}},
    [DQPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/方片Q.svg',enable:false,ai:{basic:{value:5,useful:5}}},
    [DJPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/方片J.svg',enable:false,ai:{basic:{value:5,useful:5}}},
    [POKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/皇庭扑克.svg',enable:false,ai:{basic:{value:3,useful:3}}},
    [QPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/黑桃Q.svg',enable:false,ai:{basic:{value:4,useful:4}}},
    [HPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/红桃J.svg',enable:false,ai:{basic:{value:4,useful:4}}},
    [KPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/黑桃K.svg',enable:false,ai:{basic:{value:4,useful:4}}},
    [HQPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/红桃Q.svg',enable:false,ai:{basic:{value:4,useful:4}}},
    [CQPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/梅花Q.svg',enable:false,ai:{basic:{value:5,useful:5}}},
    [CPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/梅花J.svg',enable:false,ai:{basic:{value:5,useful:5}}},
    [HKPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/红桃K.svg',enable:false,ai:{basic:{value:5,useful:5}}},
    [CKPOKER]:{type:'poker',noname:true,fullimage:true,image:'ext:皇庭/梅花K.svg',enable:false,ai:{basic:{value:5,useful:5}}},
   },cardTranslate:{
    [DKPOKER]:'扑克',[DKPOKER+'_info']:'方片K扑克牌。司马炎持有时，视为拥有对其他晋势力角色发动的激将、护驾和救援；失去时可以摸场上晋势力角色数张牌。羊祜和杜预持有时使用牌不能被响应；其他角色持有时不能使用方片牌。',
    [DQPOKER]:'扑克',[DQPOKER+'_info']:'方片Q扑克牌。杨艳持有时每回合使用的前X张牌结算后可横置或重置其他角色，然后获得手中缺少的四种常规花色的牌。失去时可摸两张牌并可交给其他角色至多两张手牌。司马炎出牌阶段可弃置一张，获得一名有手牌的其他角色的所有手牌，交还等量张牌并永久改其势力为晋。其他角色失去时随机弃置手中各常规花色的牌各一张。X为手中方片Q数量。',
    [DJPOKER]:'扑克',[DJPOKER+'_info']:'方片J扑克牌。羊祜持有时，其他角色出牌阶段开始可以令其展示羊祜的手牌，回合结束可使用一张被展示的手牌并按展示数量额外结算；失去时下一次造成伤害可防止之并获得受伤角色区域内两张牌。杜预和司马炎可在出牌阶段弃置此牌发动相应效果；其他角色使用黑色牌指定手牌更少的角色时，该角色可以弃置使用者一张牌。',
    [CKPOKER]:'扑克',[CKPOKER+'_info']:'梅花K扑克牌。孙权所有形态持有时，出牌阶段开始可按持有数量逐张获得场上的武器牌。孙权失去时随机使用一张可用的装备牌，牌堆优先，无可用牌时检索弃牌堆。若实际顶替原有装备，可以对至多被顶替装备牌牌名字数之和名其他角色各造成1点伤害。陆逊所有形态持有时，每轮开始若存活人数大于初始人数的一半，可以获得手牌中缺少的标准花色各一张。陆逊失去时，若存活人数不大于初始人数的一半，失去所有体力，本次脱离濒死后回复至体力上限。其他角色持有时不能使用梅花牌，仍可打出。一次失去多张只结算一次。',
    [CQPOKER]:'扑克',[CQPOKER+'_info']:'梅花Q扑克牌。潘淑（含潘氏所有形态）出牌阶段开始时，可按手中此牌数量随机获得牌名各不相同的牌，牌堆优先，不足再从弃牌堆取；失去此牌时可回复1点体力并获得一张锦囊牌（含延时锦囊）。其他角色一次获得任意张此牌失去1点体力，排除潘淑和孙权。孙权所有形态出牌阶段可弃置一张：若体力值不是全场最低，摸两张牌并获得一次持续至下次失去最后手牌时摸至体力上限的效果，此效果不叠加；若体力值为全场最低（含并列），回复1点体力并额外执行一次标准制衡，按实际弃置数量令本回合接下来等量的单目标牌在原有合法范围内随机改换目标，多次效果数量累加。',
    [CPOKER]:'扑克',[CPOKER+'_info']:'梅花J扑克牌。陆逊所有形态持有时，每个出牌阶段开始按持有数量选择横置角色或重铸手牌；失去时防止下一次受到的伤害，防伤不叠加。孙权所有形态可于出牌阶段弃置一张，按当前存活人数获得一名其他角色装备区全部牌，或其手牌装备区全部红色牌后失去1点体力；没有牌也能选择，后一分支仍须失去体力。其他角色获得时展示手牌并亮出牌堆顶牌，同花色受到1点无来源火焰伤害，亮出的牌进入弃牌堆。其他角色排除陆逊和孙权。',
    [HKPOKER]:'扑克',[HKPOKER+'_info']:'红桃K扑克牌。刘备所有形态持有时，每回合限一次，可无实体素材视为使用或打出一张基本牌，使用和打出共享次数；失去时可弃置一名本局游戏实际造成过伤害的其他角色两张手牌或装备牌。关羽所有形态持有时，杀无距离和次数限制且不计次，每回合实际使用的前三张杀每次最终被抵消后摸一张牌。其他身份持有时不能使用最终花色为红桃的牌，不限制打出；其他身份排除刘备和关羽。一次失去多张只触发一次。',
    [HQPOKER]:'扑克',[HQPOKER+'_info']:'红桃Q扑克牌。吴苋所有形态每持有一张手牌上限+1，每回合首次使用红桃牌时回复1点体力；失去时可令一名角色将手牌调整至当前手牌上限（至多摸5）。刘备所有形态出牌阶段可弃一张，手牌摸至体力上限（至多摸5）并视为使用一张开局红桃牌名库中的基本牌或普通锦囊牌，每轮每种牌名限一次。其他角色获得时，全场角色可依次对其使用一张手牌；其他角色排除吴苋和刘备。一次多张得失只结算一次。',
    [POKER]:'扑克',[POKER+'_info']:'黑桃J扑克牌。张辽（所有形态）摸牌阶段可以额外摸手中此牌数量张牌，失去时可以获得至多两名其他角色各一张手牌；曹丕（所有形态）出牌阶段可以弃置一张对其他角色造成1点伤害；其他角色一次获得此牌时受到1点无来源伤害。皇庭公共光环建立后生效。',
    [QPOKER]:'扑克',[QPOKER+'_info']:'黑桃Q扑克牌。郭照（含郭女王所有形态）失去手牌后仍持有此牌且红黑手牌数相等时，可检索一张指定颜色牌；郭照失去此牌时可重铸任意张同色手牌或装备牌。曹丕所有形态出牌阶段可弃一张，获得一红一黑两张牌。其他角色获得此牌时，场上所有郭照各观看其手牌一次；其他角色排除郭照、郭女王和曹丕。一次多张得失只结算一次。',
    [HPOKER]:'扑克',[HPOKER+'_info']:'红桃J扑克牌。关羽（所有形态）持有时，每回合开始可以获得一张红色牌或一张离手前不计次的杀；失去时可以视为使用绝武版水淹七军。刘备（所有形态）出牌阶段可以弃置一张，视为使用无距离和次数限制的杀，此杀每次造成伤害后，刘备摸两张牌并回复1点体力。其他角色失去时弃置所有装备，并令之后使用的下一张牌无效；其他角色排除关羽和刘备。',
    [KPOKER]:'扑克',[KPOKER+'_info']:'黑桃K扑克牌。曹丕所有形态受到伤害后，仍持有此牌时，无放逐可执行一次标准放逐，有任意版本放逐可摸两张；曹丕失去此牌时可令一名角色回复1并复原武将牌。张辽所有形态持有时，非因此效果获得其他角色手牌后，可再获本次一名来源的一张手牌。其他身份持有时不能使用黑桃牌；其他身份排除曹丕和张辽。一次多张得失只触发一次。',poker:'扑克牌'}};
},
function generalFactory(lib,game,ui,get,ai,_status,api){
 const huming='J张辽_呼名',fuba='J张辽_复拔';
 const rules='J张辽_奖励规则',maintain='J张辽_明置与离手',follow='J张辽_复拔结算',turnEnd='J张辽_复拔回合清理';
 const shownTag='visible_J张辽_呼名',rewardTag='J张辽_复拔奖励';
 const pendingKey='J张辽_复拔待结算',participatedKey='J张辽_复拔已代替',settledKey='J张辽_复拔已结算';
 const banKey='J张辽_复拔失效',materialKey='J张辽_奖励素材',countedKey='J张辽_奖励已不计次';
 const counterKey='J张辽_复拔反击';
 const seenLosses=new WeakSet();
 const seenMaintenance=new WeakMap();
 const banPhases=new WeakMap();
 let installed=false;

 function alive(player){return !!player&&player.isIn();}
 function everybody(){return [...new Set([...(game.players||[]),...(game.dead||[])])];}
 function hasTag(card,tag){return !!card&&(typeof card.hasGaintag==='function'?card.hasGaintag(tag):(card.gaintag||[]).includes(tag));}
 function removeTag(card,tag){if(typeof card.removeGaintag==='function')card.removeGaintag(tag);else if(card.gaintag)card.gaintag=card.gaintag.filter(t=>t!==tag);}
 function hasHuming(player){return alive(player)&&player.hasSkill(huming);}
 function count(player){return api.royal.countSpadeJ(player);}
 function useEvent(event){if(event?.name==='useCard')return event;const parent=event?.getParent&&event.getParent('useCard');return parent?.name==='useCard'?parent:null;}
 function phaseOf(context){
  if(!context)return null;
  if(context.name==='phase')return context;
  const phase=context.getParent&&context.getParent('phase',true);
  return phase?.name==='phase'?phase:null;
 }
 function banned(player,context){
  if(player.storage[banKey]===true)return true;
  const phases=banPhases.get(player);
  if(!phases?.size)return false;
  const phase=phaseOf(context||_status.event);
  return phase?phases.has(phase):!context;
 }
 function markBan(player,context){
  const phase=phaseOf(context)||phaseOf(_status.event);
  if(!phase){player.storage[banKey]=true;return;}
  let phases=banPhases.get(player);
  if(!phases){phases=new Set();banPhases.set(player,phases);}
  phases.add(phase);
 }
 function pending(use){return use?.[pendingKey]||[];}
 function usedBy(use,player){return (use?.[participatedKey]||[]).includes(player);}
 function damageCard(card,holder){
  if(!card||get.name(card,holder)==='shandian')return false;
  return !!get.tag(card,'damage');
 }
 function canReplace(trigger,player){
  const use=useEvent(trigger),targets=use?.targets||trigger?.targets;
  if(!alive(player)||!use||banned(player,use)||!use.player||use.player===player||usedBy(use,player))return false;
  if(!targets||targets.length!==1||targets[0]===player||trigger.target!==targets[0]||!alive(targets[0]))return false;
  if(!damageCard(use.card,use.player))return false;
  return !!lib.filter.targetEnabled2(use.card,use.player,player);
 }
 async function syncShown(player){
  const hand=player.getCards('h');
  const current=hasHuming(player)?hand.filter(card=>api.royal.isSpadeJ(card,player)):[];
  const show=current.filter(card=>!hasTag(card,shownTag));
  const hide=hand.filter(card=>hasTag(card,shownTag)&&!current.includes(card));
  if(hide.length)await player.hideShownCards(hide,shownTag);
  if(show.length)await player.addShownCards(show,shownTag);
 }
 function taggedLossCards(loss,tag){
  const map=loss.gaintag_map||{};
  return (loss.hs||loss.cards2||[]).filter(card=>hasTag(card,tag)||(map[card.cardid]||[]).includes(tag));
 }
 function cleanLoss(loss){
  if(!loss||typeof loss!=='object'||seenLosses.has(loss))return;
  seenLosses.add(loss);
  const use=useEvent(loss);
  const reward=taggedLossCards(loss,rewardTag);
  if(use&&use.player===loss.player&&reward.some(card=>(use.cards||[]).includes(card))){use[materialKey]=true;}
  for(const card of reward)removeTag(card,rewardTag);
  for(const card of taggedLossCards(loss,shownTag))removeTag(card,shownTag);
 }
 function lossesFor(trigger){
  const result=[];
  if(trigger?.name==='lose')result.push(trigger);
  if(trigger&&typeof trigger.getl==='function'){
   for(const player of everybody()){
    const loss=trigger.getl(player);
    if(loss&&(loss.hs?.length||loss.cards2?.length||Object.keys(loss.gaintag_map||{}).length)){
     // getl() can return an aggregation rather than the original physical loss.
     // Its hand list still carries the original tag map; keep the losing owner.
     if(!loss.player)loss.player=player;
     result.push(loss);
    }
   }
  }
  return result;
 }
 function heldReward(card,player){
  const materials=[...(card?.cards||[])];
  if(get.itemtype(card)==='card')materials.push(card);
  const hand=player.getCards('h');
  return materials.some(part=>hand.includes(part)&&hasTag(part,rewardTag));
 }
 function hasRewardUse(use,player){
  if(use[materialKey])return true;
  if(heldReward(use.card,player))return true;
  const materials=use.cards||[];
  if(!materials.length||typeof player.getHistory!=='function')return false;
  return player.getHistory('lose',loss=>{
   const parent=useEvent(loss);
   return parent===use&&taggedLossCards(loss,rewardTag).some(card=>materials.includes(card));
  }).length>0;
 }
 async function applyNoCount(use,player){
  if(!use||!player||use[countedKey]||!hasRewardUse(use,player))return;
  use[countedKey]=true;
  if(use.addCount!==false){
   const name=get.name(use.card,player),stat=player.getStat();
   if(stat?.card&&typeof stat.card[name]==='number'&&stat.card[name]>0)stat.card[name]--;
  }
  use.addCount=false;
 }
 function resetBans(context){
  const phase=phaseOf(context);
  for(const player of everybody()){
   delete player.storage[banKey];
   if(phase)banPhases.get(player)?.delete(phase);
   else banPhases.delete(player);
  }
 }
 function takeRandomDamageCards(number){
  const selected=[];
  for(let i=0;i<number;i++){
   let candidates=Array.from(ui.cardPile.childNodes).filter(card=>!selected.includes(card)&&damageCard(card,false));
   if(!candidates.length)candidates=Array.from(ui.discardPile.childNodes).filter(card=>!selected.includes(card)&&damageCard(card,false));
   if(!candidates.length)break;
   selected.push(candidates[Math.floor(Math.random()*candidates.length)]);
  }
  return selected;
 }
 function counterHit(player,target,counter){
  const history=typeof player.getAllHistory==='function'?player.getAllHistory.bind(player):player.getHistory.bind(player);
  return history('sourceDamage',damage=>damage.player===target&&damage.num>0&&!damage.unreal&&damage.card===counter.card&&useEvent(damage)===counter).length>0;
 }
 async function settle(use){
  if(!use||use[settledKey])return;
  use[settledKey]=true;
  const queue=pending(use).slice();
  for(const record of queue){
   const player=record.player,target=record.source;
   if(!alive(player))continue;
   await player.draw(2);
   if(!alive(player)||!alive(target))continue;
   const card={name:'sha',isCard:true,storage:{[counterKey]:true}};
   if(!player.canUse(card,target,false,false))continue;
   const counter=player.useCard(card,target);
   counter.addCount=false;
   await counter;
   if(!alive(player)||!counterHit(player,target,counter))continue;
   markBan(player,use);
   const cards=takeRandomDamageCards(2);
   if(!cards.length)continue;
   const gain=player.gain(cards,'gain2');
   if(gain.gaintag){
    if(typeof gain.gaintag.add==='function')gain.gaintag.add(rewardTag);
    else if(!gain.gaintag.includes(rewardTag))gain.gaintag.push(rewardTag);
   }
   await gain;
   const stillHeld=cards.filter(card=>player.getCards('h').includes(card));
   if(stillHeld.length)player.addGaintag(stillHeld,rewardTag);
  }
 }

 const skills={
  [huming]:{
   audio:false,forced:true,locked:true,trigger:{source:'damageBegin1'},
   filter(event,player){return count(player)>0&&event.num>0;},
   content:[async function(event,trigger,player){trigger.num*=count(player)+1;}],
  },
  [fuba]:{
   audio:false,direct:true,trigger:{global:'useCardToTarget'},
   filter:canReplace,
   content:[async function(event,trigger,player){
    if(!canReplace(trigger,player))return;
    const use=useEvent(trigger),original=trigger.target;
    const result=await player.chooseBool('复拔：代替'+get.translation(original)+'成为'+get.translation(use.card)+'的目标？')
     .set('ai',()=>get.attitude(player,original)>0||get.attitude(player,use.player)<0).forResult();
    if(!result.bool||!canReplace(trigger,player))return;
    player.logSkill(fuba,original);
    if(!use[participatedKey])use[participatedKey]=[];
    use[participatedKey].push(player);
    if(!use[pendingKey])use[pendingKey]=[];
    use[pendingKey].push({player,source:use.player});
    for(const key of ['triggeredTargets2']){
     if(Array.isArray(use[key]))for(let i=use[key].length-1;i>=0;i--)if(use[key][i]===original)use[key].splice(i,1);
    }
    const index=use.targets.indexOf(original);
    if(index>=0)use.targets.splice(index,1,player);
    if(trigger.targets!==use.targets){
     const targetIndex=trigger.targets.indexOf(original);
     if(targetIndex>=0)trigger.targets.splice(targetIndex,1,player);
    }
   }],
  },
  [rules]:{
   charlotte:true,ruleSkill:true,silent:true,popup:false,forced:true,
   trigger:{global:'useCard1'},
   filter(event){return hasRewardUse(event,event.player);},
   content:[async function(event,trigger){await applyNoCount(trigger,trigger.player);}],
   mod:{
    cardUsable(card,player){if(card?.storage?.[counterKey]||heldReward(card,player))return Infinity;},
    targetInRange(card){if(card?.storage?.[counterKey])return true;},
   },
  },
  [maintain]:{
   charlotte:true,ruleSkill:true,silent:true,popup:false,forced:true,firstDo:true,
   trigger:{global:['gainAfter','loseAfter','loseAsyncAfter','equipAfter','addJudgeAfter','addToExpansionAfter','changeSkillsAfter','gameDrawAfter','phaseBefore','useCardBefore','respondBefore','phaseAfter','enterGame']},
   filter(event,player,timing){return !seenMaintenance.get(event)?.has(timing||event.name);},
   content:[async function(event,trigger){
    const timing=event.triggername||trigger.name;
    let timings=seenMaintenance.get(trigger);
    if(timings?.has(timing))return;
    if(!timings){timings=new Set();seenMaintenance.set(trigger,timings);}
    timings.add(timing);
    for(const loss of lossesFor(trigger))cleanLoss(loss);
    for(const player of everybody())await syncShown(player);
   }],
  },
  [follow]:{
   charlotte:true,ruleSkill:true,silent:true,popup:false,forced:true,
   trigger:{global:'useCardAfter'},
   filter(event){return pending(event).length>0&&!event[settledKey];},
   content:[async function(event,trigger){await settle(trigger);}],
  },
  [turnEnd]:{
   charlotte:true,ruleSkill:true,silent:true,popup:false,forced:true,lastDo:true,
   trigger:{global:'phaseAfter'},
   content:[async function(event,trigger){resetBans(trigger);}],
  },
 };

 api.general={huming,fuba,rules,maintain,follow,turnEnd,shownTag,rewardTag,pending,banned,syncShown,cleanLoss,applyNoCount,settle,resetBans,
  install(){
   if(installed)return;
   for(const id of [rules,maintain,follow,turnEnd]){lib.skill[id]=skills[id];game.addGlobalSkill(id);}
   installed=true;
  },
 };
 return{skills,translate:{
  [huming]:'呼名',[huming+'_info']:'锁定技，你手中花色点数组合为黑桃J的手牌始终明置；你手中有黑桃J时，你造成的伤害乘以X＋1（X为你手中黑桃J的数量）。',
  [fuba]:'复拔',[fuba+'_info']:'其他角色成为伤害牌的唯一目标时，若使用者不为你，你可以代替其成为此牌目标，且此牌结算完成后，你摸两张牌并视为对使用者使用一张无距离和次数限制且不计次的“杀”。若使用者因此受到伤害，你再获得两张不计次的伤害牌，然后该技能本回合失效。',
  [shownTag]:'呼名',[rewardTag]:'复拔·不计次',
 }};
},
function jujiaoFactory(lib, game, ui, get, ai, _status, api) {
  const skillId = 'Q郭照_居椒';
  const labels = {
    1: '①将手牌摸至全场最多',
    2: '②随机使用装备牌，将装备数补至全场最多',
    3: '③将体力回复至全场最多（不超过体力上限）',
  };

  function qCount(player) {
    return player.getCards('h').filter(card => get.suit(card, player) === 'spade' && get.number(card, player) === 12).length;
  }

  function maximum(player, metric) {
    return Math.max(metric(player), ...game.filterPlayer().map(metric));
  }

  function equipmentCandidates(player, attempted) {
    const legal = card => !attempted?.has(card) && get.type(card) === 'equip' &&
      player.canEquip(card, false) && player.canUse(card, player, false, false);
    // A missing type of equipment in the draw pile may be taken from discard,
    // but discard must never compete with an available draw-pile candidate.
    for (const pile of [ui.cardPile, ui.discardPile]) {
      const cards = Array.from(pile.childNodes).filter(legal);
      if (cards.length) return cards;
    }
    return [];
  }

  function availableOptions(player) {
    const result = [];
    if (player.countCards('h') < maximum(player, current => current.countCards('h'))) result.push(1);
    if (player.countCards('e') < maximum(player, current => current.countCards('e')) && equipmentCandidates(player).length) result.push(2);
    if (player.hp < Math.min(player.maxHp, maximum(player, current => current.hp))) result.push(3);
    return result;
  }

  async function executeOption(player, option) {
    if (option === 1) {
      const target = maximum(player, current => current.countCards('h'));
      const count = target - player.countCards('h');
      if (count > 0) await player.draw(count);
    } else if (option === 2) {
      const target = maximum(player, current => current.countCards('e'));
      const attempted = new Set();
      while (player.isIn() && player.countCards('e') < target) {
        const candidates = equipmentCandidates(player, attempted);
        if (!candidates.length) break;
        const card = candidates[get.rand(0, candidates.length - 1)];
        attempted.add(card);
        // canEquip(card,false) requires free compatible slots: this is an
        // actual use, not a gain/equip shortcut or a same-slot replacement.
        await player.useCard(card, player, false);
        if (!player.isIn()) break;
      }
    } else if (option === 3) {
      const target = Math.min(player.maxHp, maximum(player, current => current.hp));
      const count = target - player.hp;
      if (count > 0) await player.recover(count);
    }
  }

  /**
   * The caller of forced=true has already accepted the surrounding reward.
   * It still selects effects when any exist, without another yes/no prompt.
   * allowEmpty permits confirming zero effects, including when legal ones exist.
   */
  async function invoke(player, options = {}) {
    const x = qCount(player);
    const available = availableOptions(player);
    const limit = Math.min(x, available.length);
    if (!limit) return { bool: !!options.allowEmpty, x, options: [] };
    const prompt = `居椒：选择至多${limit}项，依次执行`;
    const choice = await player.chooseButton(
      [prompt, [available.map(option => [option, labels[option]]), 'textbutton']],
      [options.allowEmpty ? 0 : 1, limit], !!options.forced,
    ).set('ai', () => 1).forResult();
    if (!choice.bool) return { bool: false, x, options: [] };
    const selected = [...new Set(choice.links || [])]
      .filter(option => available.includes(option))
      .sort((a, b) => a - b)
      .slice(0, limit);
    if (!selected.length) return { bool: !!options.allowEmpty, x, options: [] };
    player.logSkill(skillId);
    for (const option of selected) {
      if (!player.isIn()) break;
      await executeOption(player, option);
      if (!player.isIn()) break;
    }
    return { bool: true, x, options: selected };
  }

  api.jujiao = { invoke };
  return {
    skills: {
      [skillId]: {
        trigger: { global: ['roundStart', 'roundEnd'] },
        direct: true,
        filter(event, player) {
          return qCount(player) > 0 && availableOptions(player).length > 0;
        },
        // ArrayCompiler retains this factory's closure in native 1.11.6.
        // Native roundStart/roundEnd each occur once per round; neither
        // `usable` (per turn) nor `round` (shared by both timings) fits here.
        content: [async function (event, trigger, player) {
          await invoke(player, { reason: event.triggername });
        }],
      },
    },
    translate: {
      [skillId]: '居椒',
      [skillId + '_info']: '每轮开始时和结束时，你可以选择至多X项不同的选项，按序执行：①将手牌摸至全场最多；②优先从牌堆、其次从弃牌堆随机使用能增加你装备数的装备牌，直至装备数达到全场最多或没有可用装备；③将体力回复至全场最多，但不超过体力上限。X为你手牌中有效花色点数为黑桃Q的牌数，各项上限在该项开始执行时确定。',
    },
  };
},
function neixunFactory(lib, game, ui, get, ai, _status, api) {
 const ID = 'Q郭照_内训';
 const REWARD = ID + '_reward';
 const RECORDER = ID + '_damage_record';
 const BONUS = ID + '_bonus';
 const FIRST = '选项一';
 const SECOND = '选项二';
 const phases = new WeakMap();
 let outside = {};
 let installed = false;

 // A nested inserted phase has its own identity even when phaseNumber is equal.
 function phaseOf(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.name === 'phase') return event;
  if (typeof event.getParent === 'function') {
   const phase = event.getParent('phase');
   if (phase && phase.name === 'phase') return phase;
  }
  const seen = new Set();
  for (let current = event.parent; current && !seen.has(current); current = current.parent) {
   if (current.name === 'phase') return current;
   seen.add(current);
  }
  return null;
 }
 function phaseState(phase) {
  if (!phase) return null;
  let record = phases.get(phase);
  if (!record) { record = { damaged: false, holders: new WeakMap() }; phases.set(phase, record); }
  return record;
 }
 function holderState(phase, player) {
  const record = phaseState(phase);
  if (!record) return null;
  let state = record.holders.get(player);
  if (!state) { state = { used: [0, 0], prevented: false, offered: false }; record.holders.set(player, state); }
  return state;
 }
 function limit(player) {
  const bonus = Number(player.storage && player.storage[BONUS]);
  return 1 + (Number.isFinite(bonus) && bonus > 0 ? Math.floor(bonus) : 0);
 }
 function realDamage(event) {
  return !!event && !event.unreal && !event._cancelled && Number.isFinite(Number(event.num)) && Number(event.num) > 0;
 }
 function options(event, player) {
  if (!realDamage(event) || event.finished || !event.source || event.source === player) return [];
  if (typeof event.source.isIn === 'function' && !event.source.isIn()) return [];
  const state = holderState(phaseOf(event) || outside, player);
  const choices = [];
  if (state.used[0] < limit(player)) choices.push(FIRST);
  if (state.used[1] < limit(player) && event.source.countCards('he') >= 2) choices.push(SECOND);
  return choices;
 }
 function recordDamage(event) {
  if (!realDamage(event)) return;
  const record = phaseState(phaseOf(event));
  if (record) record.damaged = true;
 }
 function hasActualDamage(phase) {
  const record = phaseState(phase);
  if (!record) return false;
  if (record.damaged) return true;
  // Native damage writes this history even with notrigger, and while a holder
  // is sealed, dead, or temporarily has lost the main skill.
  const players = new Set([].concat(game.players || [], game.dead || []));
  for (const player of players) {
   if (typeof player.getAllHistory !== 'function') continue;
   const history = player.getAllHistory('damage');
   if (history.some(event => realDamage(event) && phaseOf(event) === phase)) {
    record.damaged = true;
    return true;
   }
  }
  return false;
 }
 function mayReward(event, player) {
  const phase = phaseOf(event);
  const state = holderState(phase, player);
  return !!state && state.prevented && !state.offered && !hasActualDamage(phase);
 }
 async function intervene(event, trigger, player) {
  if (!options(trigger, player).length) return;
  const answer = await player.chooseBool('内训：是否令' + get.translation(trigger.source) + '选择一项？')
   .set('ai', () => get.attitude(player, trigger.player) > 0 || trigger.source.countCards('he') >= 2).forResult();
  if (!answer.bool) return;
  const choices = options(trigger, player);
  if (!choices.length) return;
  const amount = Number(trigger.num);
  const source = trigger.source;
  const phase = phaseOf(trigger) || outside;
  const state = holderState(phase, player);
  const result = await source.chooseControl(choices)
   .set('prompt', '内训：选择一项执行')
   .set('choiceList', choices.map(choice => choice === FIRST
    ? '防止本次伤害，然后原受伤角色交给你一张手牌或装备牌'
    : '交给' + get.translation(player) + '两张手牌或装备牌，然后受到其造成的' + amount + '点伤害，原伤害继续结算'))
   .set('ai', () => 0).forResult();
  // No cost or nested damage starts before the shared quota has been occupied.
  const choice = choices.includes(result.control) ? result.control : choices[0];
  if (!options(trigger, player).includes(choice)) return;
  const index = choice === FIRST ? 0 : 1;
  state.used[index]++;
  player.logSkill(ID, source);
  if (index === 0) {
   state.prevented = true;
   // Native cancel() finishes the damage and emits damageCancelled. Await the
   // event so cancellation children resolve before the victim gives their card.
   await trigger.cancel();
   if (trigger.player.countCards('he') > 0) {
    await trigger.player.chooseToGive(source, 1, 'he', true)
     .set('prompt', '内训：交给' + get.translation(source) + '一张手牌或装备牌');
   }
  } else {
   await source.chooseToGive(player, 2, 'he', true)
    .set('prompt', '内训：交给' + get.translation(player) + '两张手牌或装备牌');
   // Payment can trigger a death. The already-started reflection may retain a
   // dead Guozhao as source, but must not damage a victim who has left play.
   if (typeof source.isIn !== 'function' || source.isIn()) await source.damage(amount, player);
  }
 }
 async function reward(event, trigger, player) {
  if (!mayReward(trigger, player)) return;
  const state = holderState(phaseOf(trigger), player);
  state.offered = true;
  const answer = await player.chooseBool('内训：是否发动一次居椒，并令内训两项每回合次数上限永久各增加一次？')
   .set('ai', () => true).forResult();
  if (!answer.bool) return;
  player.logSkill(ID);
  await api.jujiao.invoke(player, { forced: true, allowEmpty: true, reason: '内训' });
  if (!player.storage) player.storage = {};
  player.storage[BONUS] = limit(player);
 }
 function install() {
  if (installed) return;
  installed = true;
  game.addGlobalSkill(RECORDER);
 }
 api.neixun = { install };
 return {
  skills: {
   [ID]: {
    audio: false, direct: true, trigger: { global: 'damageBegin4' }, group: [REWARD],
    filter(event, player) { return options(event, player).length > 0; },
    content: [intervene],
   },
   [REWARD]: {
    audio: false, direct: true, lastDo: true, priority: -10,
    trigger: { global: 'phaseAfter' },
    filter: mayReward,
    content: [reward],
   },
   [RECORDER]: {
    charlotte: true, ruleSkill: true, forced: true, popup: false,
    firstDo: true, priority: 1000, forceDie: true, forceOut: true,
    trigger: { global: ['damage', 'phaseBefore', 'phaseAfter'] },
    filter(event) { return event.name === 'phase' || realDamage(event) && !!phaseOf(event); },
    content: [async (event, trigger) => {
     // Damage with no enclosing phase still has a shared outside window, but
     // its prevention never qualifies any later real phase for a reward.
     if (trigger.name === 'phase') outside = {};
     else recordDamage(trigger);
    }],
   },
  },
  translate: {
   [ID]: '内训', [REWARD]: '内训', [RECORDER]: '内训伤害记录',
   [ID + '_info']: '每回合每项限一次，其他角色造成正数真实伤害时，你可以令伤害来源选择一项尚可执行的选项：①防止此伤害，然后原受伤角色交给其一张手牌或装备牌（无牌也防止伤害）；②其交给你两张手牌或装备牌，然后受到你造成的、本次原伤害值的伤害，原伤害继续结算（不足两张不能选择）。每回合结束时，若全场本回合没有实际伤害，且你曾以此法防止伤害，你可以发动一次居椒（无黑桃Q或无可执行项时可空结算），然后令本技能两项每回合次数上限永久各增加一次。',
  },
 };
},
function pokerqFactory(lib,game,ui,get,ai,_status,api){
 const ids={lose:'皇庭_黑桃Q失去',gain:'皇庭_黑桃Q获得',discard:'皇庭_黑桃Q弃置'};
 const lossSeen=new WeakSet(),lossSnapshot=new WeakMap(),gainSeen=new WeakMap();
 let installed=false;
 const living=()=>game.players.filter(p=>p.isIn());
 const isQ=card=>api.royal.isPoker(card)&&get.suit(card,false)==='spade'&&get.number(card,false)===12;
 const guozhao=p=>api.royal.identity(p,'郭照');
 const color=(card,p)=>get.color(card,p);
 const recognized=c=>c==='red'||c==='black';
 function chain(record,parent){
  const seen=new Set();let e=record;
  while(e&&!seen.has(e)){if(e===parent)return true;seen.add(e);e=typeof e.getParent==='function'?e.getParent():e.parent;}
  return false;
 }
 function snapshot(player,record){
  if(lossSnapshot.has(record))return lossSnapshot.get(record);
  const h=player.getCards('h'),red=h.filter(c=>color(c,player)==='red').length,black=h.filter(c=>color(c,player)==='black').length;
  const result={player,record,search:(record.hs||[]).length>0&&h.some(isQ)&&red===black,recast:(record.cards2||record.cards||[]).some(isQ)};
  lossSnapshot.set(record,result);return result;
 }
 function losses(trigger){
  const records=[];
  if(trigger.name==='lose'&&trigger.player)records.push({player:trigger.player,record:trigger});
  for(const player of living())for(const record of player.getHistory('lose')||[])if(chain(record,trigger)&&!records.some(x=>x.record===record))records.push({player,record});
  return records.filter(x=>guozhao(x.player)&&x.player.isIn()&&!lossSeen.has(x.record)).map(x=>snapshot(x.player,x.record)).filter(x=>x.search||x.recast);
 }
 function pileCard(wanted,player){
  for(const area of ['cardPile','discardPile']){
   // Unowned pile cards use their raw color, independent of the recipient's
   // hand-suit modifiers. The holder view remains correct for hand equality.
   const cards=Array.from(ui[area]?.childNodes||[]).filter(c=>get.color(c,false)===wanted);
   if(cards.length)return cards[Math.floor(Math.random()*cards.length)];
  }
 }
 async function search(player){
  const result=await player.chooseControl('红色','黑色','cancel2').set('prompt','黑桃Q：可以选择一种颜色，随机检索一张该颜色的牌（牌堆优先）').set('ai',()=>0).forResult();
  if(!player.isIn())return;
  const wanted=result.control==='红色'?'red':result.control==='黑色'?'black':null;
  if(!wanted)return;
  const card=pileCard(wanted,player);if(card)await player.gain([card],'gain2');
 }
 async function recast(player){
  const allowed=card=>lib.filter.cardRecastable(card,player,player,false);
  if(!player.getCards('he').some(c=>allowed(c)&&recognized(color(c,player))))return;
  const result=await player.chooseCard('he',[1,Infinity],'黑桃Q：可以重铸任意张同色牌',function(card,owner){
   const c=color(card,owner);return allowed(card)&&recognized(c)&&(!ui.selected.cards.length||c===color(ui.selected.cards[0],owner));
  }).set('ai',card=>4-get.value(card)).forResult();
  if(!result.bool||!player.isIn())return;
  const cards=(result.cards||[]).filter(c=>player.getCards('he').includes(c)&&allowed(c));
  if(cards.length&&recognized(color(cards[0],player))&&cards.every(c=>color(c,player)===color(cards[0],player)))await player.recast(cards);
 }
 async function resolveLoss(trigger){
  const entries=losses(trigger);
  for(const entry of entries)lossSeen.add(entry.record);
  for(const entry of entries){
   const player=entry.player;if(!player.isIn())continue;
   let order=['search','recast'];
   if(entry.search&&entry.recast){
    const answer=await player.chooseControl('检索在先','重铸在先').set('prompt','黑桃Q：两项效果均满足条件，选择结算顺序（每项仍可放弃）').set('ai',()=>0).forResult();
    if(answer.control==='重铸在先')order.reverse();
   }
   for(const effect of order)if(entry[effect]&&player.isIn())await (effect==='search'?search(player):recast(player));
  }
 }
 function seen(record,player,write=false){
  let set=gainSeen.get(record);if(write&&!set)gainSeen.set(record,set=new Set());
  if(write)set.add(player);return !!set?.has(player);
 }
 function gains(trigger){
  if(trigger.name==='gain'&&trigger.player)return trigger.getlx===false?[]:[{player:trigger.player,cards:trigger.cards||[],records:[trigger]}];
  if(typeof trigger.getg!=='function')return [];
  return living().map(player=>{
   const records=(player.getHistory('gain')||[]).filter(e=>e.parent===trigger||(typeof e.getParent==='function'&&e.getParent()===trigger));
   const unseen=records.filter(e=>!seen(e,player));
   return {player,cards:records.length?unseen.flatMap(e=>e.cards||[]):trigger.getg(player)||[],records:records.length?unseen:[trigger]};
  });
 }
 function gainEligible(item){return item.player.isIn()&&!guozhao(item.player)&&!api.royal.identity(item.player,'曹丕')&&item.cards.some(isQ)&&item.records.length>0&&!item.records.every(e=>seen(e,item.player));}
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [ids.lose]:rule({trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},
   filter(event,player){return api.royal.active()&&player.isIn()&&losses(event).length>0;},
   content:[async function(event,trigger){await resolveLoss(trigger);}]}),
  [ids.gain]:rule({trigger:{global:['gainAfter','loseAsyncAfter']},
   filter(event,player){return api.royal.active()&&player.isIn()&&gains(event).some(gainEligible);},
   content:[async function(event,trigger){
    for(const item of gains(trigger))if(gainEligible(item)){
     for(const record of item.records)seen(record,item.player,true);
     for(const observer of living().filter(guozhao))if(item.player.isIn()&&observer.isIn())await observer.viewHandcards(item.player);
    }
   }]}),
  [ids.discard]:{charlotte:true,ruleSkill:true,enable:'phaseUse',position:'h',selectCard:1,selectTarget:0,notarget:true,discard:true,lose:true,delay:false,
   filter(event,player){return api.royal.active()&&player.isIn()&&api.royal.identity(player,'曹丕')&&player.countCards('h',c=>isQ(c)&&lib.filter.cardDiscardable(c,player,ids.discard))>0;},
   filterCard(card,player){return isQ(card)&&lib.filter.cardDiscardable(card,player,ids.discard);},
   content:[async function(event,trigger,player){
    const cards=[];for(const c of ['red','black']){const card=pileCard(c,player);if(card)cards.push(card);}
    if(player.isIn()&&cards.length)await player.gain(cards,'gain2');
   }],ai:{order:7,result:{player:1}}},
 };
 const translate={
  [ids.lose]:'黑桃Q',[ids.gain]:'黑桃Q',[ids.discard]:'黑桃Q',
  [ids.discard+'_info']:'出牌阶段，你可以弃置一张黑桃Q扑克牌，随机检索一张红色牌和一张黑色牌（牌堆优先，次数不限）。',
 };
 api.pokerq={ids,isQ,losses,resolveLoss,install(){if(installed)return;installed=true;for(const [id,skill]of Object.entries(skills)){lib.skill[id]=skill;game.addGlobalSkill(id);}}};
 return{skills,translate};
},
function createYuji(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'K曹丕_御极';
  const USE = 'K曹丕_御极结算';
  const DAMAGE = 'K曹丕_御极伤害';
  const STATE = 'K曹丕_御极记录';
  const DONE = 'K曹丕_御极已结算';
  let serial = 0;
  let installed = false;

  function isIn(player) {
    return !!player && (typeof player.isIn !== 'function' || player.isIn());
  }

  function mark(card) {
    const value = card && card.storage && card.storage[MAIN];
    return card && card.name === 'sha' && value && Number.isInteger(value.x) && value.x >= 1 && value.x <= 4 && typeof value.id === 'string'
      ? value : null;
  }

  function xAtActivation(player) {
    return Math.min(4, 1 + player.getCards('h').filter(card => get.suit(card, player) === 'spade' && get.number(card, player) === 13).length);
  }

  function virtualSha(x) {
    return { name: 'sha', isCard: true, storage: { [MAIN]: { x, id: 'K曹丕御极' + (++serial) } } };
  }

  function canOrder(player) {
    if (!isIn(player)) return false;
    // canUse's third/fourth arguments independently bypass distance and count.
    // It still checks cardEnabled, targetEnabled and all ordinary immunity mods.
    const card = { name: 'sha', isCard: true };
    return game.hasPlayer(target => isIn(target) && player.canUse(card, target, false, false));
  }

  function parentOf(event) {
    if (!event) return null;
    return typeof event.getParent === 'function' ? event.getParent() : event.parent;
  }

  function useParent(event) {
    const seen = new Set();
    let current = event;
    while (current && !seen.has(current)) {
      seen.add(current);
      if (current.name === 'useCard') return current;
      current = parentOf(current);
    }
    return null;
  }

  function damageState(damage, seen) {
    if (!damage || damage.name !== 'damage') return null;
    const cardMark = mark(damage.card);
    if (!cardMark) return null;
    seen = seen || new Set();
    if (seen.has(damage)) return null;
    seen.add(damage);
    const parent = parentOf(damage);
    let state;
    if (parent && parent.name === 'sha' && parent.type === 'card') {
      const use = useParent(parent);
      state = use && use[STATE];
      const parentMark = mark(parent.card);
      if (!parentMark || parentMark.id !== cardMark.id) return null;
    } else if (parent && (parent.name === '_lianhuan' || parent.name === '_lianhuan2')) {
      // Native link damage copies the card and source, but its immediate parent
      // is the link skill. Follow that skill's original damage trigger only.
      const original = typeof parent.getTrigger === 'function' ? parent.getTrigger() : parent._trigger;
      state = damageState(original, seen);
    } else {
      // A skill can deal independent damage inside the same useCard parent
      // chain, sometimes even inheriting its card. That is not this sha.
      return null;
    }
    if (!state || state.id !== cardMark.id || damage.source !== state.source) return null;
    return state;
  }

  const skills = {
    [MAIN]: {
      enable: 'phaseUse',
      usable: 1,
      filter(event, player) {
        return game.hasPlayer(current => canOrder(current));
      },
      filterTarget(card, player, target) {
        return canOrder(target);
      },
      selectTarget: 1,
      content: [
        async (event, trigger, player) => {
          const target = event.target || (event.targets && event.targets[0]);
          const x = xAtActivation(player);
          if (!isIn(target) || !canOrder(target)) return;
          const card = virtualSha(x);
          // Native chooseUseTarget owns target selection and calls useCard.
          // It preserves selectTarget mods, added targets and all sha responses.
          await target.chooseUseTarget({
            card,
            forced: true,
            nodistance: true,
            addCount: false,
            prompt: '御极：请选择此普通【杀】的合法目标',
          });
        },
      ],
      ai: {
        order: 8,
        result: {
          target(player, target) {
            return game.hasPlayer(current => current !== target && target.canUse({ name: 'sha' }, current, false, false) && get.effect(current, { name: 'sha' }, target, player) > 0) ? 1 : 0;
          },
        },
      },
    },
    [USE]: {
      charlotte: true,
      forced: true,
      popup: false,
      silent: true,
      firstDo: true,
      priority: 10000,
      forceDie: true,
      forceOut: true,
      trigger: { global: 'useCard1' },
      filter(event) {
        return !!mark(event.card) && !event[STATE];
      },
      content: [
        async (event, trigger) => {
          const cardMark = mark(trigger.card);
          if (!cardMark || trigger[STATE]) return;
          trigger[STATE] = { x: cardMark.x, id: cardMark.id, source: trigger.player };
          if (cardMark.x >= 3) trigger.effectCount = (typeof trigger.effectCount === 'number' ? trigger.effectCount : 1) + 1;
        },
      ],
      mod: {
        cardUsable(card) {
          if (mark(card)) return Infinity;
        },
        targetInRange(card) {
          if (mark(card)) return true;
        },
      },
    },
    [DAMAGE]: {
      charlotte: true,
      forced: true,
      popup: false,
      silent: true,
      firstDo: true,
      priority: 10000,
      forceDie: true,
      forceOut: true,
      trigger: { global: 'damageBegin1' },
      filter(event) {
        if (event[DONE]) return false;
        const state = damageState(event);
        return !!state && state.x >= 2;
      },
      content: [
        async (event, trigger) => {
          if (trigger[DONE]) return;
          const state = damageState(trigger);
          if (!state || state.x < 2) return;
          trigger[DONE] = true;
          if (state.x >= 4) trigger.num++;
          // This resolves before the remaining damageBegin stages and HP loss.
          // Later cancellation cannot take these cards back.
          if (isIn(state.source)) await state.source.draw(2);
        },
      ],
    },
  };

  api.yuji = {
    install() {
      if (installed) return;
      installed = true;
      game.addGlobalSkill(USE);
      game.addGlobalSkill(DAMAGE);
    },
  };

  return {
    skills,
    translate: {
      [MAIN]: '御极',
      [MAIN + '_info']: '出牌阶段限一次，你可令一名有合法【杀】目标的角色选择合法目标并视为使用一张普通【杀】。X为你发动时手中有效花色为黑桃且点数为K的牌数加一（至多为4）。此【杀】依次获得前X项效果：①无距离和次数限制且不计入使用次数；②每次即将造成伤害时，使用者先摸两张牌；③额外结算一次；④每次伤害+1。',
      [USE]: '御极',
      [DAMAGE]: '御极',
    },
  };
},
function quancaiFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'K曹丕_铨才';
  const STATE = 'K曹丕_铨才状态';
  // Event identity, rather than a phase counter or currentPhase player, keeps
  // a nested extra turn separate and lets the interrupted parent resume.
  const phases = new WeakMap();
  let installed = false;

  function inGame(player) {
    return !!player && player.isIn();
  }
  function phaseOf(event) {
    const seen = new Set();
    for (let current = event; current && !seen.has(current); current = current.parent) {
      if (current.name === 'phase') return current;
      seen.add(current);
    }
    return undefined;
  }
  function activeState(player, event = _status.event) {
    const phase = phaseOf(event);
    const state = phase && phases.get(phase);
    return state && state.actor === player && inGame(player) ? state : undefined;
  }
  function number(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  function record(phase, actor, won, threshold) {
    let state = phases.get(phase);
    if (!state) {
      state = { actor, wins: 0, limits: [] };
      phases.set(phase, state);
    }
    if (won) state.wins++;
    else state.limits.push(threshold);
  }
  function limitUse(card, player) {
    const state = activeState(player);
    if (state && state.limits.length &&
      number(get.number(card, player)) > Math.min(...state.limits)) return false;
  }
  function install() {
    if (installed) return;
    installed = true;
    game.addGlobalSkill(STATE);
  }

  const skills = {
    [MAIN]: {
      trigger: { global: 'phaseBegin' },
      direct: true,
      filter(event, player) {
        const phase = phaseOf(event);
        const target = event.player;
        return !!phase && phase.player === target && target !== player &&
          inGame(player) && inGame(target) && target.countCards('h') > 0;
      },
      content: [async function (event, trigger, player) {
        const target = trigger.player;
        const phase = phaseOf(trigger);
        if (!phase || phase.player !== target || target === player ||
          !inGame(player) || !inGame(target) || !target.countCards('h')) return;
        const choice = await player.chooseBool('铨才：是否令' + get.translation(target) + '与牌堆顶牌拼点？')
          .set('ai', () => get.attitude(player, target) > 0).forResult();
        if (!choice.bool || !inGame(player) || !inGame(target) || !target.countCards('h')) return;
        player.logSkill(MAIN, target);

        // The installed engine natively accepts the non-player "cardPile"
        // opponent. It chooses this actor's hand card before taking the top
        // card, emits compare/compareFixing, and discards via normal ordering.
        // Caopi is neither compare participant nor card contributor.
        const compare = target.chooseToCompare('cardPile');
        compare.set('compareType', 'top');
        compare.set('position', 'h');
        const result = await compare.forResult();
        if (!result || result.cancelled || !inGame(player) || !inGame(target)) return;
        const won = result.bool === true;
        // Native result.num1 is copied before compareFixing. Read the event
        // itself so late, normal compare number changes remain authoritative.
        const threshold = number(compare.num1 === undefined ? result.num1 : compare.num1);
        const prompt = won ?
          '铨才：是否令' + get.translation(target) + '本回合摸牌阶段摸牌数、使用杀的次数上限和手牌上限各+1？' :
          '铨才：是否对' + get.translation(target) + '造成1点伤害，且令其本回合只能使用点数不大于' + threshold + '的牌？';
        const accept = await player.chooseBool(prompt)
          .set('ai', () => won ? get.attitude(player, target) > 0 : get.attitude(player, target) < 0).forResult();
        if (!accept.bool || !inGame(player) || !inGame(target)) return;
        record(phase, target, won, threshold);
        // The use restriction is already committed when damage begins;
        // damage prevention therefore cannot undo the chosen result package.
        if (!won) await target.damage(1, player);
      }],
      ai: { threaten: 1.4 },
    },
    [STATE]: {
      charlotte: true,
      ruleSkill: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      forceOut: true,
      trigger: { player: ['phaseDrawBegin2', 'phaseAfter'] },
      filter(event) {
        const phase = phaseOf(event);
        const state = phase && phases.get(phase);
        return !!state && state.actor === event.player;
      },
      content: [async function (event, trigger) {
        const phase = phaseOf(trigger);
        const state = phase && phases.get(phase);
        if (!state || state.actor !== trigger.player) return;
        if (trigger.name === 'phase') phases.delete(phase);
        else if (trigger.name === 'phaseDraw' && inGame(trigger.player)) trigger.num += state.wins;
      }],
      mod: {
        cardUsable(card, player, amount) {
          const state = activeState(player);
          if (state && state.wins && get.name(card, player) === 'sha') return amount + state.wins;
        },
        maxHandcard(player, amount) {
          const state = activeState(player);
          if (state && state.wins) return amount + state.wins;
        },
        cardEnabled: limitUse,
        // The native dying/save filter does not consult cardEnabled. Saving
        // with Tao/Jiu still uses a card, so it needs the same use-only gate.
        cardSavable: limitUse,
      },
    },
  };
  api.quancai = { install };
  return {
    skills,
    translate: {
      [MAIN]: '铨才',
      [MAIN + '_info']: '其他角色回合开始时，若其有手牌，你可令其与牌堆顶牌拼点。若其赢，你可令其本回合摸牌阶段摸牌数、使用【杀】的次数上限和手牌上限各+1；否则，你可对其造成1点伤害，且令其本回合只能使用有效点数不大于其此次拼点最终点数的牌（无点数视为0）。',
      [STATE]: '铨才',
    },
  };
},
function pokerkFactory(lib,game,ui,get,ai,_status,api){
 const ids={damage:'皇庭_黑桃K受伤',lose:'皇庭_黑桃K失去',gain:'皇庭_黑桃K获得',use:'皇庭_黑桃K用牌'};
 const lossSeen=new WeakSet(),damageSeen=new WeakSet(),gainSeen=new WeakMap();
 const movementNames=new Set(['gain','loseAsync','equip','addJudge','addToExpansion']);
 let installed=false;
 const living=()=>game.players.filter(p=>p.isIn());
 const isK=card=>api.royal.isPoker(card)&&get.suit(card,false)==='spade'&&get.number(card,false)===13;
 const caopi=p=>api.royal.identity(p,'曹丕');
 const zhangliao=p=>api.royal.identity(p,'张辽');
 const holding=p=>p.getCards('h').some(isK);
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function chain(record,ancestor){const seen=new Set();for(let e=record;e&&!seen.has(e);e=parent(e)){if(e===ancestor)return true;seen.add(e);}return false;}
 function enclosingMove(event){const enclosing=parent(event);return enclosing&&movementNames.has(enclosing.name)?enclosing:null;}
 function extraGain(event){
  // Mark only this gainPlayerCard's own gain. A separate triggered skill may
  // cause a new gain while that event is open and must retain its opportunity.
  const enclosing=parent(event);return event._kcaopiPokerKExtra===true||enclosing?.name==='gainPlayerCard'&&enclosing._kcaopiPokerKExtra===true;
 }
 function hasFangzhu(player){
  // Do not use hasSkill(): fengyin and other blockers suppress execution,
  // but do not remove the displayed skill. No character-definition cache is
  // consulted, so a genuinely removed skill ceases to count immediately.
  const skills=new Set(player.skills||[]);
  for(const id of player.getSkills?.(null,false,false)||[])skills.add(id);
  for(const entry of Object.values(player.additionalSkills||{}))for(const id of Array.isArray(entry)?entry:[entry])if(id)skills.add(id);
  for(const id of Object.keys(player.tempSkills||{}))skills.add(id);
  return [...skills].some(id=>(lib.translate[id]||get.translation?.(id))==='放逐');
 }
 function losses(trigger){
  // An asynchronous move owns all child losses, including several losses of
  // one player. Deferring to its After timing freezes the actual final hand.
  if(enclosingMove(trigger))return [];
  const records=[];
  if(trigger.name==='lose'&&trigger.player)records.push(trigger);
  for(const p of living())for(const record of p.getHistory('lose')||[])if(chain(record,trigger)&&!records.includes(record))records.push(record);
  const grouped=new Map();
  for(const record of records){const p=record.player;if(!p?.isIn()||!caopi(p)||lossSeen.has(record)||![...(record.cards2||[]),...(record.cards||[])].some(isK))continue;
   if(!grouped.has(p))grouped.set(p,{player:p,records:[]});grouped.get(p).records.push(record);
  }
  return [...grouped.values()];
 }
 function seen(record,player,write=false){let set=gainSeen.get(record);if(write&&!set)gainSeen.set(record,set=new Set());if(write)set.add(player);return !!set?.has(player);}
 function gains(trigger){
  if(extraGain(trigger))return [];
  if(trigger.name==='gain'&&trigger.player){if(trigger.getlx===false||enclosingMove(trigger))return [];return [{player:trigger.player,cards:trigger.cards||[],records:[trigger],root:trigger}];}
  if(typeof trigger.getg!=='function')return [];
  return living().map(player=>{
   const all=(player.getHistory('gain')||[]).filter(e=>chain(e,trigger)&&!extraGain(e));
   const records=all.filter(e=>!seen(e,player));
   return {player,cards:all.length?records.flatMap(e=>e.cards||[]):trigger.getg(player)||[],records:all.length?records:[trigger],root:trigger};
  });
 }
 function sources(item){return living().filter(source=>source!==item.player&&source.countCards('h')>0&&(source.getHistory('lose')||[]).some(record=>chain(record,item.root)&&(record.hs||[]).some(card=>item.cards.includes(card))));}
 function gainEligible(item){return item.player.isIn()&&zhangliao(item.player)&&holding(item.player)&&item.records.length>0&&!item.records.every(e=>seen(e,item.player))&&sources(item).length>0;}
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [ids.damage]:rule({trigger:{global:'damageEnd'},filter(event){return api.royal.active()&&event.player?.isIn()&&caopi(event.player)&&holding(event.player)&&!damageSeen.has(event);},content:[async function(event,trigger){
   damageSeen.add(trigger);const player=trigger.player;if(!player.isIn()||!holding(player))return;
   if(hasFangzhu(player)){
    const answer=await player.chooseBool('黑桃K：是否摸两张牌？').set('ai',()=>true).forResult();if(answer.bool&&player.isIn())await player.draw(2);return;
   }
   const answer=await player.chooseTarget('黑桃K：可以令一名其他角色摸你已损失体力值张牌，然后翻面',function(card,owner,target){return target!==owner&&target.isIn();}).set('ai',target=>get.attitude(player,target)).forResult();
   const target=answer.targets?.[0];if(!answer.bool||!player.isIn()||!target?.isIn())return;
   const amount=typeof player.getDamagedHp==='function'?player.getDamagedHp():Math.max(0,player.maxHp-player.hp);
   if(amount>0)await target.draw(amount);if(target.isIn())await target.turnOver();
  }]}),
  [ids.lose]:rule({trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},filter(event){return api.royal.active()&&losses(event).length>0;},content:[async function(event,trigger){
   const entries=losses(trigger);for(const entry of entries)for(const record of entry.records)lossSeen.add(record);
   for(const {player}of entries){if(!player.isIn())continue;
    const answer=await player.chooseTarget('黑桃K：可以令一名角色回复1点体力并复原',function(card,owner,target){return target.isIn();}).set('ai',target=>get.recoverEffect(target,player,player)).forResult();
    const target=answer.targets?.[0];if(!answer.bool||!player.isIn()||!target?.isIn())continue;
    await target.recover(1);if(!target.isIn())continue;
    if(target.isTurnedOver())await target.turnOver();if(target.isIn()&&target.isLinked())await target.link(false);
   }
  }]}),
  [ids.gain]:rule({trigger:{global:['gainAfter','loseAsyncAfter']},filter(event){return api.royal.active()&&gains(event).some(gainEligible);},content:[async function(event,trigger){
   for(const item of gains(trigger))if(gainEligible(item)){
    for(const record of item.records)seen(record,item.player,true);
    const player=item.player,eligible=sources(item);
    const answer=await player.chooseTarget('黑桃K：可以获得本次一名手牌来源的一张手牌',function(card,owner,target){return eligible.includes(target)&&target.isIn()&&target.countCards('h')>0;}).set('ai',target=>-get.attitude(player,target)).forResult();
    const target=answer.targets?.[0];if(!answer.bool||!player.isIn()||!target?.isIn()||!eligible.includes(target)||target.countCards('h')===0)continue;
    await player.gainPlayerCard(target,'h',true).set('_kcaopiPokerKExtra',true);
   }
  }]}),
  [ids.use]:rule({mod:{cardEnabled(card,player){if(api.royal.active()&&player.isIn()&&!caopi(player)&&!zhangliao(player)&&holding(player)&&get.suit(card,player)==='spade')return false;},cardSavable(card,player){if(api.royal.active()&&player.isIn()&&!caopi(player)&&!zhangliao(player)&&holding(player)&&get.suit(card,player)==='spade')return false;}}}),
 };
 const translate={};for(const id of Object.values(ids))translate[id]='黑桃K';
 api.pokerk={ids,isK,hasFangzhu,losses,gains,sources,install(){if(installed)return;installed=true;for(const [id,skill]of Object.entries(skills)){lib.skill[id]=skill;game.addGlobalSkill(id);}}};
 return{skills,translate};
},
function pokerheartFactory(lib,game,ui,get,ai,_status,api){
 const WATER='shuiyanqijuny',FREE='皇庭_红桃J不计次',DEBT='皇庭_红桃J无效层',SHA='皇庭_红桃J刘备杀';
 const ids={start:'皇庭_红桃J回合开始',lose:'皇庭_红桃J失去',discard:'皇庭_红桃J弃置',before:'皇庭_红桃J用牌前',invalid:'皇庭_红桃J无效',reward:'皇庭_红桃J杀收益',clean:'皇庭_红桃J清理'};
 const lossSeen=new WeakSet(),startSeen=new WeakMap(),useSeen=new WeakSet(),damageSeen=new WeakSet(),debts=new WeakMap(),shaStates=new Map();
 const enclosingMoves=new Set(['gain','loseAsync','equip','addJudge','addToExpansion']);
 let installed=false,serial=0;
 const alive=p=>!!p&&p.isIn();
 const living=()=>game.players.filter(alive);
 const guan=p=>api.royal.identity(p,'关羽');
 const liu=p=>api.royal.identity(p,'刘备');
 const isHeart=c=>api.royal.isPoker(c)&&get.suit(c,false)==='heart'&&get.number(c,false)===11;
 const holding=p=>p.getCards('h').some(isHeart);
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function chain(e,ancestor){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur===ancestor)return true;seen.add(cur);}return false;}
 function useParent(e){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur.name==='useCard')return cur;seen.add(cur);}return null;}
 function losses(e){
  if(enclosingMoves.has(parent(e)?.name))return [];
  const records=e.name==='lose'&&e.player?[e]:[];
  for(const p of living())for(const record of p.getHistory('lose')||[])if(chain(record,e)&&!records.includes(record))records.push(record);
  const grouped=new Map();
  for(const record of records){const p=record.player;if(!alive(p)||lossSeen.has(record)||![...(record.cards||[]),...(record.cards2||[])].some(isHeart))continue;
   if(!grouped.has(p))grouped.set(p,{player:p,records:[]});grouped.get(p).records.push(record);
  }
  return [...grouped.values()];
 }
 function search(fn){for(const area of [ui.cardPile,ui.discardPile]){const cards=Array.from(area.childNodes).filter(fn);if(cards.length)return cards[Math.floor(Math.random()*cards.length)];}return null;}
 const free=c=>!!c&&(c.hasGaintag?.(FREE)||Array.isArray(c.cards)&&c.cards.some(x=>x.hasGaintag?.(FREE)));
 function updateDebt(p){p.storage[DEBT]=(debts.get(p)||[]).length;if(p.storage[DEBT])p.markSkill?.(ids.invalid);else p.unmarkSkill?.(ids.invalid);}
 function createSha(p){const id='红桃J杀'+(++serial);shaStates.set(id,{owner:p});return {name:'sha',isCard:true,storage:{[SHA]:id}};}
 const shaMark=c=>c?.name==='sha'&&c.storage?.[SHA];
 function damageState(e,seen=new Set()){
  if(!e||seen.has(e)||!shaMark(e.card))return null;seen.add(e);
  const par=parent(e);let use;
  if(par?.name==='sha'&&par.type==='card')use=useParent(par);
  else if(par?.name==='_lianhuan'||par?.name==='_lianhuan2'){const origin=par.getTrigger?.()||par._trigger;return damageState(origin,seen);}
  else return null;
  const mark=shaMark(e.card);return shaMark(use?.card)===mark?shaStates.get(mark)||null:null;
 }
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [ids.start]:rule({trigger:{global:'phaseBegin'},filter(event){return api.royal.active()&&living().some(p=>guan(p)&&holding(p)&&!startSeen.get(event)?.has(p));},content:[async function(event,trigger){
   let seen=startSeen.get(trigger);if(!seen)startSeen.set(trigger,seen=new Set());
   for(const p of living())if(guan(p)&&holding(p)&&!seen.has(p)){seen.add(p);
    const options=['获得红色牌','获得不计次的杀','cancel2'];
    const answer=await p.chooseControl(options).set('prompt','红桃J：可以获得一张红色牌或一张不计次的【杀】').set('ai',()=>0).forResult();
    if(!alive(p)||!holding(p)||answer.control==='cancel2')continue;
    const kill=answer.control===options[1],card=search(c=>kill?get.name(c,false)==='sha':get.color(c,false)==='red');
    if(card){await p.gain([card],'gain2');if(kill&&alive(p)&&p.getCards('h').includes(card))p.addGaintag([card],FREE);}
   }
  }]}),
  [ids.lose]:rule({trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},filter(event){return api.royal.active()&&losses(event).length>0;},content:[async function(event,trigger){
   const entries=losses(trigger);for(const entry of entries)for(const record of entry.records)lossSeen.add(record);
   for(const {player:p,records}of entries){if(!alive(p))continue;
    if(guan(p)){
     const card={name:WATER,isCard:true};if(!game.hasPlayer(target=>p.canUse(card,target)))continue;
     const answer=await p.chooseBool('红桃J：是否视为使用一张【水淹七军】？').set('ai',()=>true).forResult();
     if(answer.bool&&alive(p))await p.chooseUseTarget({card,forced:true,prompt:'红桃J：选择至多两名角色，首名受伤弃牌，次名受伤摸牌'});
    }else if(!liu(p)){
     const pending=debts.get(p)||[];pending.push({skip:records.map(useParent).find(Boolean)||useParent(trigger)});debts.set(p,pending);updateDebt(p);
     const equips=p.getCards('e',c=>lib.filter.cardDiscardable(c,p,ids.lose));if(equips.length)await p.discard(equips);
    }
   }
  }]}),
  [ids.discard]:{
   charlotte:true,ruleSkill:true,enable:'phaseUse',position:'h',selectCard:1,selectTarget:0,discard:true,lose:true,delay:false,
   filter(event,p){return api.royal.active()&&alive(p)&&liu(p)&&p.countCards('h',c=>isHeart(c)&&lib.filter.cardDiscardable(c,p,ids.discard))>0&&game.hasPlayer(t=>p.canUse({name:'sha',isCard:true},t,false,false));},
   filterCard(c,p){return isHeart(c)&&lib.filter.cardDiscardable(c,p,ids.discard);},
   content:[async function(event,trigger,p){if(!alive(p))return;const card=createSha(p);await p.chooseUseTarget({card,forced:true,nodistance:true,addCount:false,prompt:'红桃J：视为使用一张【杀】'});}],
   ai:{order:7,result:{player:1}},
  },
  [ids.before]:rule({firstDo:true,priority:1000000,trigger:{global:'useCardBefore'},filter(event){return api.royal.active()&&(free(event.card)||shaMark(event.card));},content:[async function(event,trigger){trigger.addCount=false;}],mod:{cardUsable(c){if(free(c)||shaMark(c))return Infinity;},targetInRange(c){if(shaMark(c))return true;}}}),
  [ids.invalid]:rule({mark:true,marktext:'禁',intro:{name:'红桃J：下一张牌无效',content(storage,p){return '之后使用的'+(p.storage[DEBT]||0)+'张牌依次无效。';}},firstDo:true,priority:1000000,trigger:{global:'useCard1'},filter(event){return api.royal.active()&&!useSeen.has(event)&&(debts.get(event.player)||[]).some(debt=>debt.skip!==event);},content:[async function(event,trigger){
   if(useSeen.has(trigger))return;const p=trigger.player,pending=debts.get(p)||[],index=pending.findIndex(debt=>debt.skip!==trigger);if(index<0)return;
   useSeen.add(trigger);pending.splice(index,1);updateDebt(p);trigger.all_excluded=true;if(!Array.isArray(trigger.excluded))trigger.excluded=[];for(const target of trigger.targets||[])if(!trigger.excluded.includes(target))trigger.excluded.push(target);
  }]}),
  [ids.reward]:rule({trigger:{global:'damageEnd'},filter(event){return api.royal.active()&&!damageSeen.has(event)&&!!damageState(event);},content:[async function(event,trigger){
   if(damageSeen.has(trigger))return;const state=damageState(trigger);if(!state)return;damageSeen.add(trigger);if(alive(state.owner)){await state.owner.draw(2);if(alive(state.owner))await state.owner.recover(1);}
  }]}),
  [ids.clean]:rule({trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter','useCardAfter']},filter(){return api.royal.active();},content:[async function(event,trigger){
   if(trigger.name==='useCard'){const mark=shaMark(trigger.card);if(mark)shaStates.delete(mark);return;}
   const records=trigger.name==='lose'?[trigger]:living().flatMap(p=>(p.getHistory('lose')||[]).filter(e=>chain(e,trigger)));
   for(const record of records)for(const c of record.hs||[])if(c.hasGaintag?.(FREE))c.removeGaintag(FREE);
  }]}),
 };
 const water={type:'trick',audio:'shuiyanqijunx',fullskin:true,cardimage:'shuiyanqijunx',enable:true,filterTarget:true,selectTarget:[1,2],targetprompt:['受伤弃牌','受伤摸牌'],
  contentBefore:[async function(event){const use=parent(event);use['皇庭_水淹首目标']=(use.stocktargets||use.targets||[])[0];}],
  content:[async function(event,trigger,p){const target=event.target,use=parent(event);await target.damage(1,'thunder',p);if(!alive(target))return;if(target===use['皇庭_水淹首目标'])await target.chooseToDiscard('he',true);else await target.draw(1);}],
  ai:{order:6,value:4,useful:2,tag:{damage:1,thunderDamage:1,natureDamage:1,loseCard:1},result:{target(p,t){return !ui.selected.targets.length?-1.5:-0.5;}}},
 };
 const translate={};for(const id of Object.values(ids))translate[id]='红桃J';translate[ids.discard+'_info']='出牌阶段，你可以弃置一张红桃J扑克牌，视为使用一张无距离和次数限制的【杀】；此【杀】每次造成伤害后，你摸两张牌并回复1点体力。';translate[FREE]='不计次';
 api.pokerheart={ids,waterName:WATER,freeTag:FREE,debtKey:DEBT,isHeart,holding,losses,search,createSha,damageState,install(){if(installed)return;installed=true;for(const [id,skill]of Object.entries(skills)){lib.skill[id]=skill;game.addGlobalSkill(id);}if(!lib.card[WATER])lib.card[WATER]=water;}};
 return {skills,translate,cards:{[WATER]:water},cardTranslate:{[WATER]:'水淹七军',[WATER+'_info']:'出牌阶段，对至多两名角色使用。目标角色受到1点雷电伤害，然后若其是第一个选择的目标，其弃置一张牌；否则其摸一张牌。'}};
},
function weiyiFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='J关羽_威义',USE='J关羽_威义用牌',DAMAGE='J关羽_威义伤后',BAN='J关羽_威义封锁';
 const seenDamage=new WeakSet();let serial=0,installed=false;
 const inGame=p=>!!p&&(typeof p.isIn!=='function'||p.isIn());
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function marker(card){const m=card?.storage?.[MAIN];return m&&typeof m.id==='string'&&typeof m.owner==='string'?m:null;}
 function makeCard(name,nature,player){const c={name,isCard:true,storage:{[MAIN]:{id:'威义'+(++serial),owner:String(player.playerid)}}};if(nature)c.nature=nature;return c;}
 function ownerOf(card){const m=marker(card);return m?game.players.find(p=>String(p.playerid)===m.owner):null;}
 function holdingJ(player){return player.getCards('h').some(c=>get.suit(c,player)==='heart'&&get.number(c,player)===11);}
 function candidates(event,player){
  const names=[...new Set([...(lib.inpile||[]),api.pokerheart?.waterName||'shuiyanqijuny'])],out=[];
  for(const name of names){
   const info=lib.card[name];if(!info||name==='shandian'||!['basic','trick'].includes(get.type({name},false))||!get.tag({name},'damage'))continue;
   for(const nature of name==='sha'?[undefined,...(lib.inpile_nature||[])]:[undefined]){
    const card=makeCard(name,nature,player);
    if(!event?.filterCard||event.filterCard(get.autoViewAs?get.autoViewAs(card,'unsure',player):card,player,event))out.push(card);
   }
  }
  return out;
 }
 function useParent(e){const visited=new Set();for(let p=e;p&&!visited.has(p);p=parent(p)){if(p.name==='useCard')return p;visited.add(p);}return null;}
 function damageUse(damage,visited=new Set()){
  if(!damage||damage.name!=='damage'||visited.has(damage))return null;visited.add(damage);
  const m=marker(damage.card);if(!m)return null;const p=parent(damage);
  if(p?.name==='_lianhuan'||p?.name==='_lianhuan2'){
   const original=typeof p.getTrigger==='function'?p.getTrigger():p._trigger;
   const use=damageUse(original,visited);return marker(use?.card)?.id===m.id?use:null;
  }
  if(!p||p.type!=='card'||p.name!==damage.card.name||marker(p.card)?.id!==m.id)return null;
  const use=useParent(p);return marker(use?.card)?.id===m.id?use:null;
 }
 function eligible(damage){
  if(seenDamage.has(damage)||!inGame(damage.player)||damage.num<=0||!damageUse(damage))return false;
  const owner=ownerOf(damage.card);return inGame(owner)&&owner.hasSkill(MAIN)&&holdingJ(owner);
 }
 function usesHand(card,player){const cards=Array.isArray(card?.cards)&&card.cards.length?card.cards:[card];return cards.some(c=>get.position(c,true)==='h'&&(!get.owner||get.owner(c)===player));}
 const skills={
  [MAIN]:{
   enable:'phaseUse',usable:1,
   filter(event,player){return player.countCards('h')>0&&candidates(event,player).length>0;},
   chooseButton:{
    dialog(event,player){const list=candidates(event,player).map(c=>[get.type(c,false)==='basic'?'基本':'锦囊','',c.name,c.nature]);return ui.create.dialog('威义',[list,'vcard']);},
    check(button){const p=get.player?.();return p?.getUseValue?.({name:button.link[2],nature:button.link[3]})||1;},
    backup(links,player){
     const card=makeCard(links[0][2],links[0][3],player);
     return{filterCard:true,position:'h',selectCard:1,viewAs:card,selectTarget:[1,Infinity],
      filterTarget(card,user,target){return lib.filter.targetEnabled2(card,user,target)&&lib.filter.targetInRange(card,user,target);},
      check:card=>7-get.value(card),popname:true,
      precontent:[async function(event){const use=event.getParent();if(use)use.addCount=false;}],
     };
    },
    prompt(links){return '将一张手牌当作'+get.translation(links[0][3]||'')+'【'+get.translation(links[0][2])+'】使用，选择至少一名合法目标';},
   },ai:{order:8,result:{player:1}},
  },
  [USE]:{
   charlotte:true,forced:true,popup:false,silent:true,firstDo:true,priority:100000,
   trigger:{global:'useCard1'},filter:event=>!!marker(event.card),
   content:[async function(event,trigger){trigger.addCount=false;}],
   mod:{cardUsable(card){if(marker(card))return Infinity;},targetInRange(card){if(marker(card))return true;},selectTarget(card,player,range){if(marker(card)){range[0]=1;range[1]=Infinity;}}},
  },
  [DAMAGE]:{
   charlotte:true,forced:true,popup:false,silent:true,trigger:{global:'damageEnd'},filter:eligible,
   content:[async function(event,trigger){
    if(!eligible(trigger))return;seenDamage.add(trigger);
    const owner=ownerOf(trigger.card),target=trigger.player;
    const answer=await owner.chooseControl('封锁','回复并交牌','取消').set('prompt','威义：选择对'+get.translation(target)+'执行的效果').set('choiceList',['本回合不能使用手牌且非锁定技失效','回复1点体力，然后交给你一张牌','不发动']).set('ai',()=>get.attitude(owner,target)>0?'回复并交牌':'封锁').forResult();
    if(!inGame(owner)||!owner.hasSkill(MAIN)||!holdingJ(owner)||!inGame(target))return;
    if(answer.control==='封锁'){target.addTempSkill(BAN,{global:'phaseAfter'});return;}
    if(answer.control!=='回复并交牌')return;
    await target.recover(1);
    if(!inGame(owner)||!inGame(target)||target===owner||target.countCards('he')<1)return;
    const result=await target.chooseCard('he',1,true,'威义：交给'+get.translation(owner)+'一张牌').set('ai',card=>7-get.value(card)).forResult();
    const cards=(result.cards||[]).filter(c=>target.getCards('he').includes(c));if(cards.length&&inGame(owner))await target.give(cards.slice(0,1),owner);
   }],
  },
  [BAN]:{
   charlotte:true,mark:true,marktext:'封',intro:{content:'本回合不能使用手牌，且非锁定技失效。'},
   init(player,skill){player.addSkillBlocker(skill);},onremove(player,skill){player.removeSkillBlocker(skill);},
   skillBlocker(skill,player){const info=lib.skill[skill];return !!info&&!info.charlotte&&!info.ruleSkill&&!info.persevereSkill&&!get.is.locked(skill,player);},
   mod:{cardEnabled(card,player){if(usesHand(card,player))return false;},cardSavable(card,player){if(usesHand(card,player))return false;}},
  },
 };
 api.weiyi={makeCard,candidates,damageUse,holdingJ,install(){if(installed)return;installed=true;game.addGlobalSkill(USE);game.addGlobalSkill(DAMAGE);}};
 return{skills,translate:{[MAIN]:'威义',[MAIN+'_info']:'出牌阶段限一次，你可以将一张手牌当做任意伤害牌使用（无距离和次数限制且可以指定任意名目标），此牌造成伤害后，若你手中有红桃J，你可以选择一项：1.受伤角色本回合不能使用手牌且非锁定技失效；2.令受伤角色回复一点体力并交给你一张牌。',[USE]:'威义',[DAMAGE]:'威义',[BAN]:'威义'}};
},
function muijingFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='J关羽_牧荆',TAKE='J关羽_牧荆接管',MARK='J关羽_荆',STATE='J关羽_牧荆接管记录';
 let installed=false;
 const alive=p=>!!p&&(typeof p.isIn!=='function'||p.isIn());
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function enabled(player){return alive(player)&&typeof player.hasSkill==='function'&&player.hasSkill(MAIN);}
 function count(player){return Number(player?.countMark?.(MARK)||0);}
 function flags(event){return event[STATE]||(event[STATE]={source:false,player:false,draw:false,phase:false});}
 function eligible(event,owner){
  if(!event||!enabled(owner))return [];
  const used=event[STATE]||{},items=[];
  function add(role,cost,key,label){const target=event[role];if(!used[key]&&target!==owner&&alive(target)&&count(target)>=cost)items.push({role,cost,key,target,label});}
  if(event.name==='damage'){
   add('source',1,'source','造成这次伤害');
   add('player',1,'player','受到这次伤害');
  }else if(event.name==='draw'){
   const enclosing=parent(event);
   if(enclosing?.name==='phaseDraw'&&(enclosing[STATE]?.draw||enclosing[STATE]?.drawOffered?.includes(owner)))return [];
   add('player',2,'draw','摸牌');
  }else if(event.name==='phaseDraw')add('player',2,'draw','执行这次摸牌');
  else if(event.name==='phaseUse')add('player',3,'phase','进入出牌阶段');
  return items;
 }
 function resetPhaseCounts(player){
  // Native phaseUse resets its original player's counts before its manual
  // phaseUseBefore timing. The replacement seat needs the identical reset.
  const stat=player.getStat();
  for(const id of Object.keys(stat.skill||{})){
   const enable=lib.skill[id]?.enable;
   if(enable==='phaseUse'||Array.isArray(enable)&&enable.includes('phaseUse'))stat.skill[id]=0;
  }
  for(const id of Object.keys(stat.card||{}))if(lib.card[id]?.updateUsable==='phaseUse')stat.card[id]=0;
 }
 async function intercept(event,trigger,owner){
  if(!enabled(owner))return;
  // Source and receiver are separate opportunities. Both may be replaced,
  // retaining the same card, nature and damage event, including self damage.
  for(const offer of eligible(trigger,owner)){
   if(!eligible(trigger,owner).some(x=>x.key===offer.key&&x.target===offer.target))continue;
   if(trigger.name==='phaseDraw'){
    const state=flags(trigger);state.drawOffered??=[];
    if(!state.drawOffered.includes(owner))state.drawOffered.push(owner);
   }
   const answer=await owner.chooseBool('牧荆：是否移去'+get.translation(offer.target)+'的'+offer.cost+'枚“荆”，代替其'+offer.label+'？')
    .set('ai',()=>offer.role==='source'||trigger.name==='draw'||trigger.name==='phaseDraw'||trigger.name==='phaseUse'||get.attitude(owner,offer.target)>0).forResult();
   if(!answer.bool||!enabled(owner)||!eligible(trigger,owner).some(x=>x.key===offer.key&&x.target===offer.target))continue;
   const state=flags(trigger);
   // Mark before the counter changes: losing a mark must not reopen this
   // direction to a second Guan Yu or a nested observer of the same timing.
   state[offer.key]=true;
   offer.target.removeMark(MARK,offer.cost);
   trigger[offer.role]=owner;
   if(trigger.name==='phaseUse')resetPhaseCounts(owner);
   trigger.clearStepCache?.(null);
   owner.logSkill?.(MAIN,offer.target);
  }
 }
 const skills={
  [MAIN]:{
   enable:'phaseUse',usable:1,group:[TAKE],
   filterTarget(card,player,target){return target!==player&&alive(target);},selectTarget:1,
   content:[async function(event,trigger,player){const target=event.target||event.targets?.[0];if(alive(player)&&alive(target)&&target!==player)target.addMark(MARK,1);}],
   ai:{order:7,result:{target(player,target){return get.attitude(player,target)>0?1:-0.5;}}},
  },
  [TAKE]:{
   forced:true,silent:true,popup:false,firstDo:true,priority:10000000,
   trigger:{global:['damageBefore','drawBefore','phaseDrawBefore','phaseUseBefore']},
   filter(event,player){return eligible(event,player).length>0;},
   content:[async function(event,trigger,player){await intercept(event,trigger,player);}],
  },
  [MARK]:{charlotte:true,mark:true,marktext:'荆',intro:{name:'荆',content:'mark'}},
 };
 api.muijing={ids:{main:MAIN,take:TAKE,mark:MARK},eligible,install(){if(installed)return;installed=true;}};
 return{skills,translate:{
  [MAIN]:'牧荆',
  [MAIN+'_info']:'出牌阶段限一次，你可以令一名其他角色获得一个“荆”标记。有“荆”标记的其他角色于以下时机开始时，你可以移去其此时机对应序号枚“荆”，然后代替其进入该时机：①造成或受到伤害时；②摸牌时；③出牌阶段开始时。',
  [TAKE]:'牧荆',[MARK]:'荆',[MARK+'_bg']:'荆',
 }};
},
function yingguiFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='Q吴苋_应贵',TRACK='Q吴苋_应贵首次记录',seen=new WeakMap(),tracked=new WeakSet(),resolved=new WeakSet();let installed=false;
 const alive=p=>!!p&&(typeof p.isIn!=='function'||p.isIn());
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function turnOf(event){const visited=new Set();for(let e=event;e&&!visited.has(e);e=parent(e)){if(e.name==='phase')return e;visited.add(e);}return null;}
 function record(player){let value=seen.get(player);if(!value)seen.set(player,value={turns:new WeakMap(),fallback:null,fallbackEvent:null});return value;}
 function note(event,player){
  const value=record(player),turn=turnOf(event);
  if(turn){if(!value.turns.has(turn))value.turns.set(turn,event);}
  else {const key=game.phaseNumber||0;if(value.fallback!==key){value.fallback=key;value.fallbackEvent=event;}}
 }
 function first(event,player){
  const value=seen.get(player);if(!value)return false;const turn=turnOf(event);
  return turn?value.turns.get(turn)===event:value.fallback===(game.phaseNumber||0)&&value.fallbackEvent===event;
 }
 function count(player){return player.getCards('h').filter(c=>get.suit(c,player)==='heart'&&get.number(c,player)===12).length;}
 function search(amount){
  const result=[];
  for(const area of [ui.cardPile,ui.discardPile]){
   const candidates=Array.from(area?.childNodes||[]).filter(c=>get.suit(c,false)==='heart');
   while(candidates.length&&result.length<amount)result.push(candidates.splice(Math.floor(Math.random()*candidates.length),1)[0]);
   if(result.length>=amount)break;
  }
  return result;
 }
 const skills={
  [TRACK]:{charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,firstDo:true,priority:10000000,
   trigger:{global:'drawBegin'},
   filter(event){return event.num>0&&alive(event.player)&&!tracked.has(event);},
   content:[async function(event,trigger){if(tracked.has(trigger))return;tracked.add(trigger);note(trigger,trigger.player);}],
  },
  [MAIN]:{forced:true,trigger:{player:'drawBegin'},
   filter(event,player){return alive(player)&&event.num>0&&!resolved.has(event)&&first(event,player);},
   content:[async function(event,trigger,player){
    if(!alive(player)||trigger.num<=0||resolved.has(trigger)||!first(trigger,player))return;resolved.add(trigger);
    // Freeze the amount and consume the first-draw opportunity before gaining:
    // a gain-triggered nested draw or a newly found Q cannot amplify this use.
    const cards=search(1+count(player));
    if(cards.length){await player.gain(cards,'gain2');game.updateRoundNumber?.();}
   }],
   ai:{threaten:1.5},
  },
 };
 api.yinggui={count,search,turnOf,install(){if(installed)return;installed=true;game.addGlobalSkill(TRACK);}};
 return{skills,translate:{[MAIN]:'应贵',[TRACK]:'应贵',[MAIN+'_info']:'锁定技，你每回合首次摸牌时，获得一张红桃牌，你手中每有一张红桃Q，就多获得一张。'}};
},
function changleFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='Q吴苋_长乐',ROUND='Q吴苋_长乐轮次';
 const ids={use:'Q吴苋_长乐用牌',reward:'Q吴苋_长乐逐牌',loss:'Q吴苋_长乐弃牌',end:'Q吴苋_长乐回合末',clean:'Q吴苋_长乐清理',mark:'Q吴苋_长乐上限'};
 const stages=new WeakMap(),turns=new WeakMap(),counts=new WeakMap(),discardTotals=new WeakMap(),qualified=new WeakMap(),usedSeen=new WeakSet(),rewardSeen=new WeakSet(),lossSeen=new WeakSet();
 const active=new Set();let installed=false;
 const alive=p=>!!p&&(typeof p.isIn!=='function'||p.isIn());
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function ancestor(e,name){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur.name===name)return cur;seen.add(cur);}return null;}
 const turnOf=e=>ancestor(e,'phase');
 function phaseOf(event){const seen=new Set();for(let e=event;e&&!seen.has(e);e=parent(e)){if(e.name==='phaseUse')return e;if(e.name==='phase')return null;seen.add(e);}return null;}
 function countAt(phase,player){return counts.get(phase)?.get(player)||0;}
 function bump(phase,player){let map=counts.get(phase);if(!map)counts.set(phase,map=new Map());const n=(map.get(player)||0)+1;map.set(player,n);return n;}
 function listAt(phase){return stages.get(phase)||[];}
 function handBonus(player,context=_status.event){const turn=turnOf(context);let n=0;for(const record of active)if(record.target===player&&record.turn===turn)n+=record.bonus;return n;}
 function updateMark(player){if(!player)return;let n=0;for(const record of active)if(record.target===player)n+=record.bonus;if(n)player.markSkill?.(ids.mark);else player.unmarkSkill?.(ids.mark);}
 function canFree(card,player){
  const context=_status.event,use=ancestor(context,'useCard');
  if(use?.player===player&&use.card===card&&qualified.has(use))return qualified.get(use).length>0;
  const phase=phaseOf(context);if(!phase)return false;
  return listAt(phase).some(r=>r.target===player&&countAt(phase,player)<r.x);
 }
 function chain(event,ancestorEvent){const seen=new Set();for(let cur=event;cur&&!seen.has(cur);cur=parent(cur)){if(cur===ancestorEvent)return true;seen.add(cur);}return false;}
 async function activate(event,trigger,owner){
  if(!alive(owner)||!alive(trigger.player)||owner.storage[ROUND]===game.roundNumber)return;
  const choice=await owner.chooseBool('长乐：是否弃置至多五张同花色手牌，令'+get.translation(trigger.player)+'获得长乐效果？').set('ai',()=>get.attitude(owner,trigger.player)>0).forResult();
  if(!choice.bool||!alive(owner)||!alive(trigger.player))return;
  const answer=await owner.chooseCard('h',[0,5],true,'长乐：选择至多五张同花色手牌（可以不选）').set('filterCard',function(card,player){return lib.filter.cardDiscardable(card,player,MAIN)&&(!ui.selected.cards.length||get.suit(card,player)===get.suit(ui.selected.cards[0],player));}).set('ai',card=>5-get.value(card)).forResult();
  if(!alive(owner)||!alive(trigger.player))return;
  const cards=(answer.cards||[]).filter(c=>owner.getCards('h').includes(c)&&lib.filter.cardDiscardable(c,owner,MAIN)).slice(0,5);
  if(cards.some(c=>get.suit(c,owner)!==get.suit(cards[0],owner)))return;
  owner.storage[ROUND]=game.roundNumber;owner.logSkill?.(MAIN,trigger.player);
  let x=0;
  if(cards.length){const move=owner.discard(cards);await move;const actual=typeof move.getl==='function'?move.getl(owner).cards2:move.cards; x=(actual||cards).filter(c=>cards.includes(c)).length;}
  const turn=turnOf(trigger),target=trigger.player;
  const record={owner,target,phase:trigger,turn,x,bonus:0,discarded:discardTotals.get(turn)?.get(target)||0,checked:false};
  let list=stages.get(trigger);if(!list)stages.set(trigger,list=[]);list.push(record);
  if(turn){let pending=turns.get(turn);if(!pending)turns.set(turn,pending=[]);pending.push(record);}
  active.add(record);
  if(alive(target))await target.recover(1);
 }
 async function reward(trigger){
  if(rewardSeen.has(trigger))return;rewardSeen.add(trigger);
  for(const record of qualified.get(trigger)||[]){
   const {owner,target}=record;if(!alive(owner))continue;
   await owner.draw(1);
   if(!alive(owner)||!alive(target)||owner.countCards('he')<1)continue;
   const answer=await owner.chooseCard('he',1,'长乐：可以交给'+get.translation(target)+'一张牌，令其本回合手牌上限+1').set('ai',card=>5-get.value(card)).forResult();
   const card=answer.cards?.find(c=>owner.getCards('he').includes(c));if(!answer.bool||!card||!alive(owner)||!alive(target))continue;
   let delivered=owner===target;
   if(!delivered){const move=owner.give([card],target);await move;
    delivered=(typeof move.getg==='function'&&(move.getg(target)||[]).includes(card))||(target.getHistory('gain')||[]).some(e=>chain(e,move)&&(e.cards||[]).includes(card));
   }
   if(delivered){record.bonus++;updateMark(target);}
  }
 }
 function onLoss(record){
  if(lossSeen.has(record))return;lossSeen.add(record);
  if(record.type!=='discard')return;
  const phaseDiscard=ancestor(record,'phaseDiscard');if(!phaseDiscard)return;
  const turn=turnOf(phaseDiscard);if(!turn||turnOf(record)!==turn)return;
  const n=(record.cards2||record.cards||[]).length;if(!n)return;
  let totals=discardTotals.get(turn);if(!totals)discardTotals.set(turn,totals=new Map());totals.set(record.player,(totals.get(record.player)||0)+n);
  for(const item of turns.get(turn)||[])if(item.target===record.player)item.discarded+=n;
 }
 async function endTurn(turn){
  // Mark a record before inserting its extra phase. A newly-created Changle
  // from another owner in that phase can be handled once by this same queue.
  while(true){const record=(turns.get(turn)||[]).find(r=>!r.checked);if(!record)break;record.checked=true;
   if(alive(record.target)&&record.discarded<record.target.getHandcardLimit())await record.target.phaseUse();
  }
 }
 function cleanup(turn){for(const record of turns.get(turn)||[]){active.delete(record);updateMark(record.target);}turns.delete(turn);discardTotals.delete(turn);}
 const rule=body=>Object.assign({charlotte:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [MAIN]:{direct:true,trigger:{global:'phaseUseBegin'},filter(event,player){return alive(player)&&alive(event.player)&&player.storage[ROUND]!==game.roundNumber;},content:[async function(event,trigger,player){await activate(event,trigger,player);}],ai:{expose:0.1}},
  [ids.use]:rule({firstDo:true,priority:10000000,trigger:{global:'useCardBefore'},filter:event=>!usedSeen.has(event),content:[async function(event,trigger){
   if(usedSeen.has(trigger))return;usedSeen.add(trigger);const phase=phaseOf(trigger);if(!phase)return;
   const n=bump(phase,trigger.player),eligible=listAt(phase).filter(r=>r.target===trigger.player&&n<=r.x);
   if(eligible.length){qualified.set(trigger,eligible);trigger.addCount=false;}
  }],mod:{cardUsable(card,player){if(canFree(card,player))return Infinity;},targetInRange(card,player){if(canFree(card,player))return true;}}}),
  [ids.reward]:rule({trigger:{global:'useCardAfter'},filter:event=>qualified.has(event)&&!rewardSeen.has(event),content:[async function(event,trigger){await reward(trigger);}]}),
  [ids.loss]:rule({trigger:{global:'loseAfter'},filter:event=>!lossSeen.has(event)&&event.type==='discard'&&!!ancestor(event,'phaseDiscard'),content:[async function(event,trigger){onLoss(trigger);}]}),
  [ids.end]:rule({firstDo:true,priority:1000000,trigger:{global:['phaseEnd','phaseAfter']},filter:event=>(turns.get(event)||[]).some(r=>!r.checked),content:[async function(event,trigger){await endTurn(trigger);}]}),
  [ids.clean]:rule({lastDo:true,priority:-1000000000,trigger:{global:'phaseAfter'},filter:event=>turns.has(event),content:[async function(event,trigger){cleanup(trigger);}]}),
  [ids.mark]:rule({mark:true,marktext:'乐',intro:{content(storage,player){return '长乐令本回合手牌上限+'+handBonus(player)+'。';}},mod:{maxHandcard(player,num){return num+handBonus(player);}}}),
 };
 api.changle={ids,activate,canFree,handBonus,stageRecords:phase=>listAt(phase),turnRecords:turn=>turns.get(turn)||[],onLoss,endTurn,cleanup,install(){if(installed)return;installed=true;for(const id of Object.values(ids))game.addGlobalSkill(id);}};
 const translate={[MAIN]:'长乐',[MAIN+'_info']:'每轮限一次，一名角色出牌阶段开始时，你可以弃置至多5张花色相同的手牌，然后该角色回复一点体力且本阶段使用前X张牌无距离和次数限制且结算完成后你摸一张牌，然后可以交给该角色一张牌并令其本回合手牌上限+1，本回合结束时若该角色于本回合的弃牌阶段弃置的牌数量少于当前手牌上限，其执行一个额外出牌阶段（X为你本次弃置的手牌数）。'};
 for(const id of Object.values(ids))translate[id]='长乐';
 return{skills,translate};
},
function pokerheartqFactory(lib,game,ui,get,ai,_status,api){
 const MARK='皇庭_红桃Q刘备印牌';
 const ids={hand:'皇庭_红桃Q持有',first:'皇庭_红桃Q首次红桃',lose:'皇庭_红桃Q失去',discard:'皇庭_红桃Q弃置',commit:'皇庭_红桃Q牌名记录',gain:'皇庭_红桃Q获得'};
 const lossSeen=new WeakSet(),gainSeen=new WeakMap(),useSeen=new WeakSet(),firstByPlayer=new WeakMap(),budgets=new WeakMap();
 const enclosingMoves=new Set(['gain','loseAsync','equip','addJudge','addToExpansion']);
 let installed=false;
 const alive=p=>!!p&&p.isIn();
 const living=()=>game.players.filter(alive);
 const wu=p=>api.royal.identity(p,'吴苋'),liu=p=>api.royal.identity(p,'刘备');
 const isQ=c=>!!c&&api.royal.isPoker(c)&&get.suit(c,false)==='heart'&&get.number(c,false)===12;
 const holding=p=>p.getCards('h').filter(isQ).length;
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function chain(e,ancestor){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur===ancestor)return true;seen.add(cur);}return false;}
 function firstHeart(player,event){
  let record=firstByPlayer.get(player);if(!record)firstByPlayer.set(player,record={turns:new WeakSet(),fallback:null});
  const seen=new Set();for(let e=event;e&&!seen.has(e);e=parent(e)){if(e.name==='phase'){if(record.turns.has(e))return false;record.turns.add(e);return true;}seen.add(e);}
  const key=game.phaseNumber||0;if(record.fallback===key)return false;record.fallback=key;return true;
 }
 function lossEntries(e){
  if(enclosingMoves.has(parent(e)?.name))return [];
  const records=e.name==='lose'&&e.player?[e]:[];
  for(const p of living())for(const record of p.getHistory('lose')||[])if(chain(record,e)&&!records.includes(record))records.push(record);
  const grouped=new Map();
  for(const record of records){const p=record.player;if(!alive(p)||!wu(p)||lossSeen.has(record)||![...(record.cards||[]),...(record.cards2||[])].some(isQ))continue;
   if(!grouped.has(p))grouped.set(p,{player:p,records:[]});grouped.get(p).records.push(record);
  }
  return [...grouped.values()];
 }
 function gainAlready(record,p,write=false){let set=gainSeen.get(record);if(write&&!set)gainSeen.set(record,set=new Set());if(write)set.add(p);return !!set?.has(p);}
 function gainEntries(e){
  if(e.name==='gain'&&e.player){if(e.getlx===false||enclosingMoves.has(parent(e)?.name))return [];return [{player:e.player,cards:e.cards||[],records:[e]}];}
  if(typeof e.getg!=='function')return [];
  return living().map(p=>{const all=(p.getHistory('gain')||[]).filter(record=>chain(record,e));const records=all.filter(record=>!gainAlready(record,p));return {player:p,cards:all.length?records.flatMap(record=>record.cards||[]):e.getg(p)||[],records:all.length?records:[e]};});
 }
 function gainEligible(item){return alive(item.player)&&!wu(item.player)&&!liu(item.player)&&item.cards.some(isQ)&&item.records.some(record=>!gainAlready(record,item.player));}
 function budget(player){const round=game.roundNumber||0;let state=budgets.get(player);if(!state||state.round!==round)budgets.set(player,state={round,used:new Set(),pending:new Set()});return state;}
 const virtual=(name,p)=>({name,isCard:true,storage:{[MARK]:String(p.playerid)}});
 function countContext(p,event=_status.event){
  if(!event)return event;
  const seen=new Set();for(let e=event;e&&!seen.has(e);e=parent(e)){
   seen.add(e);if(e.name==='phase')break;if(e.name!=='phaseUse')continue;if(e.player!==p)break;
   // Native phase-limited cards inspect the immediate parent of their use
   // window. A gain reaction is nested inside that stage, not a new allowance.
   const context=Object.create(event);
   Object.defineProperty(context,'player',{value:p});
   Object.defineProperty(context,'getParent',{value:function(level,...args){return level===undefined||level===1?e:event.getParent(level,...args);}});
   return context;
  }
  return event;
 }
 function countLegal(card,p,event=_status.event){
  const context=countContext(p,event);return !context||lib.filter.cardUsable(card,p,context);
 }
 function targetLegal(card,p,target,event=_status.event){
  const context=countContext(p,event);
  if(context&&(!lib.filter.cardUsable(card,p,context)||!lib.filter.cardUsable2(card,p,context)&&!game.checkMod(card,p,target,false,'cardUsableTarget',p)))return false;
  // cardUsable may pass because a different target has a special allowance.
  // Check this target too, then retain native targetEnabledx and range rules.
  return p.canUse(card,target,undefined,!!context);
 }
 function available(p){
  const state=budget(p);
  return [...new Set(api.royal.heartNames()||[])].filter(name=>!state.used.has(name)&&!state.pending.has(name)&&['basic','trick'].includes(get.type({name},false))&&countLegal(virtual(name,p),p)&&game.hasPlayer(t=>targetLegal(virtual(name,p),p,t)));
 }
 function physicalHand(card,p,event){
  if(event?.skill)return false;
  const cards=Array.isArray(card?.cards)&&card.cards.length?card.cards:[card];
  return cards.length===1&&p.getCards('h').includes(cards[0]);
 }
 async function offerHandUse(p,target){
  if(!alive(p)||!alive(target))return;
  await p.chooseToUse({
   prompt:'红桃Q：可以对'+get.translation(target)+'使用一张手牌',
   _qWuxianTarget:target,
   filterCard(card,owner,event){return physicalHand(card,owner,event)&&targetLegal(card,owner,target,event)&&lib.filter.filterCard(card,owner,event);},
   filterTarget(card,owner,chosen){return targetLegal(card,owner,chosen)&&lib.filter.filterTarget(card,owner,chosen);},
   filterOk(){return ui.selected.targets.includes(target);},
   targetRequired:true,complexTarget:true,complexSelect:true,norestore:true,
  });
 }
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [ids.hand]:rule({mod:{maxHandcard(p,num){if(api.royal.active()&&alive(p)&&wu(p))return num+holding(p);}}}),
  [ids.first]:rule({firstDo:true,priority:1000000,trigger:{global:'useCardBefore'},filter(e){return alive(e.player)&&get.suit(e.card,e.player)==='heart'&&!useSeen.has(e);},content:[async function(event,trigger){
   if(useSeen.has(trigger))return;useSeen.add(trigger);const p=trigger.player;if(!firstHeart(p,trigger))return;
   if(api.royal.active()&&alive(p)&&wu(p)&&holding(p)>0)await p.recover(1);
  }]}),
  [ids.lose]:rule({trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},filter(e){return api.royal.active()&&lossEntries(e).length>0;},content:[async function(event,trigger){
   const entries=lossEntries(trigger);for(const item of entries)for(const record of item.records)lossSeen.add(record);
   for(const {player:p}of entries){if(!alive(p))continue;
    const answer=await p.chooseTarget('红桃Q：可以令一名角色将手牌调整至手牌上限（至多摸5张）',function(card,owner,target){return target.isIn();}).set('ai',target=>get.attitude(p,target)*(target.getHandcardLimit()-target.countCards('h'))).forResult();
    const target=answer.targets?.[0];if(!answer.bool||!alive(p)||!alive(target))continue;
    const limit=Math.max(0,Math.floor(target.getHandcardLimit())),count=target.countCards('h');
    if(count<limit)await target.draw(Math.min(5,limit-count));else if(count>limit)await target.chooseToDiscard('h',count-limit,true);
   }
  }]}),
  [ids.discard]:{
   charlotte:true,ruleSkill:true,enable:'phaseUse',position:'h',selectCard:1,selectTarget:0,discard:true,lose:true,delay:false,
   filter(event,p){return api.royal.active()&&alive(p)&&liu(p)&&p.countCards('h',c=>isQ(c)&&lib.filter.cardDiscardable(c,p,ids.discard))>0&&available(p).length>0;},
   filterCard(c,p){return isQ(c)&&lib.filter.cardDiscardable(c,p,ids.discard);},
   content:[async function(event,trigger,p){
    if(!alive(p))return;const amount=Math.min(5,Math.max(0,p.maxHp-p.countCards('h')));if(amount)await p.draw(amount);
    while(alive(p)){
     const names=available(p);if(!names.length)return;
     const answer=await p.chooseButton(['红桃Q：视为使用一张牌（每轮每种牌名限一次）',[names.map(name=>[get.type({name},false),'',name]),'vcard']],1,true).set('ai',button=>p.getUseValue?.({name:button.link[2]})||1).forResult();
     const name=answer.links?.[0]?.[2];if(!name||!names.includes(name))return;
     const state=budget(p);state.pending.add(name);let result;
     try{result=await p.chooseUseTarget({card:virtual(name,p),forced:true,filterTarget:(card,owner,target)=>targetLegal(card,owner,target),prompt:'红桃Q：请选择【'+get.translation(name)+'】的合法目标'}).forResult();}
     finally{state.pending.delete(name);}
     if(result?.bool)return;
     // A target may disappear while choosing. Re-evaluate the remaining legal
     // names rather than silently replacing the already confirmed action.
     if(!available(p).length)return;
    }
   }],ai:{order:7,result:{player:1}},
  },
  [ids.commit]:rule({firstDo:true,priority:1000000,trigger:{global:'useCard1'},filter(e){return api.royal.active()&&!!e.card?.storage?.[MARK];},content:[async function(event,trigger){
   const id=trigger.card.storage[MARK],p=game.players.find(p=>String(p.playerid)===id);if(p)budget(p).used.add(trigger.card.name);
  }]}),
  [ids.gain]:rule({trigger:{global:['gainAfter','loseAsyncAfter']},filter(e){return api.royal.active()&&gainEntries(e).some(gainEligible);},content:[async function(event,trigger){
   for(const item of gainEntries(trigger))if(gainEligible(item)){
    for(const record of item.records)gainAlready(record,item.player,true);
    const players=living();if(players.sortBySeat)players.sortBySeat(_status.currentPhase||players[0]);
    for(const p of players){if(!alive(item.player))break;if(alive(p))await offerHandUse(p,item.player);}
   }
  }]}),
 };
 const translate={};for(const id of Object.values(ids))translate[id]='红桃Q';
 translate[ids.discard+'_info']='出牌阶段，你可以弃置一张红桃Q扑克牌，将手牌摸至体力上限（至多摸5张），然后视为使用一张开局红桃牌名库中的基本牌或普通锦囊牌（每轮每种牌名限一次）。';
 api.pokerheartq={ids,isQ,holding,available,physicalHand,lossEntries,gainEntries,install(){if(installed)return;installed=true;for(const [id,skill]of Object.entries(skills)){lib.skill[id]=skill;game.addGlobalSkill(id);}}};
 return{skills,translate};
},
function shaohanFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='K刘备_绍汉',TRACK='K刘备_绍汉失牌记录';
 const losses=new WeakMap(),seenLoss=new WeakSet(),offered=new WeakMap();let installed=false;
 const alive=p=>!!p&&(typeof p.isIn!=='function'||p.isIn());
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function turnOf(event){const seen=new Set();for(let e=event;e&&!seen.has(e);e=parent(e)){if(e.name==='phase')return e;seen.add(e);}return null;}
 function physicalCards(record){return [...new Set([...(record.cards||[]),...(record.cards2||[]),...(record.hs||[]),...(record.es||[]),...(record.js||[]),...(record.xs||[]),...(record.ss||[])])].filter(card=>get.itemtype(card)==='card');}
 function note(record){
  if(seenLoss.has(record))return;seenLoss.add(record);
  const turn=turnOf(record),player=record.player,cards=physicalCards(record);if(!turn||!player||!cards.length)return;
  let byPlayer=losses.get(turn);if(!byPlayer)losses.set(turn,byPlayer=new Map());
  let list=byPlayer.get(player);if(!list)byPlayer.set(player,list=new Set());
  for(const card of cards)list.add(card);
 }
 function lostInTurn(turn,player){return [...(losses.get(turn)?.get(player)||[])];}
 function candidates(turn,player){return lostInTurn(turn,player).filter(card=>get.position(card,true)==='d');}
 function count(player){return player.getCards('h').filter(card=>get.suit(card,player)==='heart'&&get.number(card,player)===13).length;}
 function hasOffered(turn,player,write=false){let set=offered.get(turn);if(write&&!set)offered.set(turn,set=new WeakSet());if(write)set.add(player);return !!set?.has(player);}
 function eligible(turn,player){
  if(!alive(player)||turn?.name!=='phase'||!turn.player||hasOffered(turn,player))return false;
  // Native silent lose events still enter cardMove history even when their
  // loseAfter timing is disabled. Read all history: a nested actual turn may
  // replace the current history object before this outer turn resumes.
  for(const record of game.getAllGlobalHistory('cardMove')){
   if(record.name==='lose'&&record.player===turn.player&&turnOf(record)===turn)note(record);
  }
  return lostInTurn(turn,turn.player).length>0;
 }
 const skills={
  [TRACK]:{charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true,firstDo:true,priority:1000000,
   trigger:{global:'loseAfter'},filter(event){return !seenLoss.has(event)&&physicalCards(event).length>0&&!!turnOf(event);},
   content:[async function(event,trigger){note(trigger);}],
  },
  [MAIN]:{direct:true,trigger:{global:'phaseEnd'},
   filter(event,player){return eligible(event,player);},
   content:[async function(event,trigger,player){
    if(!eligible(trigger,player))return;hasOffered(trigger,player,true);
    const answer=await player.chooseBool('绍汉：是否获得当前回合角色本回合失去的至多X张牌，然后增加1点体力上限？')
     .set('ai',()=>true).forResult();
    if(!answer.bool||!alive(player))return;
    // The amount is frozen before gaining cards: a recovered heart K cannot
    // expand this already confirmed activation.
    const x=count(player),cards=candidates(trigger,trigger.player),amount=Math.min(x,cards.length);
    player.logSkill?.(MAIN,trigger.player);
    if(amount){
     const result=await player.chooseButton(['绍汉：选择'+amount+'张牌获得',[cards,'card']],amount,true)
      .set('ai',button=>get.value(button.link,player)).forResult();
     const chosen=[...new Set(result.links||[])].filter(card=>cards.includes(card)&&get.position(card,true)==='d').slice(0,amount);
     if(chosen.length&&alive(player))await player.gain(chosen,'gain2');
    }
    if(alive(player))await player.gainMaxHp(1);
   }],
   ai:{threaten:1.4},
  },
 };
 api.shaohan={ids:{main:MAIN,track:TRACK},count,turnOf,lostInTurn,candidates,install(){if(installed)return;installed=true;game.addGlobalSkill(TRACK);}};
 return{skills,translate:{[MAIN]:'绍汉',[TRACK]:'绍汉',[MAIN+'_info']:'每回合结束时，若当前回合角色于本回合失去过牌，你可以从弃牌堆中获得X张其本回合失去的牌，然后增加一点体力上限（X为你手牌中红桃K的数量）。'}};
},
function zhanglieFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='K刘备_彰烈',TRIGGER='K刘备_彰烈时机',EXPIRE='K刘备_彰烈到期',REG='K刘备_彰烈所得',SERIAL='K刘备_彰烈序号';
 const identities=new Set(['诸葛亮','关羽','张飞','赵云','马超','黄忠']),aliases={'卧龙诸葛':'诸葛亮'};
 const excludedCategories=new Set(['Charlotte','主公技','觉醒技','限定技','隐匿技','使命技','持恒技']);
 const seen=new WeakMap(),movement=new Set(['gain','loseAsync','equip','addJudge','addToExpansion']);let installed=false;
 const alive=p=>!!p&&(typeof p.isIn!=='function'||p.isIn());
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function registry(p){return p.storage[REG]??=[];}
 function records(p){
  const result=registry(p);for(let i=result.length-1;i>=0;i--){const entry=result[i];if(!entry.pending&&!p.additionalSkills?.[entry.source]?.includes(entry.skill))result.splice(i,1);}return result;
 }
 const count=p=>records(p).length;
 function rawOwned(p){
  const result=[...(p.skills||[]),...Object.keys(p.tempSkills||{}),...(p.hiddenSkills||[]),...(p.invisibleSkills||[])];
  for(const value of Object.values(p.additionalSkills||{}))result.push(...(Array.isArray(value)?value:[value]));
  for(const record of records(p))if(record.pending)result.push(record.skill);
  if(p.getSkills)result.push(...p.getSkills(true,true,false));return new Set(result.filter(id=>typeof id==='string'));
 }
 function hasConversion(p){const list=[...rawOwned(p)];game.expandSkills?.(list);return list.some(id=>lib.skill[id]&&(get.is?.zhuanhuanji?get.is.zhuanhuanji(id,p):lib.skill[id].zhuanhuanji));}
 function isGuozhan(id){
  if(id.startsWith('gz_'))return true;let normal=false,guozhan=false;
  for(const [pack,chars]of Object.entries(lib.characterPack||{}))if(Object.prototype.hasOwnProperty.call(chars||{},id)){
   if(pack==='guozhan'||lib.characterGuozhanFilter?.has?.(pack)||lib.characterGuozhanFilter?.includes?.(pack))guozhan=true;else normal=true;
  }return guozhan&&!normal;
 }
 function identityOf(id,info){
  const declared=info.names||(Array.isArray(info)?info[4]?.find(t=>typeof t==='string'&&t.startsWith('name:'))?.slice(5):undefined);let names;
  if(declared){const pieces=declared.split('-');if(pieces.length!==1)return null;names=pieces.map(name=>name.split('|').map(x=>x==='null'?'':x).join(''));}
  else if(get.characterSurname){names=get.characterSurname(id).map(parts=>parts.join(''));if(names.length!==1)return null;}
  const options=[...(names||[]),get.rawName?.(id,true)];const source=get.sourceCharacter?.(id);if(source&&source!==id)options.push(get.rawName?.(source,true));
  for(let name of options){name=aliases[name]||name;if(identities.has(name))return name;}return null;
 }
 function skillAllowed(id,p,owned=rawOwned(p),conversion=hasConversion(p)){
  const info=lib.skill[id];if(!info||owned.has(id))return false;
  if(info.sub||info.charlotte||info.zhuSkill||info.limited||info.juexingji||info.dutySkill||info.hiddenSkill||info.persevereSkill||info.fixed||info.fixedSkill||info.unique&&!info.gainable)return false;
  if(info.ai&&(info.ai.combo||info.ai.notemp||info.ai.neg))return false;
  if(get.skillCategoriesOf?.(id,p)?.some(type=>excludedCategories.has(type)))return false;
  return !(conversion&&(get.is?.zhuanhuanji?get.is.zhuanhuanji(id,p):info.zhuanhuanji));
 }
 function candidates(p){
  const owned=rawOwned(p),conversion=hasConversion(p),result=new Set();
  for(const [id,info]of Object.entries(lib.character||{})){if(isGuozhan(id)||!identityOf(id,info))continue;for(const skill of info.skills||(Array.isArray(info)?info[3]:[])||[])if(skillAllowed(skill,p,owned,conversion))result.add(skill);}return [...result];
 }
 function offers(p){const pool=candidates(p),result=[];while(pool.length&&result.length<3){const n=get.rand?get.rand(0,pool.length-1):Math.floor(Math.random()*pool.length);result.push(pool.splice(Math.max(0,Math.min(pool.length-1,n)),1)[0]);}return result;}
 async function grant(p,skill){
  if(!alive(p)||count(p)>=3||!candidates(p).includes(skill))return false;
  const serial=(p.storage[SERIAL]||0)+1;p.storage[SERIAL]=serial;
  // Native phaseNumber increments only after the turn survives its face-down
  // skip, and after roundStart. Thus a pre-start grant includes that upcoming
  // actual turn; a grant made inside the current turn waits for the next one.
  const entry={skill,source:REG+'_'+serial,expires:(Number(p.phaseNumber)||0)+1,pending:true};registry(p).push(entry);
  try{await p.addAdditionalSkills(entry.source,[skill],true);entry.pending=false;
   if(!p.additionalSkills?.[entry.source]?.includes(skill)){registry(p).splice(registry(p).indexOf(entry),1);return false;}return true;
  }catch(error){const i=registry(p).indexOf(entry);if(i>=0)registry(p).splice(i,1);throw error;}
 }
 async function choose(p){
  const options=offers(p);if(!options.length)return false;
  const answer=await p.chooseControl(options).set('prompt','彰烈：选择获得一个技能')
   .set('choiceList',options.map(id=>'【'+get.translation(id)+'】'+(get.skillInfoTranslation?.(id,p)||lib.translate[id+'_info']||'')))
   .set('displayIndex',false).set('ai',()=>0).forResult();
  const chosen=options.includes(answer?.control)?answer.control:options[answer?.index??0];return chosen?grant(p,chosen):false;
 }
 function canActivate(p){return alive(p)&&(count(p)>=3?game.players.some(target=>target!==p&&alive(target)):candidates(p).length>0);}
 async function activate(p){
  if(!canActivate(p))return false;
  await p.loseMaxHp(1);if(!alive(p))return true;
  await p.draw(1);if(!alive(p))return true;
  if(count(p)<3){await choose(p);return true;}
  await p.loseHp(1);if(!alive(p))return true;
  const answer=await p.chooseTarget('彰烈：对一名其他角色造成1点伤害',true,function(card,player,target){return target!==player&&target.isIn();}).set('ai',target=>get.damageEffect(target,p,p)).forResult();
  const target=answer.targets?.[0];if(alive(p)&&alive(target)&&target!==p)await target.damage(1,p);return true;
 }
 function chain(event,root){const walked=new Set();for(let e=event;e&&!walked.has(e);e=parent(e)){if(e===root)return true;walked.add(e);}return false;}
 function lastHand(event,p){
  if(p.countCards('h')!==0||movement.has(parent(event)?.name))return false;
  if(event.name==='lose')return event.player===p&&(event.hs||[]).length>0;
  const history=p.getAllHistory?.('lose')||p.getHistory?.('lose')||[];
  if(history.some(record=>chain(record,event)&&(record.hs||[]).length>0))return true;
  const aggregate=event.getl?.(p);return !!aggregate&&(aggregate.hs||[]).length>0;
 }
 function timing(event,name){return name||event.triggername||(event.name==='phase'?'roundStart':event.name==='damage'?'damageEnd':event.name==='die'?'dieAfter':'lastHand');}
 function consumed(event,p,kind,write=false){let map=seen.get(event);if(!map&&write)seen.set(event,map=new Map());let players=map?.get(kind);if(!players&&write)map.set(kind,players=new WeakSet());if(write)players.add(p);return !!players?.has(p);}
 function opportunity(event,p,name){
  if(!alive(p)||!p.hasSkill(MAIN)||!canActivate(p))return false;const kind=timing(event,name);if(consumed(event,p,kind))return false;
  if(kind==='roundStart')return true;if(kind==='damageEnd')return event.player===p&&event.num>0;if(kind==='dieAfter')return true;
  return lastHand(event,p);
 }
 async function expire(p){for(const entry of records(p).slice())if(!entry.pending&&(Number(p.phaseNumber)||0)>=entry.expires){await p.removeAdditionalSkills(entry.source);const index=registry(p).indexOf(entry);if(index>=0)registry(p).splice(index,1);}}
 const skills={
  [MAIN]:{enable:'phaseUse',usable:1,selectCard:0,selectTarget:0,group:[TRIGGER],filter(event,p){return canActivate(p);},content:[async function(event,trigger,p){await activate(p);}],ai:{order:7,result:{player:1}}},
  [TRIGGER]:{forced:true,silent:true,popup:false,trigger:{global:['roundStart','damageEnd','loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter','dieAfter']},
   filter(event,p,name){return opportunity(event,p,name);},
   content:[async function(event,trigger,p){const kind=timing(trigger,event.triggername);if(!opportunity(trigger,p,kind))return;consumed(trigger,p,kind,true);
    const answer=await p.chooseBool('彰烈：是否减少1点体力上限并摸一张牌，然后执行后续效果？').set('ai',()=>p.maxHp>2).forResult();if(answer.bool&&alive(p)&&p.hasSkill(MAIN))await activate(p);
   }],
  },
  [EXPIRE]:{charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true,lastDo:true,priority:-1000000,
   trigger:{global:'phaseAfter'},filter(event){return !!event.player&&records(event.player).some(entry=>!entry.pending&&(Number(event.player.phaseNumber)||0)>=entry.expires);},
   content:[async function(event,trigger){await expire(trigger.player);}],
  },
 };
 api.zhanglie={ids:{main:MAIN,trigger:TRIGGER,expire:EXPIRE},rawOwned,hasConversion,identityOf,skillAllowed,candidates,offers,records,count,grant,choose,canActivate,activate,expire,lastHand,install(){if(installed)return;installed=true;game.addGlobalSkill(EXPIRE);}};
 return{skills,translate:{[MAIN]:'彰烈',[TRIGGER]:'彰烈',[EXPIRE]:'彰烈',
  [MAIN+'_info']:'你于以下时机可以减少1点体力上限并摸一张牌，然后随机从三个合法技能中选择一个诸葛亮或五虎上将的技能获得，直到你下回合结束；若此时你已经持有三个以此法获得的技能，则在减体力上限、摸牌后改为失去1点体力并对一名其他角色造成1点伤害：①每轮开始时；②当你受到伤害后；③出牌阶段限一次；④失去最后的手牌时；⑤有角色阵亡后。',
 }};
},
function pokerheartkFactory(lib,game,ui,get,ai,_status,api){
 const MARK='皇庭_红桃K基本牌';
 const ids={basic:'皇庭_红桃K基本牌',commit:'皇庭_红桃K基本牌记录',sha:'皇庭_红桃K杀记录',miss:'皇庭_红桃K抵消记录',reward:'皇庭_红桃K抵消摸牌',damage:'皇庭_红桃K伤害记录',lose:'皇庭_红桃K失去',ban:'皇庭_红桃K限制'};
 const budgets=new WeakMap(),shaCounts=new WeakMap(),useStates=new WeakMap(),misses=new WeakSet(),rewarded=new WeakSet(),counted=new WeakSet(),committed=new WeakSet(),lossSeen=new WeakSet(),damagers=new WeakSet();
 const movements=new Set(['gain','loseAsync','equip','addJudge','addToExpansion']);let installed=false;
 const alive=p=>!!p&&p.isIn(),living=()=>game.players.filter(alive);
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function ancestor(event,name){const seen=new Set();for(let e=event;e&&!seen.has(e);e=parent(e)){if(e.name===name)return e;seen.add(e);}return null;}
 const turnOf=e=>ancestor(e,'phase');
 const liu=p=>api.royal.identity(p,'刘备'),guan=p=>api.royal.identity(p,'关羽');
 const isK=c=>!!c&&api.royal.isPoker(c)&&get.suit(c,false)==='heart'&&get.number(c,false)===13;
 const holding=p=>p.getCards('h').some(isK);
 function ledger(map,p){let value=map.get(p);if(!value)map.set(p,value={turns:new WeakMap(),fallback:null,value:0});return value;}
 function read(map,p,event=_status.event){const value=ledger(map,p),turn=turnOf(event);if(turn)return value.turns.get(turn)||0;return value.fallback===(game.phaseNumber||0)?value.value:0;}
 function write(map,p,event,n){const value=ledger(map,p),turn=turnOf(event);if(turn)value.turns.set(turn,n);else{value.fallback=game.phaseNumber||0;value.value=n;}}
 const unused=(p,event=_status.event)=>!read(budgets,p,event);
 const virtual=(name,nature,p)=>{const card={name,isCard:true,storage:{[MARK]:String(p.playerid)}};if(nature)card.nature=nature;return card;};
 const marked=c=>!!c?.storage?.[MARK];
 function windowOf(event){const seen=new Set();for(let e=event;e&&!seen.has(e);e=parent(e)){if(e.name==='chooseToUse'||e.name==='chooseToRespond')return e;seen.add(e);}return event;}
 function countContext(p,event=_status.event){
  if(!event)return event;
  const seen=new Set();for(let e=event;e&&!seen.has(e);e=parent(e)){seen.add(e);if(e.name==='phase')break;if(e.name!=='phaseUse')continue;if(e.player!==p)break;
   const context=Object.create(event);Object.defineProperty(context,'player',{value:p});Object.defineProperty(context,'getParent',{value:function(level,...args){return level===undefined||level===1?e:event.getParent(level,...args);}});return context;
  }
  return event;
 }
 function targetLegal(card,p,t,event=windowOf(_status.event)){
  if(event?.type==='dying'){
   // A save window has its own native savable/target rules. Normal wine's
   // per-turn usage budget does not apply to dying self-rescue (native wine
   // cancels that counter again after recovering its dying target).
   const dying=event.dying||parent(event)?.dying;
   if(!dying||t!==dying||lib.filter.cardSavable(card,p,dying)===false)return false;
   const original=event._backup?.filterTarget;
   if(typeof original==='function')return !!original(card,p,t);
   if(game.checkMod(card,p,t,'unchanged','playerEnabled',p)===false)return false;
   const mod=game.checkMod(card,p,t,'unchanged','targetEnabled',t);return mod==='unchanged'||!!mod;
  }
  const context=countContext(p,event);
  if(context&&(!lib.filter.cardUsable(card,p,context)||!lib.filter.cardUsable2(card,p,context)&&!game.checkMod(card,p,t,false,'cardUsableTarget',p)))return false;
  return p.canUse(card,t,undefined,!!context);
 }
 function ready(p,event=_status.event){return api.royal.active()&&alive(p)&&liu(p)&&holding(p)&&unused(p,event);}
 function options(event,p){
  if(!ready(p,event))return [];
  const result=[];
  for(const name of [...new Set(lib.inpile||[])])if(get.type({name},false)==='basic')for(const nature of name==='sha'?[undefined,...(lib.inpile_nature||[])]:[undefined]){
   const card=virtual(name,nature,p),view=get.autoViewAs(card,[],p);
   if(event?.filterCard&&!event.filterCard(view,p,event))continue;
   if(event?.name==='chooseToRespond'){if(lib.filter.cardRespondable?.(view,p,event)===false)continue;}
   else if(event?.type!=='dying'&&!lib.card[name]?.notarget&&!game.hasPlayer(t=>targetLegal(view,p,t,event)))continue;
   result.push(card);
  }
  return result;
 }
 function chain(e,root){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur===root)return true;seen.add(cur);}return false;}
 function history(p,kind){return typeof p.getAllHistory==='function'?p.getAllHistory(kind):p.getHistory?.(kind)||[];}
 function losses(event){
  if(movements.has(parent(event)?.name))return [];
  const records=event.name==='lose'&&event.player?[event]:[];
  for(const p of living())for(const record of history(p,'lose'))if(chain(record,event)&&!records.includes(record))records.push(record);
  const grouped=new Map();
  for(const record of records){const p=record.player,cards=[...(record.cards||[]),...(record.cards2||[]),...(record.hs||[]),...(record.es||[]),...(record.js||[]),...(record.xs||[])];if(!alive(p)||!liu(p)||lossSeen.has(record)||!cards.some(isK))continue;
   if(!grouped.has(p))grouped.set(p,{player:p,records:[]});grouped.get(p).records.push(record);
  }
  return [...grouped.values()];
 }
 const hadDamage=p=>damagers.has(p)||history(p,'sourceDamage').some(e=>e.source===p&&e.num>0);
 const discardable=(p,t)=>t.getCards('he').filter(c=>lib.filter.canBeDiscarded(c,p,t,ids.lose));
 const lossTargets=p=>living().filter(t=>t!==p&&hadDamage(t)&&discardable(p,t).length>0);
 function free(p,c){return api.royal.active()&&alive(p)&&guan(p)&&holding(p)&&get.name(c,p)==='sha';}
 const shaUse=event=>{const use=ancestor(event,'useCard');return use&&use.card?.name==='sha'?use:null;};
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true,_heartKPublic:true},body);
 const skills={
  [ids.basic]:rule({enable:['chooseToUse','chooseToRespond'],filter(event,p){return options(event,p).length>0;},hiddenCard(p,name){return ready(p)&&get.type({name},false)==='basic'&&(lib.inpile||[]).includes(name);},
   chooseButton:{dialog(event,p){return ui.create.dialog('红桃K',[options(event,p).map(c=>['基本','',c.name,c.nature]),'vcard']);},filter(button,p){return options(windowOf(_status.event),p).some(c=>c.name===button.link[2]&&(c.nature||'')===(button.link[3]||''));},check(button){const p=get.player?.();return p?.getUseValue?.({name:button.link[2],nature:button.link[3]})||1;},
    backup(links,p){return {filterCard:()=>false,selectCard:-1,viewAs:virtual(links[0][2],links[0][3],p),popname:true,filterTarget(card,user,target){return targetLegal(card,user,target);}};},prompt:links=>'视为使用或打出【'+get.translation(links[0][2])+'】（每回合限一次）',
   },ai:{respondSha:true,respondShan:true,save:true,order:8,result:{player:1},skillTagFilter(p,tag,arg){if(!ready(p))return false;if(tag==='save'&&!((lib.inpile||[]).includes('tao')||(lib.inpile||[]).includes('jiu')))return false;}},
  }),
  [ids.commit]:rule({firstDo:true,priority:10000000,trigger:{global:['useCardBefore','respondBefore','useCard1','respond']},filter:e=>marked(e.card)&&!committed.has(e),content:[async function(event,trigger){if(committed.has(trigger))return;committed.add(trigger);write(budgets,trigger.player,trigger,1);}]}),
  [ids.sha]:rule({firstDo:true,priority:10000000,trigger:{global:'useCardBefore'},filter:e=>e.card?.name==='sha'&&!counted.has(e),content:[async function(event,trigger){
   if(counted.has(trigger))return;counted.add(trigger);const n=read(shaCounts,trigger.player,trigger)+1;write(shaCounts,trigger.player,trigger,n);useStates.set(trigger,{n});if(free(trigger.player,trigger.card))trigger.addCount=false;
  }],mod:{cardUsable(card,p){if(free(p,card))return Infinity;},targetInRange(card,p){if(free(p,card))return true;}}}),
  [ids.miss]:rule({firstDo:true,priority:10000000,trigger:{global:'shaMiss'},filter:e=>e.name==='sha'&&!!shaUse(e),content:[async function(event,trigger){misses.add(trigger);}]}),
  [ids.reward]:rule({trigger:{global:'shaUnhirt'},filter:e=>api.royal.active()&&misses.has(e)&&!rewarded.has(e)&&alive(e.player)&&guan(e.player)&&holding(e.player)&&(useStates.get(shaUse(e))?.n||Infinity)<=3,content:[async function(event,trigger){if(rewarded.has(trigger))return;rewarded.add(trigger);if(alive(trigger.player)&&holding(trigger.player))await trigger.player.draw(1);}]}),
  [ids.damage]:rule({trigger:{global:'damageEnd'},filter:e=>e.num>0&&!!e.source,content:[async function(event,trigger){if(trigger.num>0&&trigger.source)damagers.add(trigger.source);}]}),
  [ids.lose]:rule({trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},filter:e=>api.royal.active()&&losses(e).length>0,content:[async function(event,trigger){
   const entries=losses(trigger);for(const item of entries)for(const record of item.records)lossSeen.add(record);
   for(const {player:p}of entries){if(!alive(p)||!lossTargets(p).length)continue;
    const answer=await p.chooseTarget('红桃K：可以弃置一名本局曾造成伤害的其他角色的两张牌',function(card,owner,target){return lossTargets(owner).includes(target);}).set('ai',t=>-get.attitude(p,t)).forResult();
    const target=answer.targets?.[0];if(!answer.bool||!alive(p)||!alive(target)||!lossTargets(p).includes(target))continue;
    await p.discardPlayerCard(target,'he',Math.min(2,discardable(p,target).length),true);
   }
  }]}),
  [ids.ban]:rule({mod:{cardEnabled(card,p){if(api.royal.active()&&alive(p)&&!liu(p)&&!guan(p)&&holding(p)&&get.suit(card,p)==='heart')return false;},cardSavable(card,p){if(api.royal.active()&&alive(p)&&!liu(p)&&!guan(p)&&holding(p)&&get.suit(card,p)==='heart')return false;}}}),
 };
 const translate={};for(const id of Object.values(ids))translate[id]='红桃K';translate[ids.basic+'_info']='刘备所有形态持有红桃K时，每回合限一次，可以无实体牌视为使用或打出一张基本牌，使用和打出共用次数。';
 api.pokerheartk={ids,isK,holding,virtual,unused,options,targetLegal,losses,hadDamage,install(){if(installed)return;installed=true;for(const [id,skill]of Object.entries(skills)){lib.skill[id]=skill;game.addGlobalSkill(id);}}};
 return{skills,translate};
},
function yinfengFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='J陆逊_隐锋',TAG='J陆逊_隐锋隐藏';
 const ids={main:MAIN,protect:'J陆逊_隐锋保护',prepare:'J陆逊_隐锋准备',clean:'J陆逊_隐锋整理'};
 const rawMethods=new WeakMap(),patched=new WeakSet(),tracked=new Set(),seen=new WeakSet(),allocations=new WeakMap(),privateDialogs=new Map();let installed=false,panel=null;
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 const players=()=>game.players.concat(game.dead||[]);
 const ownerOf=c=>c&&typeof c==='object'?(typeof get.owner==='function'?get.owner(c):c.owner):null;
 function raw(p,zone='h',filter){const original=rawMethods.get(p)?.getCards||p.getCards;return original.call(p,zone,filter);}
 const isHidden=(c,p=ownerOf(c))=>!!c&&!!p&&ownerOf(c)===p&&get.position(c)==='h'&&(typeof c.hasGaintag==='function'?c.hasGaintag(TAG):(c.gaintag||[]).includes(TAG));
 const hidden=p=>raw(p).filter(c=>isHidden(c,p));
 const normal=p=>raw(p).filter(c=>!isHidden(c,p));
 const capacity=p=>1+raw(p).filter(c=>get.suit(c,p)==='club'&&get.number(c,p)===11).length;
 function tagged(c,on){tracked.add(c);if(on){if(typeof c.addGaintag==='function')c.addGaintag(TAG);else(c.gaintag??=[]).push(TAG);}else if(typeof c.removeGaintag==='function')c.removeGaintag(TAG);else c.gaintag=(c.gaintag||[]).filter(t=>t!==TAG);}
 function mayAllocate(p,selection){const hand=raw(p),old=hidden(p),selected=[...new Set(selection||[])];return selected.length===(selection||[]).length&&selected.every(c=>hand.includes(c))&&(selected.length<=capacity(p)||selected.every(c=>old.includes(c)));}
 function allocate(p,selection){patchPlayer(p);if(!mayAllocate(p,selection))return false;const selected=new Set(selection);for(const c of raw(p))tagged(c,selected.has(c));p.markSkill?.(MAIN);refresh();return true;}
 function externalSelection(p){let e=_status.event,guard=new Set();while(e&&!guard.has(e)){guard.add(e);if(['choosePlayerCard','discardPlayerCard','gainPlayerCard','viewCards'].includes(e.name)&&e.player!==p&&(e.target===p||e.cards?.some(c=>ownerOf(c)===p)))return true;if(e.name==='chooseToCompare'&&e.player!==p&&(e.target===p||e.targets?.includes(p)))return true;if(e.name==='huogong'&&e.player!==p&&e.target===p)return true;if(e.name==='phase')break;e=parent(e);}return false;}
 function isForeignMove(e,p){if(e.giver===p||e.bySelf===true)return false;const direct=parent(e);if(direct?.giver===p)return false;if(direct?.name==='chooseToGive'&&direct.player===p)return false;if(direct?.name==='chooseToDiscard'&&direct.player===p)return false;if(e.discarder)return e.discarder!==p;if(e.name==='gain')return e.player!==p;if(e.source&&e.source!==p)return true;let a=direct,guard=new Set();while(a&&!guard.has(a)){guard.add(a);if(a.giver===p)return false;if(a.player)return a.player!==p;if(a.name==='phase')break;a=parent(a);}return false;}
 function filterCards(event,predicate){if(Array.isArray(event.cards))event.cards=event.cards.filter(predicate);if(Array.isArray(event.directresult))event.directresult=event.directresult.filter(predicate);if(event.gain_list)event.gain_list=event.gain_list.map(([p,cs])=>[p,cs.filter(predicate)]);}
 function protectEvent(e){
  if(['gain','lose','discard','addToExpansion','loseAsync','gaincardMultiple'].includes(e.name))filterCards(e,c=>{const p=ownerOf(c);return !isHidden(c,p)||!isForeignMove(e,p);});
  if(e.name==='huogong'&&e.target!==e.player&&hidden(e.target).length&&!normal(e.target).length){e.cancel?.();e.finish?.();}
  if(e.name==='showCards')filterCards(e,c=>!isHidden(c));
  if(e.name==='viewCards')filterCards(e,c=>!isHidden(c)||ownerOf(c)===e.player);
  if(['choosePlayerCard','discardPlayerCard','gainPlayerCard'].includes(e.name)&&e.target&&e.target!==e.player){
   const old=e.filterButton;e.filterButton=function(button,...args){return !isHidden(button.link,e.target)&&(typeof old!=='function'||old.call(this,button,...args));};
   if(Array.isArray(e.directresult))e.directresult=e.directresult.filter(c=>!isHidden(c,e.target));
   if(!raw(e.target,e.position||'he').some(c=>!isHidden(c,e.target))){e.result={bool:false,cards:[],links:[],buttons:[]};e.finish?.();}
  }
  if(e.name==='chooseCard'&&externalSelection(e.player)){
   const old=e.filterCard;e.filterCard=function(card,...args){return !isHidden(card,e.player)&&(typeof old!=='function'||old.call(this,card,...args));};
   if(!normal(e.player).length&&(!e.position||e.position==='h')){e.result={bool:false,cards:[]};e.finish?.();}
  }
 }
 function patchPlayer(p){if(!p||patched.has(p))return;patched.add(p);const originals={};rawMethods.set(p,originals);
  for(const name of ['getCards','showCards','viewCards','viewHandcards','choosePlayerCard','gainPlayerCard','discardPlayerCard','gain','discard','lose','addToExpansion','addShownCards','canCompare'])if(typeof p[name]==='function')originals[name]=p[name];
  if(originals.getCards)p.getCards=function(zone,...args){const cards=originals.getCards.call(this,zone,...args);return typeof zone==='string'&&zone.includes('h')&&externalSelection(this)?cards.filter(c=>!isHidden(c,this)):cards;};
  for(const name of ['showCards','viewCards','choosePlayerCard','gainPlayerCard','discardPlayerCard','gain','discard','lose','addToExpansion','addShownCards'])if(originals[name])p[name]=function(...args){
   // Filter the actual arguments before original show/view creates any video,
   // knower or dialog; the event guard below also covers later directresult.
   if(name==='showCards'||name==='viewCards'||name==='addShownCards')args=args.map(arg=>{
    const allowed=c=>!isHidden(c)||(name==='viewCards'&&ownerOf(c)===this);
    if(Array.isArray(arg))return arg.filter(allowed);
    if(name==='addShownCards'&&arg&&Array.isArray(arg.cards))return {...arg,cards:arg.cards.filter(allowed)};
    return isHidden(arg)?[]:arg;
   });
   const event=originals[name].apply(this,args);if(event&&name!=='gain')protectEvent(event);return event;
  };
  if(originals.viewHandcards)p.viewHandcards=function(target){const cards=target===this?raw(target):normal(target);if(typeof this.viewCards==='function')return this.viewCards(get.translation(target)+'的普通手牌',cards);const event=originals.viewHandcards.call(this,target);if(event)event.cards=cards;return event;};
  if(originals.canCompare)p.canCompare=function(target,...args){return !!target&&(target===this||!hidden(target).length||normal(target).length>0)&&originals.canCompare.call(this,target,...args);};
 }
 function refresh(){
  for(const [dialog,p]of privateDialogs)if(!p.isUnderControl?.(true)){dialog.close?.();privateDialogs.delete(dialog);}
  for(const c of tracked){if(!isHidden(c)){c.classList?.remove?.('jluxun-yinfeng-card');if(get.position(c)!=='h')tagged(c,false);}}
  for(const p of players())for(const c of raw(p)){const visible=!!p.isUnderControl?.(true);if(isHidden(c,p)&&visible)c.classList?.add?.('jluxun-yinfeng-card');else c.classList?.remove?.('jluxun-yinfeng-card');}
  if(typeof document==='undefined'||!document.createElement||!document.body)return;
  if(!document.getElementById('jluxun-yinfeng-style')){const style=document.createElement('style');style.id='jluxun-yinfeng-style';style.textContent='.card.jluxun-yinfeng-card{outline:3px solid #bd8eff!important;box-shadow:0 0 12px #8c50b0!important}.card.jluxun-yinfeng-card:after{content:"隐锋";position:absolute;right:3px;top:3px;border-radius:3px;padding:2px 4px;background:#352042;color:#f6e7ff;font-size:14px;pointer-events:none}#jluxun-yinfeng-panel{position:absolute;left:24%;bottom:190px;z-index:20;display:flex;gap:6px;padding:5px 8px;border:1px solid #b383cf;border-radius:6px;background:rgba(38,24,47,.9);color:#f4e6fc;font-size:14px}#jluxun-yinfeng-panel button{font:inherit;color:inherit;background:#614474;border:1px solid #b383cf;border-radius:4px;cursor:pointer;padding:3px 8px}';document.head?.appendChild(style);}
  const p=players().find(q=>q.isUnderControl?.(true)&&(q.hasSkill?.(MAIN)||hidden(q).length));if(!p){panel?.remove?.();panel=null;return;}
  if(!panel){panel=document.createElement('div');panel.id='jluxun-yinfeng-panel';(ui.window||document.body).appendChild(panel);}panel.textContent='';
  for(const [label,cards]of [['普通手牌',normal(p)],['隐锋手牌',hidden(p)]]){const button=document.createElement('button');button.textContent=label+' '+cards.length+(label==='隐锋手牌'?' / 容量 '+capacity(p):'');button.onclick=()=>{if(!p.isUnderControl?.(true))return;const dialog=ui.create.dialog(label,cards,'hidden');privateDialogs.set(dialog,p);dialog.open?.();dialog.addText?.('隐锋牌仍可从手牌栏正常使用、打出或作为自己的代价。');if(typeof dialog.close==='function'){const closeDialog=dialog.close;dialog.close=function(...args){privateDialogs.delete(dialog);return closeDialog.apply(this,args);};const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();dialog.content?.appendChild?.(close);}};panel.appendChild(button);}
 }
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [MAIN]:{forced:true,trigger:{global:'phaseBegin'},filter(e,p){return raw(p).length>0&&!allocations.get(p)?.has(e);},content:[async function(event,trigger,player){
   let turns=allocations.get(player);if(!turns)allocations.set(player,turns=new WeakSet());if(turns.has(trigger))return;turns.add(trigger);patchPlayer(player);const hand=raw(player),old=hidden(player);
   const chooser=player.chooseToMove_new({chooseTime:0});chooser.set('list',[['普通手牌区',hand.filter(c=>!old.includes(c))],['隐锋手牌区（容量'+capacity(player)+'）',old]]).set('filterMove',function(from,to,moved){if(typeof to!=='number')return true;return to!==1||moved[1].length<capacity(player);}).set('filterOk',moved=>moved.length===2&&moved.flat().length===hand.length&&new Set(moved.flat()).size===hand.length&&moved.flat().every(c=>hand.includes(c))&&mayAllocate(player,moved[1])).set('processAI',()=>[hand.filter(c=>!old.includes(c)),old]);
   const result=await chooser.forResult();if(result.bool&&result.moved?.[1])allocate(player,result.moved[1]);
  }],mark:true,intro:{content(storage,p){return '普通手牌'+normal(p).length+'张，隐锋手牌'+hidden(p).length+'张；隐藏区容量'+capacity(p)+'。隐锋牌不计入手牌上限，其他角色不能观看或接触。';}}},
  [ids.protect]:rule({firstDo:true,priority:100000000,trigger:{global:['gainBefore','loseBefore','discardBefore','addToExpansionBefore','loseAsyncBefore','showCardsBefore','viewCardsBefore','choosePlayerCardBefore','discardPlayerCardBefore','gainPlayerCardBefore','chooseCardBefore','huogongBefore']},content:[async function(event,trigger){for(const p of players())patchPlayer(p);protectEvent(trigger);}],mod:{ignoredHandcard(card,p){if(isHidden(card,p))return true;},canBeGained(card,actor,target){if(actor!==target&&isHidden(card,target))return false;},canBeDiscarded(card,actor,target){if(actor!==target&&isHidden(card,target))return false;}}}),
  [ids.prepare]:rule({firstDo:true,priority:100000001,trigger:{global:['gameStart','enterGame','phaseBefore']},content:[async function(){for(const p of players())patchPlayer(p);refresh();}]}),
  [ids.clean]:rule({lastDo:true,priority:-100000000,trigger:{global:['gainAfter','loseAfter','loseAsyncAfter','addToExpansionAfter','useCardAfter','respondAfter','phaseAfter']},filter:e=>!seen.has(e),content:[async function(event,trigger){seen.add(trigger);refresh();}]}),
 };
 const translate={[MAIN]:'隐锋',[TAG]:'隐锋',[MAIN+'_info']:'锁定技，游戏开始时，你获得一个隐藏手牌区，其中的牌不计入手牌上限且其他角色无法观看或接触。每回合开始时，你调整普通、隐藏两个手牌区的分配；隐藏区容量为你两个手牌区中梅花J的数量+1。已有牌因容量降低超额时保留，但不能继续放入。新获得的牌进入普通区。'};
 api.yinfeng={ids,hidden,normal,isHidden,capacity,allocate,mayAllocate,protectEvent,patchPlayer,refresh,install(){if(installed)return;installed=true;for(const p of players())patchPlayer(p);for(const id of [ids.protect,ids.prepare,ids.clean]){lib.skill[id]=skills[id];game.addGlobalSkill(id);}if(typeof ui.updatehl==='function'){const update=ui.updatehl;ui.updatehl=function(...args){const result=update.apply(this,args);refresh();return result;};}for(const name of ['swapControl','swapPlayer'])if(typeof game[name]==='function'){const swap=game[name];game[name]=function(...args){const result=swap.apply(this,args);refresh();return result;};}refresh();}};
 return{skills,translate};
},
function junlueFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='J陆逊_隽略',ids={main:MAIN,commit:MAIN+'_用牌记录',fire:MAIN+'_火伤记录',reward:MAIN+'_伤后',discard:MAIN+'_弃牌记录'};
 const SUITS=['spade','heart','club','diamond'];let installed=false,serial=0;
 const budgets=new WeakMap(),fireTurns=new WeakMap(),seenFire=new WeakSet(),paidDamage=new WeakSet(),committed=new WeakSet(),phaseFrames=new WeakMap();
 let fallbackFire={number:-1,value:0};
 const alive=p=>!!p&&p.isIn(),living=()=>game.players.filter(alive),parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function ancestor(e,name){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur.name===name)return cur;seen.add(cur);}return null;}
 const turnOf=e=>ancestor(e,'phase');
 function playOf(e){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur.name==='phaseUse')return cur;if(cur.name==='phase')return null;seen.add(cur);}return null;}
 function budget(p,e=_status.event){let data=budgets.get(p);if(!data)budgets.set(p,data={turns:new WeakMap(),fallback:new Map()});const turn=turnOf(e),number=game.phaseNumber||0;let set=turn?data.turns.get(turn):data.fallback.get(number);if(!set){set=new Set();if(turn)data.turns.set(turn,set);else{data.fallback.clear();data.fallback.set(number,set);}}return set;}
 const used=(p,suit,e=_status.event)=>budget(p,e).has(suit);
 function material(c,p,event=_status.event){if(!alive(p)||!api.yinfeng?.normal(p).includes(c))return false;const suit=get.suit(c,p);return SUITS.includes(suit)&&!used(p,suit,event)&&api.yinfeng.hidden(p).some(h=>get.suit(h,p)===suit);}
 const marked=c=>!!c?.storage?.[MAIN];
 function virtual(p,suit){return{name:'sha',nature:'fire',isCard:true,suit,storage:{[MAIN]:{owner:String(p.playerid),suit,id:'隽略'+(++serial)}}};}
 function stamp(card,p,cards){const old=card?.storage?.[MAIN];if(old&&typeof old==='object'&&old.id)return old;if(!card)return null;const suit=get.suit(cards?.[0]||card,p),m={owner:String(p.playerid),suit,id:'隽略'+(++serial)};card.storage=Object.assign({},card.storage,{[MAIN]:m});return m;}
 function fireTotal(e=_status.event){const turn=turnOf(e);return turn?fireTurns.get(turn)||0:fallbackFire.number===(game.phaseNumber||0)?fallbackFire.value:0;}
 function isFire(e){return e?.num>0&&!e.unreal&&String(e.nature||'').split(lib.natureSeparator||'|').includes('fire');}
 function recordFire(e){if(!isFire(e)||seenFire.has(e))return;seenFire.add(e);const turn=turnOf(e);if(turn)fireTurns.set(turn,(fireTurns.get(turn)||0)+e.num);else{const number=game.phaseNumber||0;if(fallbackFire.number!==number)fallbackFire={number,value:0};fallbackFire.value+=e.num;}}
 function damageUse(damage,seen=new Set()){
  if(!damage||damage.name!=='damage'||seen.has(damage))return null;seen.add(damage);const m=damage.card?.storage?.[MAIN];if(!m?.id)return null;const p=parent(damage);
  if(p?.name==='_lianhuan'||p?.name==='_lianhuan2'){const original=typeof p.getTrigger==='function'?p.getTrigger():p._trigger;const use=damageUse(original,seen);return use?.card?.storage?.[MAIN]?.id===m.id?use:null;}
  if(!p||p.type!=='card'||p.name!==damage.card.name||p.card?.storage?.[MAIN]?.id!==m.id)return null;
  const use=ancestor(p,'useCard');return use?.card?.storage?.[MAIN]?.id===m.id?use:null;
 }
 function rewardOwner(e){if(paidDamage.has(e)||e.num<=0||e.unreal||!damageUse(e))return null;const m=e.card.storage[MAIN];return living().find(p=>String(p.playerid)===m.owner&&p.hasSkill(MAIN))||null;}
 const discardable=(p,t,suit)=>t.getCards('he').filter(c=>get.suit(c,t)===suit&&lib.filter.canBeDiscarded(c,p,t,MAIN));
 function frame(stage){let value=phaseFrames.get(stage);if(!value)phaseFrames.set(stage,value={suits:new Set(),moves:new WeakSet(),handled:false});return value;}
 function directMaterials(record){let related=record.relatedEvent||parent(record);if(related?.name==='orderingDiscard')related=related.relatedEvent||parent(related);if(related?.name==='useCard'||related?.name==='respond')return related.cards||[];return [];}
 function dropped(record){if(record.name==='cardsDiscard')return record.cards||[];if(record.name==='lose'&&(record.position===ui.discardPile||record.position==='d'))return record.cards||[];return [];}
 function collect(stage,event){const state=frame(stage),records=typeof game.getAllGlobalHistory==='function'?game.getAllGlobalHistory('cardMove'):game.getGlobalHistory?.('cardMove')||[];for(const record of [...records,event]){if(!record||state.moves.has(record)||playOf(record)!==stage)continue;const cards=dropped(record);if(!cards.length)continue;state.moves.add(record);const usedCards=directMaterials(record);for(const c of cards){if(usedCards.includes(c))continue;const suit=get.suit(c,false);if(SUITS.includes(suit))state.suits.add(suit);}}return state;}
 const phaseSuits=stage=>[...frame(stage).suits];
 const rule=body=>Object.assign({charlotte:true,forced:true,silent:true,popup:false},body);
 const skills={
  [MAIN]:{
   enable:['chooseToUse','chooseToRespond'],position:'h',selectCard:1,
   filter(event,p){return api.yinfeng?.normal(p).some(c=>material(c,p,event)&&(!event.filterCard||event.filterCard(get.autoViewAs({name:'sha',nature:'fire',storage:{[MAIN]:true}},[c],p),p,event)));},
   filterCard(c,p){return material(c,p);},viewAs:{name:'sha',nature:'fire',storage:{[MAIN]:true}},
   precontent:[async function(event,trigger,p){const result=event.result;if(result?.card)stamp(result.card,p,result.cards);const window=parent(event);if(window)window.addCount=false;}],
   hiddenCard(p,name){return name==='sha'&&api.yinfeng?.normal(p).some(c=>material(c,p));},
   ai:{order:8,respondSha:true,result:{player:1},skillTagFilter(p,tag){if(tag==='respondSha')return api.yinfeng?.normal(p).some(c=>material(c,p));}},
  },
  [ids.commit]:rule({firstDo:true,priority:100000000,trigger:{global:['useCardBefore','respondBefore','useCard1','respond']},filter:e=>marked(e.card)&&!committed.has(e),content:[async function(event,trigger){if(committed.has(trigger))return;committed.add(trigger);const m=stamp(trigger.card,trigger.player,trigger.cards);if(m&&SUITS.includes(m.suit))budget(trigger.player,trigger).add(m.suit);if(trigger.name==='useCard')trigger.addCount=false;}],mod:{cardUsable(c){if(marked(c))return Infinity;},targetInRange(c){if(marked(c))return true;}}}),
  [ids.fire]:rule({firstDo:true,priority:100000000,trigger:{global:'damageEnd'},filter:isFire,content:[async function(event,trigger){recordFire(trigger);}]}),
  [ids.reward]:rule({trigger:{global:'damageEnd'},filter:e=>!!rewardOwner(e),content:[async function(event,trigger){const p=rewardOwner(trigger);if(!p)return;paidDamage.add(trigger);recordFire(trigger);const suit=trigger.card.storage[MAIN].suit,t=trigger.player,n=fireTotal(trigger);if(n>0)await p.draw(n);if(!alive(p)||!alive(t)||!discardable(p,t,suit).length)return;await p.discardPlayerCard({target:t,position:'he',selectButton:[1,1],forced:true,filterButton(button){return discardable(p,t,suit).includes(button.link);},prompt:'隽略：弃置受伤角色一张'+get.translation(suit)+'牌'});}]}),
  [ids.discard]:rule({firstDo:true,priority:10000000,trigger:{global:['loseAfter','loseAsyncAfter','cardsDiscardAfter','equipAfter','judgeAfter','recastAfter','useCardAfter','respondAfter','useSkillAfter']},filter(event){return !!playOf(event);},content:[async function(event,trigger){const stage=playOf(trigger);if(!stage)return;const state=collect(stage,trigger);if(state.handled||state.suits.size<4)return;state.handled=true;const p=stage.player;if(!alive(p)||!p.hasSkill(MAIN))return;const answer=await p.chooseBool('隽略：是否对所有其他角色各造成1点火焰伤害？').set('ai',()=>living().filter(t=>t!==p).reduce((n,t)=>n-get.attitude(p,t),0)>0).forResult();if(!answer.bool||!alive(p)||!p.hasSkill(MAIN))return;p.logSkill(MAIN);for(const t of living().filter(t=>t!==p)){if(!alive(p))break;if(alive(t))await t.damage(1,'fire',p);}}]}),
 };
 const translate={[MAIN]:'隽略',[MAIN+'_info']:'每回合每种花色限一次，你可以将普通手牌区中一张隐藏手牌区包含其花色的牌当做无距离和次数限制且不计次的火【杀】使用或打出。此牌每次造成伤害后，你摸本回合全场已造成的火焰伤害点数张牌，然后弃置受伤角色一张与此【杀】同花色的手牌或装备牌。你的出牌阶段内，本阶段全场不因使用或打出进入弃牌堆的牌首次集齐四种花色时，你可以对所有其他角色各造成1点火焰伤害。'};
 for(const id of Object.values(ids))if(id!==MAIN)translate[id]='隽略';
 api.junlue={ids,material,used,virtual,stamp,fireTotal,damageUse,phaseSuits,directMaterials,collect,install(){if(installed)return;installed=true;for(const id of Object.values(ids))if(id!==MAIN)game.addGlobalSkill(id);}};
 return{skills,translate};
},
function pokerclubjFactory(lib,game,ui,get,ai,_status,api){
 const ids={population:'皇庭_梅花J人数',phase:'皇庭_梅花J持有',lose:'皇庭_梅花J失去',shield:'皇庭_梅花J防伤',discard:'皇庭_梅花J弃置',gain:'皇庭_梅花J获得'};
 const SHIELD='皇庭_梅花J防伤',lossSeen=new WeakSet(),gainSeen=new WeakMap(),enclosing=new Set(['gain','loseAsync','equip','addJudge','addToExpansion']);let installed=false;
 const alive=p=>!!p&&p.isIn(),living=()=>game.players.filter(alive),lu=p=>api.royal.identity(p,'陆逊'),sun=p=>api.royal.identity(p,'孙权');
 const isJ=c=>!!c&&api.royal.isPoker(c)&&get.suit(c,false)==='club'&&get.number(c,false)===11;
 const holding=p=>p.getCards('h').filter(isJ).length,parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function contains(e,root){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur===root)return true;seen.add(cur);}return false;}
 function population(){const state=api.royal.state();if(!Number.isInteger(state.clubJPopulation))state.clubJPopulation=new Set(game.players.concat(game.dead||[])).size;return state.clubJPopulation;}
 function lossEntries(e){
  if(enclosing.has(parent(e)?.name))return [];
  const records=e.name==='lose'&&e.player?[e]:[];
  for(const p of living())for(const record of p.getHistory('lose')||[])if(contains(record,e)&&!records.includes(record))records.push(record);
  const grouped=new Map();for(const record of records){const p=record.player;if(!alive(p)||!lu(p)||lossSeen.has(record)||![...(record.cards||[]),...(record.cards2||[]),...(record.hs||[]),...(record.es||[]),...(record.js||[]),...(record.xs||[])].some(isJ))continue;
   if(!grouped.has(p))grouped.set(p,{player:p,records:[]});grouped.get(p).records.push(record);
  }return [...grouped.values()];
 }
 function gainRecorded(record,p,write=false){let set=gainSeen.get(record);if(write&&!set)gainSeen.set(record,set=new Set());if(write)set.add(p);return !!set?.has(p);}
 function gainEntries(e){
  if(e.name==='gain'&&e.player){if(e.getlx===false||enclosing.has(parent(e)?.name))return [];return [{player:e.player,cards:e.cards||[],records:[e]}];}
  if(typeof e.getg!=='function')return [];
  return living().map(p=>{const all=(p.getHistory('gain')||[]).filter(record=>contains(record,e));const records=all.filter(record=>!gainRecorded(record,p));return {player:p,cards:all.length?records.flatMap(record=>record.cards||[]):e.getg(p)||[],records:all.length?records:[e]};});
 }
 const eligibleGain=item=>alive(item.player)&&!lu(item.player)&&!sun(item.player)&&item.cards.some(isJ)&&item.records.some(record=>!gainRecorded(record,item.player));
 const recastable=p=>p.getCards('h').filter(c=>p.canRecast(c,p));
 const chainTargets=()=>living().filter(p=>!p.isLinked());
 function grantShield(p){p.storage[SHIELD]=true;p.markSkill(ids.shield);}
 async function phaseEffect(p){
  const amount=holding(p);
  for(let i=0;i<amount&&alive(p);i++){
   const choices=[];if(chainTargets().length)choices.push('横置角色');if(recastable(p).length)choices.push('重铸手牌');if(!choices.length)return;choices.push('结束');
   const answer=await p.chooseControl(choices).set('prompt','梅花J：第'+(i+1)+'/'+amount+'次，可以横置一名角色或重铸一张手牌').set('ai',()=>choices[0]).forResult();
   if(!alive(p)||!choices.includes(answer.control)||answer.control==='结束')return;
   if(answer.control==='横置角色'){
    const result=await p.chooseTarget(true,'梅花J：横置一名未横置的角色',function(card,owner,target){return alive(target)&&!target.isLinked();}).set('ai',t=>-get.attitude(p,t)).forResult();
    const target=result.targets?.[0];if(result.bool&&alive(target)&&!target.isLinked())await target.link(true);
   }else{
    const result=await p.chooseCard('h',1,true,'梅花J：重铸一张手牌',function(card,owner){return owner.canRecast(card,owner);}).set('ai',c=>5-get.value(c)).forResult();
    const card=result.cards?.[0];if(result.bool&&p.getCards('h').includes(card)&&p.canRecast(card,p))await p.recast([card]);
   }
  }
 }
 async function reveal(p){
  let shown;
  if(p.countCards('h')){
   const result=await p.chooseCard('h',1,true,'梅花J：展示一张手牌').set('ai',c=>get.value(c)).forResult();
   shown=result.cards?.find(c=>p.getCards('h').includes(c));
   if(shown)await p.showCards([shown],'梅花J：展示的手牌');
  }
  if(!alive(p))return;
  const cards=get.cards(1);if(!cards?.length)return;const top=cards[0];
  await game.cardsGotoOrdering(cards);await p.showCards(cards,'梅花J：亮出牌堆顶牌');
  const same=shown&&get.suit(shown,p)===get.suit(top,false);
  const remaining=cards.filter(c=>get.position(c,true)==='o');if(remaining.length)await game.cardsDiscard(remaining);
  if(same&&alive(p))await p.damage(1,'fire','nosource');
 }
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [ids.population]:rule({firstDo:true,priority:1000000002,trigger:{global:['gameStart','gameDrawBefore','phaseBefore']},filter(){return !Number.isInteger(api.royal.state().clubJPopulation);},content:[async function(){population();}]}),
  [ids.phase]:rule({trigger:{player:'phaseUseBegin'},filter(e,p){return api.royal.active()&&alive(p)&&lu(p)&&holding(p)>0;},content:[async function(event,trigger,p){await phaseEffect(p);}]}),
  [ids.lose]:rule({trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},filter(e){return api.royal.active()&&lossEntries(e).length>0;},content:[async function(event,trigger){const entries=lossEntries(trigger);for(const item of entries)for(const record of item.records)lossSeen.add(record);for(const item of entries)if(alive(item.player))grantShield(item.player);}]}),
  [ids.shield]:rule({mark:true,marktext:'御',intro:{content:'防止下一次受到的伤害。此效果不能叠加。'},firstDo:true,priority:1000000,trigger:{player:'damageBefore'},filter(e,p){return api.royal.active()&&alive(p)&&!!p.storage[SHIELD]&&e.num>0;},content:[async function(event,trigger,p){delete p.storage[SHIELD];p.unmarkSkill(ids.shield);trigger.cancel();}]}),
  [ids.discard]:{
   charlotte:true,ruleSkill:true,enable:'phaseUse',position:'h',selectCard:1,selectTarget:1,discard:true,lose:true,delay:false,
   filter(e,p){return api.royal.active()&&alive(p)&&sun(p)&&p.countCards('h',c=>isJ(c)&&lib.filter.cardDiscardable(c,p,ids.discard))>0&&living().some(t=>t!==p);},
   filterCard(c,p){return isJ(c)&&lib.filter.cardDiscardable(c,p,ids.discard);},filterTarget(c,p,t){return t!==p&&alive(t);},
   content:[async function(event,trigger,p){
    if(!alive(p))return;const high=living().length>population()/2,target=event.target;
    if(alive(target)){const cards=target.getCards(high?'e':'he').filter(c=>(high||get.color(c,target)==='red')&&lib.filter.canBeGained(c,p,target,ids.discard));if(cards.length)await p.gain(cards,target,'giveAuto');}
    if(!high&&alive(p))await p.loseHp(1);
   }],ai:{order:7,result:{player:1,target:-1}},
  },
  [ids.gain]:rule({trigger:{global:['gainAfter','loseAsyncAfter']},filter(e){return api.royal.active()&&gainEntries(e).some(eligibleGain);},content:[async function(event,trigger){for(const item of gainEntries(trigger))if(eligibleGain(item)){for(const record of item.records)gainRecorded(record,item.player,true);await reveal(item.player);}}]}),
 };
 const translate={};for(const id of Object.values(ids))translate[id]='梅花J';translate[ids.discard+'_info']='孙权所有形态出牌阶段可以弃置一张梅花J，令你获得一名其他角色的所有装备牌；若场上存活人数不超过开局人数一半，则改为获得其所有红色手牌和装备牌，然后失去1点体力。可以选择没有相应牌的角色。';
 api.pokerclubj={ids,isJ,holding,population,lossEntries,gainEntries,grantShield,phaseEffect,reveal,install(){if(installed)return;installed=true;for(const[id,skill]of Object.entries(skills)){lib.skill[id]=skill;game.addGlobalSkill(id);}}};
 return {skills,translate};
},
function zhimingFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='Q潘淑_织命';
 const ids={main:MAIN,protect:MAIN+'_护牌',commit:MAIN+'_不计次',extra:MAIN+'_复结算',clear:MAIN+'_回合清理'};
 const turns=new WeakMap(),attempted=new WeakMap(),committed=new WeakSet(),offered=new WeakSet();let installed=false;
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function turnOf(e=_status.event){const seen=new Set();for(let current=e;current&&!seen.has(current);current=parent(current)){if(current.name==='phase')return current;seen.add(current);}return null;}
 function records(e=_status.event){const turn=turnOf(e);return turn?turns.get(turn):null;}
 function watched(p,e=_status.event){return Array.from(records(e)?.get(p)||[]);}
 function remember(p,cards,e=_status.event){const turn=turnOf(e);if(!turn)return false;let data=turns.get(turn);if(!data)turns.set(turn,data=new Map());let set=data.get(p);if(!set)data.set(p,set=new Set());for(const card of cards)set.add(card);return true;}
 function materials(card,extra=[]){const result=new Set(),seen=new Set();function visit(c){if(!c||typeof c!=='object'||seen.has(c))return;seen.add(c);result.add(c);if(Array.isArray(c.cards))for(const material of c.cards)visit(material);}visit(card);for(const c of extra||[])visit(c);return result;}
 function matches(card,set,extra){if(!set?.size)return false;for(const c of materials(card,extra))if(set.has(c))return true;return false;}
 function empowered(card,p,e=_status.event,extra){const turn=turnOf(e);return !!turn&&turn.player===p&&matches(card,turns.get(turn)?.get(p),extra);}
 function forbidden(card,p,target,e=_status.event,extra){const turn=turnOf(e);return !!turn&&turn.player===p&&p!==target&&matches(card,turns.get(turn)?.get(target),extra);}
 const snapshotX=p=>p.getCards('h').filter(c=>get.suit(c,p)==='club'&&get.number(c,p)===12).length;
 function recorded(p,kind,event){const history=typeof p.getAllHistory==='function'?p.getAllHistory(kind):p.getHistory(kind);return history.includes(event);}
 function availableLengths(budget){const list=new Set();for(const c of [...ui.cardPile.childNodes,...ui.discardPile.childNodes]){const n=get.cardNameLength(c);if(Number.isInteger(n)&&n>=1&&n<=budget)list.add(n);}return [...list].sort((a,b)=>a-b);}
 async function obtain(p,budget){let count=0;while(budget>0){const choices=availableLengths(budget);if(!choices.length)break;const controls=choices.map(String),answer=await p.chooseControl(controls).set('prompt','织命：选择要获得牌的牌名字数（剩余额度'+budget+'）').set('ai',()=>controls.length-1).forResult();const n=controls.includes(answer?.control)?Number(answer.control):choices[0];budget-=n;let cards=Array.from(ui.cardPile.childNodes).filter(c=>get.cardNameLength(c)===n);if(!cards.length)cards=Array.from(ui.discardPile.childNodes).filter(c=>get.cardNameLength(c)===n);if(!cards.length)continue;const card=cards[Math.floor(Math.random()*cards.length)],gain=p.gain(card,'gain2');await gain;if(!gain._cancelled&&recorded(p,'gain',gain)&&gain.cards?.includes(card))count++;}return count;}
 async function look(p,x,turn){
  // Match installed chooseToGuanxing: get.cards refills a short pile through
  // the native washCard route, then the detached entities enter ordering.
  const cards=get.cards(x);if(!cards.length)return;await game.cardsGotoOrdering(cards);
  // Keep every viewed entity, including those later placed on the bottom.
  // All cards leave ordering below, so its normal cleanup discards none.
  remember(p,cards,turn);
  const chooser=p.chooseToMove_new({chooseTime:0});
  chooser.set('list',[['牌堆顶（从左至右）',cards.slice()],['牌堆底（从左至右）',[]]])
   .set('prompt','织命：调整牌堆顶与牌堆底的牌及顺序')
   .set('filterMove',()=>true)
   .set('filterOk',moved=>Array.isArray(moved)&&moved.length===2&&moved.every(Array.isArray)&&moved.flat().length===cards.length&&new Set(moved.flat()).size===cards.length&&moved.flat().every(c=>cards.includes(c)))
   .set('processAI',()=>[cards.slice(),[]]);
  const answer=await chooser.forResult();const moved=answer?.bool&&chooser.filterOk(answer.moved)?answer.moved:[cards,[]];
  for(const c of moved[1]){c.fix?.();ui.cardPile.appendChild(c);}
  for(const c of moved[0].slice().reverse()){c.fix?.();if(ui.cardPile.firstChild!==c)ui.cardPile.insertBefore(c,ui.cardPile.firstChild);}
  game.updateRoundNumber();
 }
 function actualDiscard(discard,p){const loss=discard?.done;if(loss?.player!==p||loss.type!=='discard'||loss._cancelled||!Array.isArray(loss.cards)||!recorded(p,'lose',loss))return[];return loss.cards.slice();}
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [MAIN]:{direct:true,trigger:{global:'phaseBegin'},filter(e,p){const turn=turnOf(e);return !!turn&&!attempted.get(turn)?.has(p);},content:[async function(event,trigger,p){
   const turn=turnOf(trigger);if(!turn)return;let starts=attempted.get(turn);if(!starts)attempted.set(turn,starts=new Set());if(starts.has(p))return;starts.add(p);
   const x=snapshotX(p),answer=await p.chooseBool('织命：是否发动？可弃置至多'+x+'张手牌或装备牌').set('ai',()=>x>0).forResult();
   if(!answer?.bool||!p.isIn()||!p.hasSkill(MAIN))return;p.logSkill(MAIN);
   let discarded=[],budget=0;
   if(x>0&&p.getCards('he').some(c=>lib.filter.cardDiscardable(c,p,MAIN))){
    const chosen=await p.chooseCard('he',[0,x],true,'织命：弃置0至'+x+'张手牌或装备牌',c=>lib.filter.cardDiscardable(c,p,MAIN)).forResult();
    const selected=[...new Set(chosen?.cards||[])].filter(c=>p.getCards('he').includes(c)&&lib.filter.cardDiscardable(c,p,MAIN)).slice(0,x);
    const lengths=new Map(selected.map(c=>[c,get.cardNameLength(c,p)]));
    if(selected.length){const discard=p.discard(selected);await discard;discarded=actualDiscard(discard,p);budget=discarded.reduce((n,c)=>n+(lengths.get(c)||0),0);}
   }
   const obtained=await obtain(p,budget);if(obtained===discarded.length&&p.isIn())await look(p,x,turn);
  }],ai:{expose:0.1}},
  [ids.protect]:rule({firstDo:true,priority:100000000,trigger:{global:'useCard2'},filter:e=>e.targets?.some(t=>forbidden(e.card,e.player,t,e,e.cards)),content:[async function(event,trigger){for(const target of trigger.targets||[])if(forbidden(trigger.card,trigger.player,target,trigger,trigger.cards))trigger.excluded.add(target);}],mod:{targetEnabled(card,p,target){if(forbidden(card,p,target))return false;}}}),
  [ids.commit]:rule({firstDo:true,priority:100000000,trigger:{global:'useCardBefore'},filter:e=>!committed.has(e)&&empowered(e.card,e.player,e,e.cards),content:[async function(event,trigger){if(committed.has(trigger))return;committed.add(trigger);trigger.addCount=false;}],mod:{cardUsable(card,p){if(empowered(card,p))return Infinity;},targetInRange(card,p){if(empowered(card,p))return true;}}}),
  [ids.extra]:rule({firstDo:true,priority:100000000,trigger:{global:'useCard1'},filter:e=>!offered.has(e)&&empowered(e.card,e.player,e,e.cards),content:[async function(event,trigger){
   if(offered.has(trigger))return;offered.add(trigger);const p=trigger.player;
   const answer=await p.chooseBool('织命：是否令此牌额外结算一次？').set('ai',()=>true).forResult();
   if(answer?.bool)trigger.effectCount=(typeof trigger.effectCount==='number'?trigger.effectCount:1)+1;
  }]}),
  [ids.clear]:rule({lastDo:true,priority:-100000000,trigger:{global:'phaseAfter'},filter:e=>!!records(e),content:[async function(event,trigger){const turn=turnOf(trigger);if(turn)turns.delete(turn);}]}),
 };
 const translate={[MAIN]:'织命',[MAIN+'_info']:'每个回合开始时，你可以弃置至多X张手牌或装备牌，然后反复选择可取得且不大于剩余额度的牌名字数，优先从牌堆、其次从弃牌堆随机获得一张该字数的牌并扣除额度，直至额度用尽或无可取得的字数。额度为实际弃置牌当时的牌名字数之和。若实际获得与弃置的牌张数相等，你观看牌堆顶X张牌，将其中任意张以任意顺序置于牌堆底，其余以任意顺序置于牌堆顶。本回合角色不能对你使用素材包含这些观看牌的牌；若为你的回合，你使用素材包含这些观看牌的牌无距离和次数限制且不计次，且每次可以令整张牌额外结算一次。X为发动时你两个手牌区中有效梅花Q的数量。'};
 for(const id of Object.values(ids))if(id!==MAIN)translate[id]='织命';
 api.zhiming={ids,turnOf,watched,remember,materials,matches,empowered,forbidden,snapshotX,availableLengths,obtain,look,actualDiscard,install(){if(installed)return;installed=true;for(const id of Object.values(ids))if(id!==MAIN)game.addGlobalSkill(id);}};
 return{skills,translate};
},
function wenzhiFactory(lib,game,ui,get,ai,_status,api){
 const MAIN='Q潘淑_问制',OBSERVE='Q潘淑_问制记录',STATE='Q潘淑_问制轮次',PROCESSED='Q潘淑_问制已替代',REPLACEMENT='Q潘淑_问制代打阶段',RETALIATION='Q潘淑_问制反击';
 const contexts=new WeakMap();let installed=false,serial=0;
 const alive=p=>!!p&&(typeof p.isIn!=='function'||p.isIn());
 const round=()=>Number(game.roundNumber)||0;
 const parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function phaseOf(event){
  if(event?.name==='phaseUse')return event;
  if(event?.name==='phase')return;
  let node=parent(event);
  // An inserted real turn can remain under a suspended replacement phase.
  // Its non-use phases must never inherit that outer phase's statistics.
  while(node){if(node.name==='phaseUse')return node;if(node.name==='phase')return;const next=parent(node);if(next===node)break;node=next;}
 }
 function context(event){return contexts.get(phaseOf(event));}
 function eligible(event,owner){
  const target=event?.player;
  return !!event&&!event[PROCESSED]&&alive(owner)&&owner.hasSkill(MAIN)&&alive(target)&&target!==owner&&target.hp<target.maxHp&&
   !game.hasPlayer(p=>alive(p)&&p.hp<target.hp)&&owner.storage[STATE]?.['轮次']!==round();
 }
 function freeze(ctx){
  if(ctx.snapshot)return ctx.snapshot;
  // Silent native discard losses still write history even when they suppress
  // loseAfter. Keep the observer fast path and inspect only this exact stage.
  if(!ctx.discarded)ctx.discarded=ctx.owner.getAllHistory('lose').some(record=>
   record.type==='discard'&&(record.cards2||record.cards||[]).length>0&&phaseOf(record)===ctx.stage);
  const hp=Number(ctx.original.hp)||0,hand=ctx.original.countCards('h');
  const conditions=[ctx.damage<hp,ctx.types.size!==3,ctx.draws<hand,ctx.discarded];
  const targets=Array.from(ctx.targets).filter(p=>p!==ctx.owner);
  targets.sortBySeat(ctx.original);
  ctx.snapshot=Object.freeze({damage:ctx.damage,draws:ctx.draws,types:Object.freeze(Array.from(ctx.types)),discarded:ctx.discarded,killed:ctx.killed,hp,hand,conditions:Object.freeze(conditions),count:conditions.filter(Boolean).length,targets:Object.freeze(targets)});
  return ctx.snapshot;
 }
 function damageCard(card,player){return get.name(card,player)!=='shandian'&&!!get.tag(card,'damage');}
 function observe(event,timing){
  const ctx=context(event);if(!ctx||ctx.snapshot)return;
  const owner=ctx.owner;
  if(timing==='phaseUseEnd'){freeze(ctx);return;}
  if(timing==='useCard'&&event.player===owner){const type=get.type2(event.card,owner);if(['basic','trick','equip'].includes(type))ctx.types.add(type);}
  else if(timing==='useCardToPlayered'&&event.player===owner&&event.target!==owner&&event.target)ctx.targets.add(event.target);
  else if(timing==='damageSource'&&event.source===owner&&!event.unreal)ctx.damage+=Math.max(0,Number(event.num)||0);
  else if(timing==='gainAfter'&&event.player===owner&&parent(event)?.name==='draw')ctx.draws+=(event.cards||[]).length;
  else if(timing==='loseAfter'&&event.player===owner&&event.type==='discard'&&(event.cards2||event.cards||[]).length)ctx.discarded=true;
  else if(timing==='dieAfter'&&event.source===owner)ctx.killed=true;
 }
 async function retaliate(ctx,snapshot){
  for(const attacker of snapshot.targets){
   if(!alive(attacker)||!alive(ctx.owner))continue;
   for(let index=0;index<snapshot.count&&alive(attacker)&&alive(ctx.owner);index++){
    const target=ctx.owner;
    const choice=attacker.chooseToUse(function(card,player,event){
     return damageCard(card,player)&&lib.filter.filterCard(card,player,event)&&player.canUse(card,target);
    },'问制：你可以对'+get.translation(target)+'使用一张伤害牌（'+(index+1)+'/'+snapshot.count+'）')
     .set(RETALIATION,true).set('targetRequired',true).set('complexSelect',true).set('complexTarget',true)
     .set('filterTarget',function(card,player,current){
      // Follow ordinary card target counts. Global cards keep all their
      // normal targets; manually selected multi-target cards include Pan first.
      const range=get.select(lib.filter.selectTarget(card,player));
      if(current!==target&&!ui.selected.targets.includes(target)&&range[1]!==-1)return false;
      return lib.filter.filterTarget(card,player,current);
     });
    // Each success consumes an ordinary native card use. Declining ends this
    // player's "up to M" sequence, without forfeiting the next player's offer.
    const result=await choice.forResult();if(!result.bool)break;
   }
  }
 }
 async function start(event,trigger,owner){
  if(!eligible(trigger,owner))return;
  const replaced=trigger.player;
  const answer=await owner.chooseBool('问制：摸'+(replaced.maxHp-replaced.hp)+'张牌并代替'+get.translation(replaced)+'执行此出牌阶段？').set('ai',()=>get.attitude(owner,replaced)>=0).forResult();
  if(!answer.bool||!eligible(trigger,owner))return;
  const token=++serial,draw=Math.max(0,replaced.maxHp-replaced.hp),original=_status.currentPhase||replaced;
  owner.storage[STATE]={'轮次':round(),'编号':token};trigger[PROCESSED]=true;
  trigger.finish();owner.logSkill(MAIN,replaced);
  // The original phase is already marked, but no replacement phase exists
  // during this draw or any of its reactions, so none enter Pan's counters.
  await owner.draw(draw);
  if(!alive(owner))return;
  const stage=owner.phaseUse();trigger[REPLACEMENT]=stage;
  const ctx={owner,original,replaced,stage,damage:0,draws:0,types:new Set(),targets:new Set(),discarded:false,killed:false,snapshot:null};
  contexts.set(stage,ctx);
  await stage;
  const snapshot=freeze(ctx);
  if(snapshot.count===0&&snapshot.killed&&owner.storage[STATE]?.['编号']===token)delete owner.storage[STATE];
  await retaliate(ctx,snapshot);
  if(snapshot.count>1&&alive(original)){
   if(alive(owner))await owner.damage(1,original);
   // This reward belongs to the original turn player even if the damage or
   // an earlier retaliation killed Pan. Never change _status.currentPhase.
   if(alive(original))await original.phaseUse();
  }
 }
 const skills={
  [MAIN]:{trigger:{global:'phaseUseBegin'},direct:true,filter:eligible,forceDie:true,
   content:[async function(event,trigger,player){await start(event,trigger,player);} ],
   ai:{expose:0.2,threaten:2}},
  [OBSERVE]:{charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true,
   lastDo:true,priority:-10000000,
   trigger:{global:['useCard','useCardToPlayered','damageSource','gainAfter','loseAfter','dieAfter','phaseUseEnd']},
   filter(event,player){return player===game.players[0]&&!!context(event)&&!context(event).snapshot;},
   content:[async function(event,trigger){observe(trigger,event.triggername);} ]},
 };
 api.wenzhi={ids:{main:MAIN,observe:OBSERVE,state:STATE,processed:PROCESSED,replacement:REPLACEMENT,retaliation:RETALIATION},eligible,context,damageCard,
  install(){if(installed)return;installed=true;game.addGlobalSkill(OBSERVE);}};
 return{skills,translate:{[MAIN]:'问制',[OBSERVE]:'问制',
  [MAIN+'_info']:'每轮限一次，其他角色出牌阶段开始时，若其已受伤且体力值为全场最少，你可以摸其已损体力值张牌，然后用自己的牌和技能代替其执行此出牌阶段。该阶段结束时，统计以下条件：①你造成的伤害点数少于原回合角色此时的体力值；②你使用牌的类型数不为3；③你摸牌数少于原回合角色此时的手牌数；④你自己的牌曾被弃置。每符合一项，此阶段被你使用牌指定过的其他角色各可以对你正常使用一张伤害牌。若符合项数大于1，原回合角色对你造成1点伤害，然后其执行一个额外的出牌阶段；若符合项数为0且你于代打阶段杀死过角色，此技能视为未发动过。发动时的摸牌及其连锁不计入代打阶段统计。',
 }};
},
function pokerclubqFactory(lib,game,ui,get,ai,_status,api){
 const ids={phase:'皇庭_梅花Q持有',lose:'皇庭_梅花Q失去',gain:'皇庭_梅花Q获得',discard:'皇庭_梅花Q弃置',refill:'皇庭_梅花Q续手',count:'皇庭_梅花Q次数记录',random:'皇庭_梅花Q随机',clear:'皇庭_梅花Q清理'};
 const REFILL='皇庭_梅花Q续手',lossSeen=new WeakSet(),gainSeen=new WeakMap(),debts=new WeakMap(),useSeen=new WeakSet(),countAllowed=new WeakMap();
 const enclosing=new Set(['gain','loseAsync','equip','addJudge','addToExpansion']);let installed=false;
 const alive=p=>!!p&&p.isIn(),living=()=>game.players.filter(alive),pan=p=>api.royal.identity(p,'潘淑'),sun=p=>api.royal.identity(p,'孙权');
 // Public effects belong only to an actual printed poker. Suit/number mods,
 // ordinary club queens and virtual cards cannot create this entitlement.
 const isQ=c=>!!c&&api.royal.isPoker(c)&&c.suit==='club'&&Number(c.number)===12;
 const holding=p=>p.getCards('h').filter(isQ).length,parent=e=>typeof e?.getParent==='function'?e.getParent():e?.parent;
 function contains(e,root){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur===root)return true;seen.add(cur);}return false;}
 function turnOf(e){const seen=new Set();for(let cur=e;cur&&!seen.has(cur);cur=parent(cur)){if(cur.name==='phase')return cur;seen.add(cur);}return null;}
 function debt(p,e=_status.event){const turn=turnOf(e);return turn?debts.get(p)?.get(turn)||0:0;}
 function addDebt(p,n,e){const turn=turnOf(e);if(!turn||n<=0)return;let map=debts.get(p);if(!map)debts.set(p,map=new Map());map.set(turn,(map.get(turn)||0)+n);p.markSkill(ids.random);}
 function clearDebt(turn){for(const p of game.players.concat(game.dead||[])){const map=debts.get(p);map?.delete(turn);if(!map?.size)p.unmarkSkill(ids.random);}}
 function lossRecords(e){
  const records=e.name==='lose'&&e.player?[e]:[];
  for(const p of living())for(const record of p.getHistory('lose')||[])if(contains(record,e)&&!records.includes(record))records.push(record);
  return records;
 }
 function lossEntries(e){
  if(enclosing.has(parent(e)?.name))return [];
  const grouped=new Map();for(const record of lossRecords(e)){
   const p=record.player,cards=[...(record.cards||[]),...(record.cards2||[]),...(record.hs||[]),...(record.es||[]),...(record.js||[]),...(record.xs||[])];
   if(!alive(p)||!pan(p)||lossSeen.has(record)||!cards.some(isQ))continue;
   if(!grouped.has(p))grouped.set(p,{player:p,records:[]});grouped.get(p).records.push(record);
  }return [...grouped.values()];
 }
 function gainRecorded(record,p,write=false){let set=gainSeen.get(record);if(write&&!set)gainSeen.set(record,set=new Set());if(write)set.add(p);return !!set?.has(p);}
 function gainEntries(e){
  if(e.name==='gain'&&e.player){if(e.getlx===false||enclosing.has(parent(e)?.name))return [];return [{player:e.player,cards:e.cards||[],records:[e]}];}
  if(typeof e.getg!=='function')return [];
  return living().map(p=>{const all=(p.getHistory('gain')||[]).filter(record=>contains(record,e));const records=all.filter(record=>!gainRecorded(record,p));return {player:p,cards:all.length?records.flatMap(record=>record.cards||[]):e.getg(p)||[],records:all.length?records:[e]};});
 }
 const eligibleGain=item=>alive(item.player)&&!pan(item.player)&&!sun(item.player)&&item.cards.some(isQ)&&item.records.some(record=>!gainRecorded(record,item.player));
 function randomCards(amount,filter=()=>true){
  const picked=[],names=new Set();
  for(const area of ['cardPile','discardPile']){
   const candidates=Array.from(ui[area]?.childNodes||[]).filter(filter);
   while(picked.length<amount){const options=candidates.filter(c=>!names.has(c.name));if(!options.length)break;const card=options[Math.floor(Math.random()*options.length)];picked.push(card);names.add(card.name);}
   if(picked.length>=amount)break;
  }return picked;
 }
 async function phaseEffect(p){
  const amount=holding(p);if(!amount)return;
  const result=await p.chooseBool('梅花Q：是否随机检索'+amount+'张牌名各不相同的牌？').set('ai',()=>true).forResult();
  if(!result.bool||!alive(p))return;const cards=randomCards(amount);if(cards.length)await p.gain(cards,'gain2');
 }
 async function lostEffect(p){
  const result=await p.chooseBool('梅花Q：是否回复1点体力，然后获得一张锦囊牌？').set('ai',()=>true).forResult();
  if(!result.bool||!alive(p))return;await p.recover(1);if(!alive(p))return;
  const cards=randomCards(1,c=>['trick','delay'].includes(get.type(c,false)));if(cards.length)await p.gain(cards,'gain2');
 }
 function hasRefill(p){return !!p.storage[REFILL];}
 function grantRefill(p){p.storage[REFILL]=true;p.markSkill(ids.refill);}
 function refillPlayers(e){return [...new Set(lossRecords(e).filter(record=>record.hs?.length&&alive(record.player)&&hasRefill(record.player)&&!record.player.countCards('h')).map(record=>record.player))];}
 async function standardZhiheng(p,event){
  const legal=p.getCards('he').filter(c=>lib.filter.cardDiscardable(c,p,ids.discard));if(!legal.length)return 0;
  const choice=p.chooseToDiscard('he',[1,Infinity],true,'梅花Q：额外执行一次标准制衡，弃置至少一张牌，摸等量牌').set('ai',c=>6-get.value(c));
  await choice;
  // Count the installed lose records, so prevented discards cannot buy debt
  // or draw cards merely because they appeared in a selection result.
  const actual=new Set();for(const record of p.getHistory('lose')||[])if(contains(record,choice)&&record.type==='discard')for(const c of record.cards2||[])actual.add(c);
  const amount=actual.size;if(amount&&alive(p))await p.draw(amount);return amount;
 }
 async function discardEffect(p,event){
  if(!alive(p))return;
  const lowest=living().every(target=>p.hp<=target.hp);
  if(!lowest){await p.draw(2);if(alive(p))grantRefill(p);return;}
  await p.recover(1);if(!alive(p))return;
  const amount=await standardZhiheng(p,event);if(alive(p))addDebt(p,amount,event);
 }
 function sourceChoice(use){const seen=new Set();for(let cur=parent(use);cur&&!seen.has(cur);cur=parent(cur)){if(cur.name==='chooseToUse')return cur;seen.add(cur);}return use;}
 function snapshotCount(use){
  const choice=sourceChoice(use);
  // Native cardUsable sets addCount_extra for ordinary uses as well. Capture
  // the original count before useCard increments it, so the last normally
  // legal Sha is not mistaken for a target-specific extra use.
  countAllowed.set(use,use.addCount===false||!(use.addCount_extra||choice.addCount_extra)||lib.filter.cardUsable2(use.card,use.player,choice));
 }
 function legalTargets(use){
  const p=use.player,card=use.card,choice=sourceChoice(use);
  // A retaliation/forced-use window can narrow the normal card targets.
  // A view-as backup may replace that callback, so retain both constraints
  // instead of allowing the conversion skill to widen the source window.
  const filters=[...new Set([choice.filterTarget,choice._backup?.filterTarget])];
  return living().filter(target=>{
   if(!lib.filter.targetEnabled(card,p,target)||!lib.filter.targetInRange(card,p,target))return false;
   // A use permitted only by cardUsableTarget retains that restriction.
   if(countAllowed.get(use)===false&&game.checkMod(card,p,target,false,'cardUsableTarget',p)!==true)return false;
   for(const filter of filters)if(filter===false||(typeof filter==='function'&&!filter.call(choice,card,p,target)))return false;
   return true;
  });
 }
 function randomize(use){
  if(useSeen.has(use)||use.targets?.length!==1||debt(use.player,use)<=0)return;
  useSeen.add(use);const map=debts.get(use.player),turn=turnOf(use);map.set(turn,map.get(turn)-1);
  const targets=legalTargets(use);if(!targets.length)return;
  const original=use.targets[0],target=targets[Math.floor(Math.random()*targets.length)];
  // Mutate the native use event's shared targets array before target events
  // are created. The original and replacement can never both resolve.
  use.targets.splice(0,use.targets.length,target);
  if(original!==target&&typeof game.log==='function')game.log(use.player,'的',use.card,'由梅花Q随机改为指定',target);
 }
 const rule=body=>Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false,forceDie:true,forceOut:true},body);
 const skills={
  [ids.phase]:rule({trigger:{player:'phaseUseBegin'},filter(e,p){return api.royal.active()&&alive(p)&&pan(p)&&holding(p)>0;},content:[async function(event,trigger,p){await phaseEffect(p);}]}),
  [ids.lose]:rule({trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},filter(e){return api.royal.active()&&lossEntries(e).length>0;},content:[async function(event,trigger){const entries=lossEntries(trigger);for(const item of entries)for(const record of item.records)lossSeen.add(record);for(const item of entries)if(alive(item.player))await lostEffect(item.player);}]}),
  [ids.gain]:rule({trigger:{global:['gainAfter','loseAsyncAfter']},filter(e){return api.royal.active()&&gainEntries(e).some(eligibleGain);},content:[async function(event,trigger){for(const item of gainEntries(trigger))if(eligibleGain(item)){for(const record of item.records)gainRecorded(record,item.player,true);await item.player.loseHp(1);}}]}),
  [ids.discard]:{
   charlotte:true,ruleSkill:true,enable:'phaseUse',position:'h',selectCard:1,selectTarget:0,discard:true,lose:true,delay:false,
   filter(e,p){return api.royal.active()&&alive(p)&&sun(p)&&p.countCards('h',c=>isQ(c)&&lib.filter.cardDiscardable(c,p,ids.discard))>0;},
   filterCard(c,p){return isQ(c)&&lib.filter.cardDiscardable(c,p,ids.discard);},
   content:[async function(event,trigger,p){await discardEffect(p,event);}],ai:{order:7,result:{player:1}},
  },
  [ids.refill]:rule({mark:true,marktext:'续',intro:{content:'下一次失去最后手牌时，手牌摸至体力上限。持续有效且不叠加。'},trigger:{global:['loseAfter','loseAsyncAfter','gainAfter','equipAfter','addJudgeAfter','addToExpansionAfter']},filter(e){return api.royal.active()&&refillPlayers(e).length>0;},content:[async function(event,trigger){for(const p of refillPlayers(trigger)){delete p.storage[REFILL];p.unmarkSkill(ids.refill);await p.drawTo(p.maxHp);}}]}),
  [ids.count]:rule({firstDo:true,priority:1000000000,trigger:{player:'useCardBefore'},filter(e,p){return api.royal.active()&&alive(p)&&debt(p,e)>0;},content:[async function(event,trigger){snapshotCount(trigger);}]}),
  [ids.random]:rule({mark:true,marktext:'随机',intro:{content(storage,p){return '本回合接下来'+debt(p)+'张单目标牌随机指定合法目标。';}},lastDo:true,priority:-1000000000,trigger:{player:'useCard2'},filter(e,p){return api.royal.active()&&alive(p)&&!useSeen.has(e)&&e.targets?.length===1&&debt(p,e)>0;},content:[async function(event,trigger){randomize(trigger);}]}),
  [ids.clear]:rule({lastDo:true,priority:-1000000000,trigger:{global:'phaseAfter'},filter(e){return e.name==='phase';},content:[async function(event,trigger){clearDebt(trigger);}]}),
 };
 const translate={};for(const id of Object.values(ids))translate[id]='梅花Q';translate[ids.discard+'_info']='孙权所有形态出牌阶段可以弃置一张梅花Q：体力值不是全场最低则摸两张，并获得不叠加的下次空手后补至体力上限效果；体力值为全场最低（含并列）则回复1点体力并额外执行一次标准制衡，实际弃几张，本回合接下来几张单目标牌就在原合法范围内随机指定目标。';
 api.pokerclubq={ids,isQ,holding,lossEntries,gainEntries,randomCards,phaseEffect,lostEffect,hasRefill,grantRefill,standardZhiheng,discardEffect,debt,turnOf,legalTargets,randomize,install(){if(installed)return;installed=true;for(const[id,skill]of Object.entries(skills)){lib.skill[id]=skill;game.addGlobalSkill(id);}}};
 return {skills,translate};
},
function tonghengFactory(lib, game, ui, get, ai, _status, api) {
 const main = 'K孙权_统衡';
 const follow = 'K孙权_统衡结算';
 const first = '先弃后摸';
 const second = '先摸后弃';
 const voidCards = '令这些牌无效';
 const drawCards = '令其各摸两张牌';
 const quotas = new WeakMap();
 const drawsAfterUse = new WeakMap();
 const handledUses = new WeakSet();
 let installed = false;

 function phaseOf(event) {
  return event.getParent('phase', true, true);
 }

 function remainingQuota(event) {
  return quotas.get(phaseOf(event));
 }


 function useOrder(event, player) {
  const phase = phaseOf(event);
  const uses = [event];
  let parent = event.getParent('useCard', true);
  if (!parent) return uses;

  // A loss reaction can use a second card before the outer card's useCard1.
  // Count the outer use first only if it has already entered native history.
  const history = player.getAllHistory('useCard');
  while (parent && phaseOf(parent) === phase) {
   if (parent.player === player && !handledUses.has(parent) && history.includes(parent)) uses.push(parent);
   parent = parent.getParent('useCard', true);
  }
  return uses.reverse();
 }

 function consume(use, pending) {
  if (handledUses.has(use)) return;
  handledUses.add(use);
  let drawCount = 0, invalid = false;
  for (const quota of pending) {
   if (quota.count <= 0) continue;
   quota.count--;
   if (quota.draws) drawCount++;
   else invalid = true;
  }
  if (drawCount) drawsAfterUse.set(use, drawCount);
  if (invalid) {
   use.all_excluded = true;
   game.log(use.card, '因', '#g【统衡】', '无效');
  }
 }

 async function discardAndRefill(player, targetCount, amount) {
  let count = 0;
  if (player.countCards('h', card => lib.filter.cardDiscardable(card, player, main))) {
   const choice = player.chooseToDiscard('h', [1, amount], '统衡：你可以弃置至多' + amount + '张手牌').set('ai', card => 5 - get.value(card));
   await choice;
   count = choice.done?.done?.hs?.length || 0;
  }
  if (player.isIn() && player.countCards('h') < targetCount) await player.drawTo(targetCount);
  return count;
 }

 async function drawAndDiscard(player, targetCount, amount) {
  await player.draw(amount);
  if (!player.isIn()) return 0;
  const excess = player.countCards('h') - targetCount;
  if (excess <= 0) return 0;
  const choice = player.chooseToDiscard('h', excess, true, '统衡：将手牌弃至' + targetCount + '张');
  await choice;
  // chooseToDiscard reports chosen cards even when a subsequent loss is
  // prevented. Its discard child owns the exact native loss for this cost.
  return choice.done?.done?.hs?.length || 0;
 }

 const skills = {
  [main]: {
   trigger: { global: 'phaseBegin' },
   direct: true,
   filter(event, player) {
    return player.isIn() && event.player?.isIn();
   },
   content: [async function(event, trigger, player) {
    const target = trigger.player;
    const hand = player.countCards('h');
    const targetCount = target.countCards('h');
    const amount = player.countCards('h', card => get.suit(card, player) === 'club' && get.number(card, player) === 13) + 1;
    const { bool } = await player.chooseBool('统衡：是否发动？（X＝' + amount + '）')
     .set('ai', () => hand <= targetCount || get.attitude(player, target) < 0).forResult();
    if (!bool) return;
    player.logSkill(main, target);
    let order = hand < targetCount ? [first] : [second];
    if (hand === targetCount) {
     const { control } = await player.chooseControl(first, second).set('prompt', '统衡：先执行哪一项？')
      .set('ai', () => first).forResult();
     order = control === second ? [second, first] : [first, second];
    }
    let discarded = 0;
    for (const branch of order) {
     if (!player.isIn()) break;
     if (branch === first) discarded += await discardAndRefill(player, targetCount, amount);
     else discarded += await drawAndDiscard(player, targetCount, amount);
    }
    if (!discarded || !player.isIn() || !target.isIn()) return;
    const { control } = await player.chooseControl(voidCards, drawCards)
     .set('prompt', '统衡：选择' + get.translation(target) + '本回合接下来使用的' + discarded + '张牌的效果')
     .set('ai', () => get.attitude(player, target) < 0 ? voidCards : drawCards).forResult();
    const pending = quotas.get(trigger) || [];
    pending.push({ count: discarded, draws: control === drawCards });
    quotas.set(trigger, pending);
   }],
  },
  [follow]: {
   trigger: { player: ['useCard1', 'useCardAfter'] },
   charlotte: true,
   ruleSkill: true,
   forced: true,
   silent: true,
   popup: false,
   firstDo: true,
   filter(event, player, timing) {
    if (timing === 'useCardAfter') return drawsAfterUse.has(event);
    const phase = phaseOf(event);
    return !handledUses.has(event) && phase?.player === player && !!remainingQuota(event)?.some(quota => quota.count > 0);
   },
   content: [async function(event, trigger, player) {
    if (event.triggername === 'useCardAfter') {
     const count = drawsAfterUse.get(trigger) || 0;
     drawsAfterUse.delete(trigger);
     for (let i = 0; i < count && player.isIn(); i++) await player.draw(2);
     return;
    }
    for (const use of useOrder(trigger, player)) consume(use, remainingQuota(trigger));
   }],
  },
 };

 api.tongheng = {
  ids: { main, follow },
  install() {
   if (installed) return;
   installed = true;
   game.addGlobalSkill(follow);
  },
 };
 return {
  skills,
  translate: {
   [main]: '统衡',
   [main + '_info']: '每名角色回合开始时，若你的手牌数不大于该角色的手牌数，你可以弃置至多X张手牌，然后将手牌摸至与该角色相同。若你的手牌数不少于该角色，你可以摸X张牌，然后将手牌弃至与该角色相同。若你以此法弃置了牌，选择令该角色本回合接下来使用的等量张牌无效，或令其每结算完其中一张牌摸两张牌。两项弃牌均计入。手牌数相等时，你可以按任意顺序执行两项（X为你手中梅花K的数量+1）。',
   [follow]: '统衡',
  },
 };
},
function qinsheFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'K孙权_亲射';
  const REFRESH = 'K孙权_亲射重置';
  const DISTANCE = 'K孙权_亲射距离';
  const BONUS = 'K孙权_亲射牌';
  const TAG = 'K孙权_亲射摸牌';
  const CLOSER = '你至该角色的距离-1';
  const FARTHER = '该角色至你的距离+1';
  const MOVE = '移动场上一张牌';
  const spent = new WeakMap();

  function stageOf(event, player) {
    const stage = event?.getParent(node => node.name === 'phaseUse' || node.name === 'phase', true, true);
    if (stage?.name === 'phaseUse' && stage.player === player) return stage;
  }

  function range(player) {
    return game.filterPlayer(target => target !== player && target.isIn() && player.inRange(target));
  }

  function rangeChanged(previous, current) {
    return previous.length !== current.length || previous.some(target => !current.includes(target));
  }

  function legalTarget(card, player, target) {
    return target !== player && target.isIn() && player.canUse({ name: 'sha', isCard: true }, target);
  }

  function bonusCard(card, player, skill) {
    if (!card || (skill && lib.skill[skill]?.viewAs)) return false;
    // Natural virtual wrappers preserve the originating physical card's ID.
    // A skill conversion uses the material without inheriting that identity.
    const material = get.itemtype(card) === 'card' ? card : card.cards?.[0];
    if (get.itemtype(material) !== 'card' || !material.hasGaintag(TAG) || !player.getCards('h').includes(material)) return false;
    const name = get.name(material, false);
    const nature = get.nature(material, false);
    if (get.name(material, player) !== name || !get.is.sameNature(get.nature(material, player), nature, true)) return false;
    return material === card || (card.cards.length === 1 && card.cardid === material.cardid &&
      card.name === name && get.is.sameNature(card.nature, nature, true));
  }

  const skills = {
    [MAIN]: {
      enable: 'phaseUse',
      filter(event, player) {
        const stage = stageOf(event, player);
        if (!stage) return false;
        const previous = spent.get(stage);
        if (previous && (ui.selected.cards?.length || !rangeChanged(previous, range(player)))) return false;
        return game.hasPlayer(target => legalTarget(null, player, target));
      },
      filterTarget: legalTarget,
      selectTarget: 1,
      discard: false,
      lose: false,
      line: false,
      group: REFRESH,
      content: [async function(event, trigger, player) {
        const stage = stageOf(event, player);
        const target = event.targets[0];
        if (!stage || !target || !legalTarget(null, player, target)) return;
        spent.set(stage, range(player));
        const attack = player.useCard({ name: 'sha', isCard: true }, target, false);
        await attack;
        if (!player.isIn()) return;

        const options = [];
        if (target.isIn()) options.push(CLOSER, FARTHER);
        if (player.canMoveCard()) options.push(MOVE);
        if (options.length) {
          const { control: choice } = await player.chooseControl(options).set('prompt', '亲射：请选择一项').forResult();
          if (choice === MOVE) await player.moveCard(true);
          else if (target.isIn() && (choice === CLOSER || choice === FARTHER)) {
            const changes = player.storage[DISTANCE] ??= {};
            const pair = changes[target.playerid] ??= [0, 0];
            if (choice === CLOSER) pair[0]--;
            else pair[1]++;
            player.syncStorage(DISTANCE);
            if (!player.hasSkill(DISTANCE)) player.addSkill(DISTANCE);
            if (choice === CLOSER) game.log(player, '计算至', target, '的距离－1');
            else game.log(target, '计算至', player, '的距离＋1');
          }
        }

        if (!player.isIn() || !target.isIn() || !target.hasAllHistory('damage', damage =>
          !damage.unreal && damage.num > 0 && damage.card === attack.card && damage.getParent('useCard') === attack)) return;
        const num = Math.min(player.maxHp, target.getDamagedHp());
        if (num > 0) {
          if (!player.hasSkill(BONUS)) player.addSkill(BONUS);
          await player.draw({ num, gaintag: [TAG] });
        }
      }],
      ai: {
        order: 7,
        result: { target: (player, target) => get.effect(target, { name: 'sha' }, player, target) }
      }
    },
    [REFRESH]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      trigger: {
        player: 'chooseToUseBegin',
        global: ['useSkillAfter', 'useCardAfter', 'equipAfter', 'disableEquipAfter', 'enableEquipAfter',
          'swapEquipAfter', 'loseAfter', 'loseAsyncAfter', 'dieAfter', 'changeHp', 'changeSkillsAfter',
          'changeGroupAfter', 'turnOverAfter', 'linkAfter']
      },
      filter(event, player) {
        if (event.name === 'chooseToUse' && event.type !== 'phase') return false;
        if (ui.selected.cards?.length) return false;
        // A native equipment swap may briefly expose an empty slot while the
        // new weapon is still in transit. Inspect the completed move instead.
        if (event.getParent(node => ['equip', 'swapEquip', 'disableEquip'].includes(node.name), true)) return false;
        const stage = stageOf(event, player);
        const previous = stage && spent.get(stage);
        return !!previous && rangeChanged(previous, range(player));
      },
      content: [async function(event, trigger, player) {
        spent.delete(stageOf(trigger, player));
        game.log(player, '重置了', '#g【亲射】');
      }]
    },
    [DISTANCE]: {
      charlotte: true,
      mod: {
        globalFrom(from, to, distance) {
          return distance + (from.storage[DISTANCE]?.[to.playerid]?.[0] || 0);
        },
        globalTo(from, to, distance) {
          return distance + (to.storage[DISTANCE]?.[from.playerid]?.[1] || 0);
        }
      }
    },
    [BONUS]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      firstDo: true,
      trigger: { player: 'useCardBefore' },
      filter(event, player) {
        return event.addCount !== false && bonusCard(event.card, player, event.skill);
      },
      content: [async function(event, trigger) {
        trigger.addCount = false;
      }],
      mod: {
        cardUsable(card, player) {
          if (bonusCard(card, player, _status.event?.skill)) return Infinity;
        },
        targetInRange(card, player) {
          if (bonusCard(card, player, _status.event?.skill)) return true;
        }
      }
    }
  };

  const translate = {
    [MAIN]: '亲射',
    [MAIN + '_info']: '出牌阶段限一次，你可以视为对一名其他角色使用一张不计次的【杀】。此牌结算完成后，你选择一项：你至该角色的距离－1、该角色至你的距离＋1，或移动场上一张牌。若该角色因此受到伤害且仍存活，你摸其已损体力值张牌（至多为你的体力上限）。你直接使用这些牌无距离和次数限制。你攻击范围内的角色发生变化后，此技能视为未发动过。',
    [REFRESH]: '亲射',
    [DISTANCE]: '亲射',
    [BONUS]: '亲射',
    [TAG]: '亲射'
  };
  api.qinshe = { ids: { main: MAIN, refresh: REFRESH, distance: DISTANCE, bonus: BONUS, tag: TAG } };
  return { skills, translate };
},
function pokerClubKFactory(lib, game, ui, get, ai, _status, api) {
  const ids = {
    population: '皇庭_梅花K人数',
    weapon: '皇庭_梅花K取械',
    loss: '皇庭_梅花K失去',
    round: '皇庭_梅花K补花色',
    dying: '皇庭_梅花K濒死',
    ban: '皇庭_梅花K禁梅花',
  };
  const conventionalSuits = ['spade', 'heart', 'club', 'diamond'];
  const aggregateMoves = ['gain', 'loseAsync', 'equip', 'addJudge', 'addToExpansion'];
  const settledLosses = new WeakSet();
  const pendingDying = new WeakMap();
  let installed = false;

  const alive = player => !!player && player.isIn();
  const living = () => game.players.filter(alive);
  const sun = player => api.royal.identity(player, '孙权');
  const lu = player => api.royal.identity(player, '陆逊');
  const isK = card => get.itemtype(card) === 'card' && api.royal.isPoker(card) &&
    card.suit === 'club' && Number(card.number) === 13;
  const holding = player => player.countCards('h', isK);

  function recordPopulation() {
    const state = api.royal.state();
    if (!state.clubKPopulation) {
      state.clubKPopulation = new Set([...game.players, ...(game.dead || [])]).size;
    }
    return state.clubKPopulation;
  }

  function aboveHalf() {
    return living().length > recordPopulation() / 2;
  }

  function weapons(player) {
    return living().flatMap(owner => owner.getCards('e', card =>
      get.subtypes(card, false).includes('equip1') && lib.filter.canBeGained(card, player, owner)));
  }

  async function takeWeapons(player) {
    const quota = holding(player);
    for (let i = 0; i < quota && alive(player); i++) {
      const candidates = weapons(player);
      if (!candidates.length) break;
      const result = await player.chooseButton([
        '梅花K：可以获得场上一张武器牌（还可获得' + (quota - i) + '张）',
        [candidates, 'card'],
      ]).set('ai', button => get.value(button.link, player)).forResult();
      if (!result.bool || !alive(player)) break;
      const [card] = result.links;
      if (weapons(player).includes(card)) await player.gain(card, 'gain2');
    }
  }

  function lossEntries(move) {
    if (settledLosses.has(move)) return [];
    const players = move.name === 'lose' ? [move.player] : living();
    if (move.name === 'lose' && aggregateMoves.includes(move.getParent()?.name)) return [];
    return players.flatMap(player => {
      if (!alive(player)) return [];
      const equip = sun(player), sacrifice = lu(player) && !aboveHalf();
      if (!equip && !sacrifice) return [];
      const loss = move.name === 'lose' ? move : move.getl?.(player);
      return loss?.cards?.some(isK) ? [{player, equip, sacrifice}] : [];
    });
  }

  function randomFromPiles(filter) {
    for (const area of [ui.cardPile, ui.discardPile]) {
      const cards = Array.from(area.childNodes).filter(filter);
      if (cards.length) return cards[Math.floor(Math.random() * cards.length)];
    }
  }

  function equipsFor(player, card) {
    return get.type(card, false) === 'equip' && player.canUse(card, player, null, true);
  }

  function replacementCount(player, choice, physical) {
    const losses = player.getAllHistory('lose', record => {
      const use = record.getParent('useCard', true);
      return use?.getParent() === choice && use.cards.includes(physical) && record.es?.length;
    });
    // A successful equip can itself trigger effects that immediately remove it.
    const equipped = player.getCards('e').includes(physical) || losses.some(record => record.es.includes(physical));
    if (!equipped) return 0;

    const replaced = new Set();
    for (const record of losses) {
      if (!record.swapEquip || record.getParent().name !== 'equip' || !record.getParent().cards.includes(physical)) continue;
      for (const card of record.es) replaced.add(record.vcard_map.get(card) || card);
    }
    return Array.from(replaced).reduce((total, card) => total + get.cardNameLength(card, false), 0);
  }

  async function sunLost(player) {
    const equipment = randomFromPiles(card => equipsFor(player, card));
    if (!equipment) return;
    const choice = player.chooseUseTarget(equipment, [player], true);
    const result = await choice.forResult();
    if (!result.bool || !alive(player)) return;
    const max = replacementCount(player, choice, equipment);
    if (!max || !living().some(target => target !== player)) return;
    const answer = await player.chooseTarget([1, max], '梅花K：可以对至多' + max + '名其他角色各造成1点伤害',
      (card, owner, target) => owner !== target && target.isIn())
      .set('ai', target => get.damageEffect(target, player, player)).forResult();
    if (answer.bool) {
      for (const target of new Set(answer.targets)) {
        if (alive(target) && target !== player) await target.damage(1, player);
      }
    }
  }

  function missingSuits(player) {
    const held = new Set(player.getCards('h').map(card => get.suit(card, player)));
    return conventionalSuits.filter(suit => !held.has(suit));
  }

  async function fillSuits(player) {
    const answer = await player.chooseBool('梅花K：是否获得手牌中没有的花色的牌各一张？')
      .set('ai', () => true).forResult();
    if (!answer.bool || !alive(player)) return;
    const cards = missingSuits(player).map(suit => randomFromPiles(card => card.suit === suit)).filter(Boolean);
    if (cards.length) await player.gain(cards, 'gain2');
  }

  async function luLost(player) {
    if (player.hp <= 0) return;
    const loss = player.loseHp(player.hp);
    const record = { player, entered: false };
    pendingDying.set(loss, record);
    await loss;
    pendingDying.delete(loss);
    if (record.entered && alive(player) && player.hp > 0 && player.isDamaged()) {
      await player.recover(player.maxHp - player.hp);
    }
  }

  function banned(card, player) {
    return api.royal.active() && alive(player) && !sun(player) && !lu(player) &&
      holding(player) && get.suit(card, player) === 'club';
  }

  const rule = body => Object.assign({
    charlotte: true, ruleSkill: true, forced: true, silent: true, popup: false, forceDie: true, forceOut: true,
  }, body);

  const skills = {
    [ids.population]: rule({
      firstDo: true, priority: 1000000002,
      trigger: {global: ['gameStart', 'gameDrawBefore', 'phaseBefore']},
      filter() { return !api.royal.state().clubKPopulation && living().length > 0; },
      content: [async function () { recordPopulation(); }],
    }),
    [ids.weapon]: rule({
      trigger: {player: 'phaseUseBegin'},
      filter(event, player) { return api.royal.active() && alive(player) && sun(player) && holding(player) > 0 && weapons(player).length > 0; },
      content: [async function (event, trigger, player) { await takeWeapons(player); }],
    }),
    [ids.loss]: rule({
      trigger: {global: ['loseAfter', ...aggregateMoves.map(name => name + 'After')]},
      filter(event) { return api.royal.active() && lossEntries(event).length > 0; },
      content: [async function (event, trigger) {
        const entries = lossEntries(trigger);
        settledLosses.add(trigger);
        for (const {player, equip, sacrifice} of entries) {
          if (equip && alive(player)) await sunLost(player);
          if (sacrifice && alive(player)) await luLost(player);
        }
      }],
    }),
    [ids.round]: rule({
      trigger: {global: 'roundStart'},
      filter(event, player) {
        return api.royal.active() && alive(player) && lu(player) && holding(player) > 0 &&
          aboveHalf() && missingSuits(player).length > 0;
      },
      content: [async function (event, trigger, player) { await fillSuits(player); }],
    }),
    [ids.dying]: rule({
      firstDo: true, priority: 1000000000,
      trigger: {player: 'dying'},
      filter(event, player) { return pendingDying.get(event.reason)?.player === player; },
      content: [async function (event, trigger) {
        const record = pendingDying.get(trigger.reason);
        if (record) record.entered = true;
      }],
    }),
    [ids.ban]: rule({
      mod: {
        cardEnabled(card, player) { if (banned(card, player)) return false; },
        cardSavable(card, player) { if (banned(card, player)) return false; },
      },
    }),
  };

  const translate = Object.fromEntries(Object.values(ids).map(id => [id, '梅花K']));
  api.pokerclubk = {
    ids, isK,
    install() {
      if (installed) return;
      installed = true;
      for (const [id, skill] of Object.entries(skills)) {
        lib.skill[id] = skill;
        game.addGlobalSkill(id);
      }
    },
  };
  return {skills, translate};
},
function daodeFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'J羊祜_蹈德';
  const COUNT = 'J羊祜_蹈德次数';
  const WATCH = 'J羊祜_蹈德伤害记录';
  const EFFECT = 'J羊祜_蹈德回合效果';
  const RETURN = '交给羊祜等量牌';
  const DRAW = '令羊祜摸等量牌';
  const rules = new WeakMap();
  const processed = new WeakSet();
  let damageTargets = new WeakMap();
  let installed = false;

  function firstPlayer(player) {
    return game.filterPlayer(current => current.isIn())[0] === player;
  }

  function phaseOf(event) {
    return event.getParent('phase', true, true);
  }

  function canGive(card, from, to) {
    return lib.filter.canBeGained(card, to, from);
  }

  function hasSkill(player, name) {
    // A sealed or temporary skill is still on the character and must not have
    // its existing expiry changed.
    return player.skills?.includes(name) || player.hasSkill(name, null, false, false) ||
      Object.values(player.additionalSkills || {}).some(value =>
        (Array.isArray(value) ? value : [value]).includes(name));
  }

  function acquire(player, skill, expiry) {
    if (lib.skill[skill] && !hasSkill(player, skill)) player.addTempSkill(skill, expiry);
  }

  const skills = {
    [WATCH]: {
      trigger: { global: ['roundStart', 'damageEnd'] },
      forced: true,
      silent: true,
      popup: false,
      firstDo: true,
      charlotte: true,
      ruleSkill: true,
      filter(event, player, timing) {
        return firstPlayer(player) && !processed.has(event) &&
          (timing === 'roundStart' || !!event.source && event.num > 0 && !!event.player);
      },
      content: [async function(event, trigger) {
        processed.add(trigger);
        if (event.triggername === 'roundStart') {
          damageTargets = new WeakMap();
          return;
        }
        let targets = damageTargets.get(trigger.source);
        if (!targets) damageTargets.set(trigger.source, targets = new WeakSet());
        targets.add(trigger.player);
      }]
    },
    [EFFECT]: {
      trigger: { player: 'useCard1' },
      forced: true,
      silent: true,
      popup: false,
      firstDo: true,
      charlotte: true,
      ruleSkill: true,
      filter(event, player) {
        const entries = rules.get(phaseOf(event));
        return !!entries?.some(item => !item.used && item.actor === player &&
          (item.mode === DRAW || item.owner.isIn() && event.targets?.includes(item.owner)));
      },
      content: [async function(event, trigger, player) {
        for (const item of rules.get(phaseOf(trigger)) || []) {
          if (item.used || item.actor !== player) continue;
          if (item.mode === DRAW) {
            item.used = true;
            trigger.effectCount = (trigger.effectCount || 1) + 1;
          } else if (item.owner.isIn() && trigger.targets?.includes(item.owner)) {
            item.used = true;
            trigger.excluded.add(item.owner);
          }
        }
      }]
    },
    [MAIN]: {
      trigger: { global: 'phaseBegin' },
      direct: true,
      filter(event, player) {
        const target = event.player;
        return target && target !== player && player.isIn() && target.isIn() &&
          !damageTargets.get(player)?.has(target) &&
          player.countCards('he', card => canGive(card, player, target)) > 0;
      },
      content: [async function(event, trigger, player) {
        const target = trigger.player;
        const limit = 1 + player.countCards('h', card =>
          get.suit(card, player) === 'diamond' && get.number(card, player) === 11);
        const selection = await player.chooseCard('he', [1, limit],
          '蹈德：选择交给' + get.translation(target) + '的牌')
          .set('filterCard', card => canGive(card, player, target))
          .set('ai', card => 6 - get.value(card)).forResult();
        if (!selection.bool || !selection.cards?.length || !player.isIn() || !target.isIn()) return;
        const cards = selection.cards.slice();
        const points = new Map(cards.map(card => [card, Number(get.number(card, player)) || 0]));
        player.logSkill(MAIN, target);
        player.storage[COUNT] = (player.storage[COUNT] || 0) + 1;
        const transfer = player.give(cards, target);
        await transfer;
        const received = transfer.getg(target).filter(card =>
          cards.includes(card) && transfer.getl(player)?.cards2?.includes(card));
        const sum = received.reduce((total, card) => total + points.get(card), 0);
        if (received.length && player.isIn() && target.isIn()) {
          const eligible = target.getCards('he').filter(card =>
            !received.includes(card) && canGive(card, target, player));
          let mode = DRAW;
          if (eligible.length >= received.length) {
            const choice = await target.chooseControl(RETURN, DRAW)
              .set('prompt', '蹈德：选择交回' + received.length + '张牌，或令其摸等量牌')
              .set('ai', () => get.attitude(target, player) > 0 ? DRAW : RETURN).forResult();
            mode = choice.control === RETURN ? RETURN : DRAW;
          }
          if (mode === RETURN) {
            await target.chooseToGive(player, 'he', received.length, true,
              card => !received.includes(card) && canGive(card, target, player)).set('prompt', '蹈德：交给羊祜等量牌').forResult();
          } else {
            await player.draw(received.length);
          }
          const pending = rules.get(trigger) || [];
          pending.push({ actor: target, owner: player, mode, used: false });
          rules.set(trigger, pending);
        }
        if (!player.isIn()) return;
        if (sum >= 10) acquire(player, 'drlt_huairou', {global:'roundStart'});
        if (sum >= 20) acquire(player, 'rerende', {global:'roundStart'});
        if (sum >= 30) acquire(player, 'dcsbtuicheng', {player:'phaseAfter'});
      }]
    }
  };

  api.daode = {
    ids: { main: MAIN, count: COUNT, watch: WATCH, effect: EFFECT },
    install() {
      if (installed) return;
      installed = true;
      game.addGlobalSkill(WATCH);
      game.addGlobalSkill(EFFECT);
    }
  };
  return {
    skills,
    translate: {
      [MAIN]:'蹈德',
      [MAIN + '_info']:'其他角色回合开始时，若你本轮未对其造成过伤害，你可以交给其至多X张牌（至少一张），其选择一项：交给你等量张牌（不能选择本次你交给他的牌），且本回合对你使用的第一张牌对你无效；或令你摸等量张牌，且本回合使用的第一张牌额外结算一次。然后按你本次给出牌的点数之和获得技能：不少于10获得【怀柔】直到本轮结束，不少于20获得【仁德】直到本轮结束，不少于30获得【推诚】直到你下回合结束。X为你手中方片J的数量加1。',
      [WATCH]:'蹈德', [EFFECT]:'蹈德'
    }
  };
},
function jiceFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'J羊祜_继策';
  const BONUS = 'J羊祜_继策增益';
  const COUNT = 'J羊祜_蹈德次数';
  const AMOUNT = 'J羊祜_继策数值';
  const CHARACTER = 'bjgy_jyanghu';
  const DUYU = 'dc_duyu';

  function names(player) {
    return [...new Set([player.name, player.name1, player.name2].filter(Boolean))];
  }

  function isDuyu(player) {
    for (const id of names(player)) {
      let data;
      try { data = get.character?.(id) || lib.character[id]; } catch (_) { data = lib.character[id]; }
      let identity = data?.names;
      if (!identity && Array.isArray(data)) {
        identity = (data[4] || []).find(tag => typeof tag === 'string' && tag.startsWith('name:'))?.slice(5);
      }
      if (identity && String(identity).split('-').some(part => part.replace(/\|/g, '') === '杜预')) return true;
      if (id === 'duyu' || id.endsWith('_duyu')) return true;
      if (!identity && /杜预/.test(lib.translate[id] || '')) return true;
    }
    return false;
  }

  function hasDuyu() {
    return game.hasPlayer(target => target.isIn() && isDuyu(target));
  }

  function amount(player) {
    const groups = new Set(game.filterPlayer(target => target.isIn() && (!lib.group || lib.group.includes(target.group))).map(target => target.group));
    return Math.min(Math.max(0, Number(player.storage[COUNT]) || 0), groups.size);
  }

  function ensureDuyu() {
    if (!lib.character[DUYU]) {
      const original = lib.characterPack?.xianding?.[DUYU];
      lib.character[DUYU] = original || ['male', 'wei', 4, ['dcjianguo', 'dcdyqingshi'], ['border:jin']];
    }
  }

  const skills = {
    [MAIN]: {
      trigger: { player: 'dying' },
      limited: true,
      skillAnimation: true,
      animationColor: 'soil',
      direct: true,
      filter(event, player) {
        return player.isIn() && !player.awakenedSkills.includes(MAIN);
      },
      content: [async function(event, trigger, player) {
        const has = hasDuyu();
        const { bool } = await player.chooseBool(has
          ? '继策：是否失去蹈德并获得永久增益，然后增加体力上限并回复体力？'
          : '继策：是否将武将牌替换为杜预并回复体力？')
          .set('ai', () => true).forResult();
        if (!bool) return;
        player.logSkill(MAIN);
        player.awakenSkill(MAIN);
        if (!has) {
          ensureDuyu();
          const slot = names(player).find(id => id === CHARACTER) || player.name1 || player.name;
          if (!slot) return;
          player.reinit(slot, DUYU);
          if (player.group !== 'jin') await player.changeGroup('jin');
        } else {
          const value = amount(player);
          player.removeSkill('J羊祜_蹈德');
          player.storage[AMOUNT] = value;
          player.addSkill(BONUS);
          if (value > 0) await player.gainMaxHp(value);
        }
        if (player.isIn() && player.hp < player.maxHp) await player.recover(player.maxHp - player.hp);
      }],
    },
    [BONUS]: {
      charlotte: true,
      mark: true,
      intro: {
        content(storage, player) {
          const value = Number(player.storage[AMOUNT]) || 0;
          return '摸牌阶段摸牌数、出牌阶段使用【杀】的次数与手牌上限+' + value + '，使用牌无距离限制。';
        },
      },
      trigger: { player: 'phaseDrawBegin2' },
      forced: true,
      silent: true,
      filter(event, player) {
        return !event.numFixed && (Number(player.storage[AMOUNT]) || 0) > 0;
      },
      content: [async function(event, trigger, player) {
        trigger.num += Number(player.storage[AMOUNT]) || 0;
      }],
      mod: {
        cardUsable(card, player, num) {
          if (get.name(card, player) === 'sha') return num + (Number(player.storage[AMOUNT]) || 0);
        },
        maxHandcard(player, num) {
          return num + (Number(player.storage[AMOUNT]) || 0);
        },
        targetInRange(card, player) {
          return true;
        },
      },
    },
  };

  api.jice = { ids: { main: MAIN, bonus: BONUS, count: COUNT, amount: AMOUNT } };
  return {
    skills,
    translate: {
      [MAIN]: '继策',
      [MAIN + '_info']: '限定技，当你进入濒死状态时，若场上没有杜预，你可以将武将牌替换为标准杜预（势力保持为晋），然后回复体力至体力上限；若场上有杜预，你可以失去“蹈德”，且本局游戏摸牌阶段摸牌数、出牌阶段使用【杀】的次数及手牌上限+X，使用牌无距离限制，然后增加X点体力上限并将体力回复至体力上限（X为本局游戏发动“蹈德”的次数且至多为场上势力数）。',
      [BONUS]: '继策',
    },
  };
},
function pokerDiamondJFactory(lib, game, ui, get, ai, _status, api) {
  const ids = {
    show: '皇庭_方片J展示', use: '皇庭_方片J用牌', repeat: '皇庭_方片J结算',
    loss: '皇庭_方片J失去', prevent: '皇庭_方片J防伤',
    duyu: '皇庭_方片J杜预', simayan: '皇庭_方片J司马炎', other: '皇庭_方片J弃牌',
  };
  const aggregateMoves = ['gain', 'loseAsync', 'equip', 'addJudge', 'addToExpansion'];
  const processed = new WeakSet();
  const lossProtection = new WeakSet();
  const shown = new WeakMap();
  const useWindow = new WeakMap();
  let installed = false;
  const alive = player => !!player && player.isIn();
  const yang = player => api.royal.identity(player, '羊祜');
  const du = player => api.royal.identity(player, '杜预');
  const emperor = player => api.royal.identity(player, '司马炎');
  const isJ = card => get.itemtype(card) === 'card' && api.royal.isPoker(card) && card.suit === 'diamond' && Number(card.number) === 11;
  const count = player => player.countCards('h', isJ);
  const ordinary = player => !yang(player) && !du(player) && !emperor(player);
  const rule = body => Object.assign({charlotte:true, ruleSkill:true, forced:true, silent:true, popup:false}, body);
  const actualPhase = event => event.name === 'phase' ? event : event.getParent('phase', true, true);

  function entries(move) {
    if (processed.has(move)) return [];
    if (move.name === 'lose' && aggregateMoves.includes(move.getParent()?.name)) return [];
    const people = move.name === 'lose' ? [move.player] : game.players;
    return people.filter(player => {
      if (!alive(player) || !yang(player)) return false;
      const loss = move.name === 'lose' ? move : move.getl?.(player);
      return loss?.cards?.some(isJ);
    });
  }

  function physical(card) {
    if (get.itemtype(card) === 'card') return card;
    if (card?.cards?.length === 1 && card.cardid === card.cards[0].cardid && card.name === get.name(card.cards[0], false)) return card.cards[0];
  }

  function allowed(card, player) {
    const pending = useWindow.get(player), material = physical(card);
    return !!pending && !!material && pending.cards.includes(material) && get.owner(material) === player && get.position(material) === 'h';
  }

  const skills = {
    [ids.show]: rule({
      trigger:{global:'phaseUseBegin'},
      filter(event, player) {return api.royal.active() && alive(player) && yang(player) && event.player !== player && alive(event.player) && count(player) && player.countCards('h');},
      content:[async function(event, trigger, player) {
        const phase = actualPhase(trigger), actor = trigger.player, amount = Math.min(count(player), player.countCards('h'));
        if (!phase || !amount) return;
        const answer = await player.chooseBool('方片J：是否令' + get.translation(actor) + '展示你的至多' + amount + '张手牌？').forResult();
        if (!answer.bool || !alive(actor) || !alive(player)) return;
        const result = await actor.choosePlayerCard(player, 'h', [1, amount], true, '方片J：选择要展示的手牌').set('visible', true).forResult();
        const cards = (result.cards || []).filter(card => get.owner(card) === player && get.position(card) === 'h');
        if (!cards.length) return;
        await player.showCards(cards, '方片J展示的手牌');
        let list = shown.get(phase);
        if (!list) shown.set(phase, list = []);
        list.push({owner:player, cards:cards.slice(), amount:cards.length});
      }],
    }),
    [ids.use]: rule({
      trigger:{global:'phaseAfter'},
      filter(event, player) {return alive(player) && shown.get(event)?.some(item => item.owner === player);},
      content:[async function(event, trigger, player) {
        const entries = shown.get(trigger) || [];
        for (const entry of entries.filter(item => item.owner === player)) {
          const cards = entry.cards.filter(card => get.owner(card) === player && get.position(card) === 'h');
          if (!cards.length || !alive(player)) continue;
          const pending = {cards, amount:entry.amount};
          useWindow.set(player, pending);
          try {
            const next = player.chooseToUse('方片J：你可以使用一张本次展示的手牌');
            next.set('filterCard', (card, current) => allowed(card, current) && lib.filter.cardEnabled(card, current, 'forceEnable'));
            await next;
          } finally {useWindow.delete(player);}
        }
      }],
    }),
    [ids.repeat]: rule({
      trigger:{player:'useCard1'}, firstDo:true,
      filter(event, player) {const material = physical(event.card); return !event.skill && !!material && !!useWindow.get(player)?.cards.includes(material) && event.cards?.includes(material);},
      content:[async function(event, trigger, player) {
        const pending = useWindow.get(player);
        trigger.addCount = false;
        trigger.effectCount += pending.amount;
        useWindow.delete(player);
      }],
      mod:{
        cardUsable(card, player) {if (allowed(card, player)) return Infinity;},
        targetInRange(card, player) {if (allowed(card, player)) return true;},
      },
    }),
    [ids.loss]: rule({
      trigger:{global:['loseAfter', ...aggregateMoves.map(name => name + 'After')]},
      filter(event) {return api.royal.active() && entries(event).length > 0;},
      content:[async function(event, trigger) {const people = entries(trigger); processed.add(trigger); for (const player of people) lossProtection.add(player);}],
    }),
    [ids.prevent]: rule({
      trigger:{source:'damageBegin1'},
      filter(event, player) {return alive(player) && lossProtection.has(player);},
      content:[async function(event, trigger, player) {
        lossProtection.delete(player);
        const result = await player.chooseBool('方片J：是否防止此次伤害并获得受伤角色区域内两张牌？').forResult();
        if (!result.bool) return;
        trigger.cancel();
        const victim = trigger.player;
        if (alive(victim) && victim.getGainableCards(player, 'hej').length) await player.gainPlayerCard(victim, 'hej', 2, true);
      }],
    }),
    [ids.duyu]: rule({
      enable:'phaseUse', position:'he', selectTarget:0, filterCard(card, player) {return isJ(card) && lib.filter.cardDiscardable(card, player, ids.duyu);},
      filter(event, player) {return api.royal.active() && du(player) && player.countCards('he', card => isJ(card) && lib.filter.cardDiscardable(card, player, ids.duyu)) > 0;},
      content:[async function(event, trigger, player) {
        if (!alive(player)) return;
        const limit = Math.max(0, Math.ceil(player.hp / 2));
        const choices = ['摸牌', '弃牌'];
        const result = await player.chooseControl(choices).set('prompt', '方片J：选择摸至多' + limit + '张牌，或弃置' + limit + '张牌').forResult();
        if (result.control === '弃牌') {if (limit) await player.chooseToDiscard('he', limit, true); return;}
        if (!limit) return;
        const numbers = Array.from({length:limit + 1}, (_, i) => String(i));
        const number = await player.chooseControl(numbers).set('prompt', '方片J：选择摸牌张数').forResult();
        if (Number(number.control)) await player.draw(Number(number.control));
      }],
    }),
    [ids.simayan]: rule({
      enable:'phaseUse', usable:1, position:'he', selectTarget:1,
      filterCard(card, player) {return isJ(card) && lib.filter.cardDiscardable(card, player, ids.simayan);},
      filterTarget(card, player, target) {return target !== player && target.group !== 'jin';},
      filter(event, player) {return api.royal.active() && emperor(player) && player.countCards('he', card => isJ(card) && lib.filter.cardDiscardable(card, player, ids.simayan)) && game.hasPlayer(target => target !== player && target.group !== 'jin');},
      content:[async function(event, trigger, player) {
        const target = event.targets[0];
        if (!alive(target)) return;
        if (target.getGainableCards(player, 'he').length) await target.chooseToGive(player, 'he', true);
        if (alive(target)) await target.changeGroup('jin');
      }],
    }),
    [ids.other]: rule({
      trigger:{target:'useCardToTargeted'},
      filter(event, target) {const user = event.player; return api.royal.active() && alive(user) && alive(target) && ordinary(user) && count(user) && get.color(event.card, user) === 'black' && target.countCards('h') < user.countCards('h') && user.getDiscardableCards(target, 'he').length > 0;},
      content:[async function(event, trigger, target) {await target.discardPlayerCard(trigger.player, 'he');}],
    }),
  };
  const translate = Object.fromEntries(Object.values(ids).map(id => [id, '方片J']));
  translate[ids.duyu + '_info'] = '出牌阶段，你可以弃置一张方片J，然后摸至多体力值一半张牌或弃置体力值一半张牌（向上取整）。';
  translate[ids.simayan + '_info'] = '出牌阶段限一次，你可以弃置一张方片J，令一名非晋势力的其他角色交给你一张牌并将其势力永久改为晋。';
  api.pokerdiamondj = {ids, isJ, install() {if (installed) return; installed = true; for (const [id, skill] of Object.entries(skills)) {lib.skill[id] = skill; game.addGlobalSkill(id);}}};
  return {skills, translate};
},
function gudiFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'Q杨艳_固嫡';
  const BONUS = 'Q杨艳_固嫡增益';
  const ROUND = 'Q杨艳_固嫡轮次';
  const stageBonuses = new WeakMap();
  const turnBonuses = new WeakMap();

  function currentEvent(name) {
    const event = _status.event;
    if (!event) return;
    if (event.name === name) return event;
    return event.getParent?.(name, true, true);
  }

  function increment(map, event, player) {
    if (!event) return;
    let values = map.get(event);
    if (!values) map.set(event, values = new WeakMap());
    values.set(player, (values.get(player) || 0) + 1);
    if (!player.hasSkill(BONUS)) player.addSkill(BONUS);
  }

  function amount(map, event, player) {
    return event && map.get(event)?.get(player) || 0;
  }

  function fromPiles(type) {
    for (const pile of [ui.cardPile, ui.discardPile]) {
      const cards = Array.from(pile.childNodes).filter(card => get.type2(card, false) === type);
      if (cards.length) return cards[Math.floor(Math.random() * cards.length)];
    }
  }

  const skills = {
    [MAIN]: {
      trigger: {global: 'phaseUseBegin'},
      direct: true,
      filter(event, player) {
        return player.isIn() && event.player?.isIn() && player.storage[ROUND] !== game.roundNumber;
      },
      content: [async function(event, trigger, player) {
        const target = trigger.player;
        const count = 1 + player.countCards('h', card =>
          get.suit(card, player) === 'diamond' && get.number(card, player) === 12);
        const {bool} = await player.chooseBool('固嫡：是否令' + get.translation(target) + '进行' + count + '次判定？').forResult();
        if (!bool || !player.isIn() || !target.isIn()) return;
        player.logSkill(MAIN, target);
        player.storage[ROUND] = game.roundNumber;
        const turn = trigger.getParent('phase', true, true);
        for (let index = 0; index < count && target.isIn(); index++) {
          const judge = target.judge(() => 0);
          judge.set('judgestr', '固嫡');
          const result = await judge.forResult();
          if (!result?.card || !target.isIn()) continue;
          if (result.color === 'black') {
            const position = get.position(result.card, true);
            if (position === 'o' || position === 'd') await target.gain(result.card, 'gain2');
            if (!target.isIn()) break;
            if (target.canMoveCard()) await target.moveCard();
            if (target.isIn()) increment(stageBonuses, trigger, target);
          } else if (result.color === 'red') {
            const type = get.type2(result.card, false);
            if (target.isDamaged()) await target.recover();
            if (!target.isIn()) break;
            const cards = ['basic', 'trick', 'equip'].filter(item => item !== type).map(fromPiles).filter(Boolean);
            if (cards.length) await target.gain(cards, 'gain2');
            if (target.isIn()) increment(turnBonuses, turn, target);
          }
        }
      }],
    },
    [BONUS]: {
      charlotte: true,
      mod: {
        cardUsable(card, player, number) {
          if (get.name(card, player) === 'sha') return number + amount(stageBonuses, currentEvent('phaseUse'), player);
        },
        maxHandcard(player, number) {
          return number + amount(turnBonuses, currentEvent('phase'), player);
        },
      },
    },
  };
  api.gudi = {ids:{main: MAIN, bonus: BONUS, round: ROUND}};
  return {skills, translate:{
    [MAIN]:'固嫡',
    [MAIN + '_info']:'每轮限一次，一名角色的出牌阶段开始时，你可以令其进行X次判定。每次判定为黑色时，其获得判定牌，可以移动场上一张牌，本阶段使用【杀】的次数+1；为红色时，其回复1点体力，获得与判定牌类型不同的牌各一张，本回合手牌上限+1。X为你手中方片Q数量+1。',
    [BONUS]:'固嫡',
  }};
},
function zeyuanFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'Q杨艳_择媛';
  const DRAW = '所有角色摸两张牌';
  const FIRE = '所有角色受到一点火焰伤害';

  function living() {
    return game.filterPlayer(target => target.isIn()).sortBySeat(_status.currentPhase);
  }

  async function execute(option, source) {
    if (option === DRAW) {
      for (const target of living()) if (target.isIn()) await target.draw(2);
      return;
    }
    for (const target of living()) if (target.isIn()) await target.damage(1, 'fire', source);
  }

  const skills = {
    [MAIN]: {
      enable: 'phaseUse',
      usable: 1,
      selectTarget: 0,
      filter(event, player) {
        return game.hasPlayer(target => target !== player && target.isIn() && target.countCards('h') > 0);
      },
      content: [async function(event, trigger, player) {
        const chosen = await player.chooseControl(DRAW, FIRE)
          .set('prompt', '择媛：选择一项').forResult();
        const selection = await player.chooseTarget('择媛：选择一名有手牌的其他角色', true,
          (card, owner, target) => owner !== target && target.isIn() && target.countCards('h') > 0).forResult();
        const target = selection.targets?.[0];
        if (!target || !target.isIn()) return;
        player.logSkill(MAIN, target);
        const choice = await target.chooseCard('h', true, '择媛：选择一张手牌展示').forResult();
        const handCard = choice.cards?.[0];
        if (!handCard) return;
        const handNumber = Number(get.number(handCard, target)) || 0;
        await target.showCards([handCard], '择媛展示的手牌');
        if (!target.isIn()) return;
        const topCards = get.cards(1);
        if (!topCards.length) return;
        await game.cardsGotoOrdering(topCards);
        const topCard = topCards[0];
        const topNumber = Number(get.number(topCard, false)) || 0;
        await player.showCards(topCards, '择媛亮出的牌');
        if (!target.isIn()) return;
        const selected = chosen.control === FIRE ? FIRE : DRAW;
        const opposite = selected === DRAW ? FIRE : DRAW;
        if (handNumber > topNumber) {
          await execute(selected, target);
        } else if (handNumber < topNumber) {
          await execute(opposite, target);
        } else {
          const order = await target.chooseControl(DRAW, FIRE)
            .set('prompt', '择媛：两项均执行，选择先执行的一项').forResult();
          const first = order.control === FIRE ? FIRE : DRAW;
          await execute(first, target);
          await execute(first === DRAW ? FIRE : DRAW, target);
        }
      }],
      ai: { order: 5, result: { player: 1 } },
    },
  };

  api.zeyuan = { ids: { main: MAIN } };
  return {
    skills,
    translate: {
      [MAIN]: '择媛',
      [MAIN + '_info']: '出牌阶段限一次，你可以选择一项：①所有角色摸两张牌；②所有角色受到一点火焰伤害。然后令一名其他角色展示一张手牌并亮出牌堆顶一张牌。若亮出的牌点数更大，其执行另一项；若展示的牌点数更大，其执行你选择的项；若点数相同，其按选择的顺序执行两项。',
    },
  };
},
function pokerDiamondQFactory(lib, game, ui, get, ai, _status, api) {
  const ids = {
    holder:'皇庭_方片Q持有',
    loss:'皇庭_方片Q失去',
    simayan:'皇庭_方片Q司马炎',
  };
  const suits = ['spade','heart','club','diamond'];
  const aggregateMoves = ['gain','loseAsync','equip','addJudge','addToExpansion'];
  const processed = new WeakSet();
  let installed = false;
  const alive = player => !!player && player.isIn();
  const yang = player => api.royal.identity(player, '杨艳');
  const emperor = player => api.royal.identity(player, '司马炎');
  const isQ = card => get.itemtype(card) === 'card' && api.royal.isPoker(card) && card.suit === 'diamond' && Number(card.number) === 12;
  const count = player => player.countCards('h', isQ);
  const phaseOf = event => event.name === 'phase' ? event : event.getParent('phase', true, true);
  const rule = body => Object.assign({charlotte:true,ruleSkill:true,forced:true,silent:true,popup:false},body);

  function entries(move) {
    if (processed.has(move)) return [];
    if (move.name === 'lose' && aggregateMoves.includes(move.getParent()?.name)) return [];
    const players = move.name === 'lose' ? [move.player] : game.players;
    return players.filter(player => {
      if (!alive(player) || (emperor(player) && !yang(player))) return false;
      const loss = move.name === 'lose' ? move : move.getl?.(player);
      return loss?.cards?.some(isQ);
    });
  }

  function ordinal(event, player) {
    const phase = phaseOf(event);
    if (!phase) return 0;
    const uses = player.getAllHistory('useCard', use => phaseOf(use) === phase);
    const index = uses.indexOf(event);
    return index < 0 ? 0 : index + 1;
  }

  function randomCard(area, suit) {
    const cards = Array.from(area.childNodes).filter(card => card.suit === suit);
    return cards.length ? cards[Math.floor(Math.random() * cards.length)] : null;
  }

  async function completeSuits(player) {
    const present = new Set(player.getCards('h').map(card => get.suit(card, player)));
    const cards = suits.filter(suit => !present.has(suit))
      .map(suit => randomCard(ui.cardPile, suit) || randomCard(ui.discardPile, suit))
      .filter(Boolean);
    if (cards.length) await player.gain(cards, 'gain2');
  }

  async function distribute(player) {
    let remaining = 2;
    const selected = new Set();
    while (remaining > 0 && alive(player) && player.countCards('h', card => !selected.has(card)) &&
      game.hasPlayer(target => target !== player && alive(target))) {
      const result = await player.chooseCardTarget({
        position:'h',
        filterCard(card) {return !selected.has(card);},
        selectCard:[1, remaining],
        filterTarget(card, owner, target) {
          return target !== owner && alive(target) &&
            ui.selected.cards.every(item => lib.filter.canBeGained(item, target, owner));
        },
        prompt:'方片Q：你可以将至多' + remaining + '张手牌交给其他角色',
        ai1(card) {return 6 - get.value(card);},
        ai2(target) {return get.attitude(player,target);},
      }).forResult();
      if (!result.bool || !result.cards?.length || !result.targets?.length) break;
      for (const card of result.cards) selected.add(card);
      remaining -= result.cards.length;
      await player.give(result.cards, result.targets[0]);
    }
  }

  async function yangLost(player) {
    const draw = await player.chooseBool('方片Q：是否摸两张牌？').forResult();
    if (draw.bool && alive(player)) await player.draw(2);
    if (alive(player)) await distribute(player);
  }

  async function otherLost(player) {
    const chosen = [];
    for (const suit of suits) {
      const candidates = player.getCards('h', card =>
        get.suit(card, player) === suit && lib.filter.cardDiscardable(card, player, ids.loss));
      if (candidates.length) chosen.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    if (chosen.length) await player.discard(chosen);
  }

  const skills = {
    [ids.holder]: rule({
      trigger:{player:'useCardAfter'},
      filter(event, player) {
        const number = ordinal(event,player);
        return api.royal.active() && alive(player) && yang(player) && count(player) > 0 && number > 0 && number <= count(player);
      },
      content:[async function(event, trigger, player) {
        const choice = await player.chooseBool('方片Q：是否横置或重置一名其他角色，然后获得手中缺少花色的牌？').forResult();
        if (!choice.bool || !alive(player)) return;
        if (game.hasPlayer(target => target !== player && alive(target))) {
          const result = await player.chooseTarget('方片Q：选择一名其他角色横置或重置', true,
            (card,owner,target) => target !== owner && alive(target)).forResult();
          if (result.bool && result.targets?.[0] && alive(result.targets[0])) await result.targets[0].link();
        }
        if (alive(player)) await completeSuits(player);
      }],
    }),
    [ids.loss]: rule({
      trigger:{global:['loseAfter', ...aggregateMoves.map(name=>name+'After')]},
      filter(event) {return api.royal.active() && entries(event).length > 0;},
      content:[async function(event,trigger) {
        const players = entries(trigger);
        processed.add(trigger);
        for (const player of players) {
          if (!alive(player)) continue;
          if (yang(player)) await yangLost(player);
          else await otherLost(player);
        }
      }],
    }),
    [ids.simayan]: rule({
      enable:'phaseUse',position:'he',selectTarget:1,
      filterCard(card,player) {return isQ(card) && lib.filter.cardDiscardable(card,player,ids.simayan);},
      filterTarget(card,player,target) {return target !== player && alive(target) && target.countCards('h') > 0;},
      filter(event,player) {
        return api.royal.active() && alive(player) && emperor(player) &&
          player.countCards('he', card => isQ(card) && lib.filter.cardDiscardable(card,player,ids.simayan)) > 0 &&
          game.hasPlayer(target => target !== player && alive(target) && target.countCards('h') > 0);
      },
      content:[async function(event,trigger,player) {
        const target = event.targets[0];
        if (!alive(target) || !alive(player)) return;
        const cards = target.getGainableCards(player,'h');
        let amount = 0;
        if (cards.length) {
          const gain = player.gain(cards,target,'giveAuto','bySelf');
          await gain;
          amount = gain.getg(player).filter(card => cards.includes(card)).length;
        }
        if (alive(player) && alive(target) && amount && player.countCards('he')) {
          await player.chooseToGive(target,'he',amount,true);
        }
        if (alive(target)) await target.changeGroup('jin');
      }],
    }),
  };
  const translate = Object.fromEntries(Object.values(ids).map(id=>[id,'方片Q']));
  translate[ids.simayan+'_info'] = '出牌阶段，你可以弃置一张方片Q，获得一名有手牌的其他角色所有手牌，然后交给其等量张牌并将其势力永久修改为晋。';
  api.pokerdiamondq = {ids,isQ,ordinal,install() {
    if (installed) return;
    installed = true;
    for (const [id,skill] of Object.entries(skills)) {lib.skill[id]=skill;game.addGlobalSkill(id);}
  }};
  return {skills,translate};
},
function guijinFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'K司马炎_归晋';
  const RANGE = 'K司马炎_归晋零范围';
  const PREVENT = 'K司马炎_归晋防伤';
  const PROMOTE = '将势力改为晋';
  const ZERO = '本轮攻击范围为0';
  const GUARD = '本轮每回合首次造成伤害时防止之';
  const spent = new WeakMap();

  function turnOf(event) {
    return event.getParent('phase', true, true);
  }

  const skills = {
    [MAIN]: {
      trigger: {global:'roundStart'},
      direct: true,
      filter(event, player) {
        return player.isIn() && player.countCards('h', card =>
          get.suit(card, player) === 'diamond' && get.number(card, player) === 13) > 0 &&
          game.hasPlayer(target => target !== player && target.isIn());
      },
      content: [async function(event, trigger, player) {
        const count = player.countCards('h', card =>
          get.suit(card, player) === 'diamond' && get.number(card, player) === 13);
        if (!count) return;
        const result = await player.chooseTarget([1, count],
          '归晋：选择至多' + count + '名其他角色',
          (card, owner, target) => target !== owner && target.isIn())
          .set('ai', target => -get.attitude(player, target)).forResult();
        if (!result.bool || !result.targets?.length) return;
        player.logSkill(MAIN, result.targets);
        const targets = result.targets.slice().sortBySeat(_status.currentPhase);
        for (const target of targets) {
          if (!target.isIn()) continue;
          const {control} = await target.chooseControl(PROMOTE, ZERO, GUARD)
            .set('prompt', '归晋：选择一项')
            .set('ai', () => PROMOTE).forResult();
          if (!target.isIn()) continue;
          if (control === PROMOTE) {
            await target.changeGroup('jin');
          } else if (control === ZERO) {
            if (!target.hasSkill(RANGE, null, false, false)) target.addTempSkill(RANGE, {global:'roundStart'});
          } else if (control === GUARD) {
            if (!target.hasSkill(PREVENT, null, false, false)) target.addTempSkill(PREVENT, {global:'roundStart'});
          }
        }
      }],
    },
    [RANGE]: {
      charlotte:true,
      mark:true,
      priority:1000000000,
      intro:{content:'本轮攻击范围固定为0'},
      mod:{attackRangeFinal(player, range) {return 0;}},
    },
    [PREVENT]: {
      charlotte:true,
      mark:true,
      intro:{content:'本轮每回合首次造成伤害时防止之'},
      trigger:{source:'damageBegin1'},
      forced:true,
      firstDo:true,
      priority:1000000000,
      filter(event, player) {
        const phase = turnOf(event);
        return !!phase && !spent.get(player)?.has(phase);
      },
      content: [async function(event, trigger, player) {
        const phase = turnOf(trigger);
        if (!phase || spent.get(player)?.has(phase)) return;
        let phases = spent.get(player);
        if (!phases) spent.set(player, phases = new WeakSet());
        phases.add(phase);
        trigger.cancel();
      }],
    },
  };

  api.guijin = {ids:{main:MAIN,range:RANGE,prevent:PREVENT}};
  return {skills,translate:{
    [MAIN]:'归晋',
    [MAIN+'_info']:'每轮开始时，你可以令至多X名其他角色各选择一项：将势力永久改为晋；本轮攻击范围为0；本轮每回合首次造成伤害时防止之。X为你手中方片K的数量。',
    [RANGE]:'归晋',[PREVENT]:'归晋',
  }};
},
function zhiyeFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = 'K司马炎_治业';
  const MONITOR = 'K司马炎_治业阶段';
  const GIVE = '交给司马炎一张非基本牌并改为群';
  const REPLACE = '由司马炎执行本回合';
  const contexts = new WeakMap();
  const wrappers = new WeakMap();
  let installed = false;

  const alive = player => !!player && player.isIn();
  const valid = (card, actor, owner) =>
    get.type2(card, actor) !== 'basic' && lib.filter.canBeGained(card, owner, actor);

  function phaseMethods(phase) {
    const methods = new Set(['phaseZhunbei','phaseJudge','phaseDraw','phaseUse','phaseDiscard','phaseJieshu']);
    for (const entry of phase.phaseList || []) {
      const name = entry.split('|')[0].split('-')[0];
      methods.add(name.startsWith('skip') ? 'phase' + name.slice(4) : name);
    }
    return methods;
  }

  function wrap(actor, phase) {
    let record = wrappers.get(actor);
    if (!record) wrappers.set(actor, record = { phases: new Set(), methods: new Map() });
    record.phases.add(phase);
    for (const name of phaseMethods(phase)) {
      if (record.methods.has(name) || typeof actor[name] !== 'function') continue;
      const original = actor[name];
      const own = Object.prototype.hasOwnProperty.call(actor, name);
      function redirected(...args) {
        const active = _status.event;
        const context = active && contexts.get(active);
        if (context && context.actor === this && alive(context.owner)) {
          return context.owner[name](...args);
        }
        return original.apply(this, args);
      }
      actor[name] = redirected;
      record.methods.set(name, { original, own, redirected });
    }
  }

  function unwrap(actor, phase) {
    const record = wrappers.get(actor);
    if (!record) return;
    record.phases.delete(phase);
    if (record.phases.size) return;
    for (const [name, method] of record.methods) {
      // Respect another extension's later replacement of the same method.
      if (actor[name] !== method.redirected) continue;
      if (method.own) actor[name] = method.original;
      else delete actor[name];
    }
    wrappers.delete(actor);
  }

  function replaceTurn(phase, actor, owner) {
    if (contexts.has(phase)) return false;
    contexts.set(phase, {actor, owner});
    wrap(actor, phase);
    return true;
  }

  const skills = {
    [MAIN]: {
      trigger: {global: 'phaseBegin'},
      forced: true,
      filter(event, player) {
        return alive(player) && alive(event.player) && event.player !== player;
      },
      content: [async function(event, trigger, player) {
        const actor = trigger.player;
        const faction = actor.group;
        if (faction !== 'jin') {
          await actor.damage(1, player);
          return;
        }
        const cards = actor.getCards('he', card => valid(card, actor, player));
        if (cards.length) {
          const result = await actor.chooseControl(GIVE, REPLACE)
            .set('prompt', '治业：交出一张非基本牌并改为群，或由司马炎执行你的回合').forResult();
          if (result.control === GIVE && alive(actor) && alive(player)) {
            const choice = actor.chooseToGive(player, 'he', 1, true,
              card => get.type2(card, actor) !== 'basic');
            await choice.forResult();
            if (choice.done?.getg(player)?.length) {
              if (alive(actor)) await actor.changeGroup('qun');
              return;
            }
          }
        }
        if (alive(actor) && alive(player)) replaceTurn(trigger, actor, player);
      }],
    },
    [MONITOR]: {
      trigger: {global: ['phaseChange','phaseAfter']},
      forced: true, silent: true, popup: false, charlotte: true,
      ruleSkill: true, forceDie: true, forceOut: true, firstDo: true,
      filter(event) {return contexts.has(event);},
      content: [async function(event, trigger) {
        const context = contexts.get(trigger);
        if (!context) return;
        if (event.triggername === 'phaseAfter') {
          contexts.delete(trigger);
          unwrap(context.actor, trigger);
          return;
        }
        if (!alive(context.owner)) {
          trigger.num = trigger.phaseList.length;
          return;
        }
        wrap(context.actor, trigger);
      }],
    },
  };

  api.zhiye = {
    ids: {main: MAIN, monitor: MONITOR},
    contexts,
    install() {
      if (installed) return;
      installed = true;
      game.addGlobalSkill(MONITOR);
    },
  };
  return {
    skills,
    translate: {
      [MAIN]:'治业',
      [MAIN + '_info']:'锁定技，其他晋势力角色的回合开始时，其选择交给你一张非基本牌并永久改为群势力，或由你代替其执行本回合的各阶段。其他非晋势力角色的回合开始时，你对其造成1点伤害。',
      [MONITOR]:'治业',
    },
  };
},
function pokerDiamondKFactory(lib, game, ui, get, ai, _status, api) {
 const ids = {
  loss:'皇庭_方片K失去', assault:'皇庭_方片K激将',
  assaultResponse:'皇庭_方片K激将响应', assaultLock:'皇庭_方片K激将失效',
  shield:'皇庭_方片K护驾', rescue:'皇庭_方片K救援',
  unanswerable:'皇庭_方片K不可响应', prohibition:'皇庭_方片K禁方片',
 };
 const aggregateMoves = ['gain','loseAsync','equip','addJudge','addToExpansion'];
 const processed = new WeakSet();
 let installed = false;
 const alive = player => !!player && player.isIn();
 const emperor = player => api.royal.identity(player, '司马炎');
 const yang = player => api.royal.identity(player, '羊祜');
 const du = player => api.royal.identity(player, '杜预');
 const isK = card => get.itemtype(card) === 'card' && api.royal.isPoker(card) && card.suit === 'diamond' && Number(card.number) === 13;
 const holding = player => player.countCards('h', isK) > 0;
 const applies = player => api.royal.active() && alive(player) && holding(player);
 const ally = (player, target) => target !== player && alive(target) && target.group === 'jin';
 const hasAlly = player => game.hasPlayer(target => ally(player, target));
 const rule = body => Object.assign({charlotte:true, ruleSkill:true}, body);

 function losses(move) {
  if (processed.has(move)) return [];
  if (move.name === 'lose' && aggregateMoves.includes(move.getParent()?.name)) return [];
  const players = move.name === 'lose' ? [move.player] : game.players;
  return players.filter(player => {
   if (!alive(player) || !emperor(player)) return false;
   const event = move.name === 'lose' ? move : move.getl?.(player);
   return event?.cards?.some(isK);
  });
 }
 function prohibited(card, player) {
  return applies(player) && !emperor(player) && !yang(player) && !du(player) && get.suit(card, player) === 'diamond';
 }
 const skills = {
  [ids.loss]: rule({
   trigger:{global:['loseAfter', ...aggregateMoves.map(name=>name+'After')]},
   forced:true, silent:true, popup:false,
   filter(event) { return api.royal.active() && losses(event).length > 0; },
   content:[async function(event, trigger) {
    const players = losses(trigger);
    processed.add(trigger);
    for (const player of players) {
     if (!alive(player)) continue;
     const number = game.filterPlayer(target => alive(target) && target.group === 'jin').length;
     const {bool} = await player.chooseBool('方片K：是否摸' + number + '张牌？').forResult();
     if (bool && alive(player) && number) await player.draw(number);
    }
   }],
  }),
  [ids.assault]: rule({
   enable:['chooseToUse','chooseToRespond'],
   viewAs:{name:'sha'}, filterCard(){return false;}, selectCard:-1,
   filter(event, player) {
    return applies(player) && emperor(player) && hasAlly(player) &&
      !event.jijiang && (event.type !== 'phase' || !player.hasSkill(ids.assaultLock));
   },
   ai:{
    order(){return get.order({name:'sha'}) + 0.3;},
    respondSha:true,
    skillTagFilter(player){return applies(player) && emperor(player) && hasAlly(player);},
   },
  }),
  [ids.assaultResponse]: rule({
   trigger:{player:['useCardBegin','respondBegin']},
   forced:true, silent:true, popup:false,
   filter(event, player) {return event.skill === ids.assault;},
   content:[async function(event, trigger, player) {
    delete trigger.skill;
    const outer = trigger.getParent();
    if (!outer) return;
    outer.set('jijiang', true);
    let current = player.next;
    while (current !== player) {
     if (ally(player, current)) {
      const next = current.chooseToRespond({
       prompt:'是否替' + get.translation(player) + '打出一张杀？',
       filterCard(card, responder){return get.name(card) === 'sha' && lib.filter.cardRespondable(card, responder);},
       ai(){const context = get.event();return get.attitude(context.player, context.source) - 2;},
      });
      next.set('source', player);
      next.set('jijiang', true);
      next.noOrdering = true;
      next.autochoose = lib.filter.autoRespondSha;
      const result = await next.forResult();
      if (result.bool) {
       trigger.card = result.card;
       trigger.cards = result.cards;
       trigger.throw = false;
       return;
      }
     }
     current = current.next;
    }
    player.addTempSkill(ids.assaultLock);
    trigger.cancel();
    outer.goto(0);
   }],
  }),
  [ids.assaultLock]: rule({
   trigger:{global:['useCardAfter','useSkillAfter','phaseAfter']},
   forced:true, silent:true, popup:false,
   filter(event){return event.skill !== ids.assault && event.skill !== 'qinwang';},
   content:[async function(event, trigger, player){player.removeSkill(ids.assaultLock);} ],
  }),
  [ids.shield]: rule({
   trigger:{player:['chooseToRespondBefore','chooseToUseBefore']},
   direct:true,
   filter(event, player) {
    return applies(player) && emperor(player) && !event.responded && !player.storage['皇庭_方片K护驾中'] &&
      event.filterCard({name:'shan',isCard:true}, player, event) && hasAlly(player);
   },
   content:[async function(event, trigger, player) {
    const answer = await player.chooseBool('方片K：是否发动护驾，请其他晋势力角色打出闪？').forResult();
    if (!answer.bool) return;
    player.storage['皇庭_方片K护驾中'] = true;
    try {
     let current = player.next;
     while (current !== player) {
      if (ally(player, current)) {
       const next = current.chooseToRespond({
        prompt:'是否替' + get.translation(player) + '打出一张闪？',
        filterCard:get.filter({name:'shan'}),
        ai(){const context=get.event();return get.attitude(context.player,context.source)-2;},
       });
       next.set('source', player);
       next.autochoose = lib.filter.autoRespondShan;
       if ((await next.forResult()).bool) {
        trigger.result = {bool:true,card:{name:'shan',isCard:true}};
        trigger.responded = true;
        trigger.animate = false;
        return;
       }
      }
      current = current.next;
     }
    } finally { delete player.storage['皇庭_方片K护驾中']; }
   }],
   ai:{respondShan:true,skillTagFilter(player){return applies(player) && emperor(player) && hasAlly(player);}},
  }),
  [ids.rescue]: rule({
   trigger:{target:'taoBegin'},
   forced:true, silent:true, popup:false,
   filter(event, player){return applies(player) && emperor(player) && ally(player, event.player);},
   content:[async function(event, trigger){trigger.baseDamage++;}],
  }),
  [ids.unanswerable]: rule({
   trigger:{player:'useCard1'},
   forced:true, silent:true, popup:false, firstDo:true,
   filter(event, player){return applies(player) && (yang(player) || du(player));},
   content:[async function(event, trigger){trigger.directHit.addArray(game.players);}],
  }),
  [ids.prohibition]: rule({
   mod:{
    cardEnabled(card, player){if (prohibited(card, player)) return false;},
    cardSavable(card, player){if (prohibited(card, player)) return false;},
   },
  }),
 };
 const translate = Object.fromEntries(Object.values(ids).map(id=>[id,'方片K']));
 translate[ids.assault] = '激将';
 translate[ids.assault+'_info'] = '你需要使用或打出【杀】时，可以令其他晋势力角色依次选择是否替你打出【杀】。若有角色响应，你视为使用或打出了此【杀】。';
 translate[ids.shield] = '护驾';
 translate[ids.shield+'_info'] = '你需要使用或打出【闪】时，可以令其他晋势力角色依次选择是否替你打出【闪】。若有角色响应，你视为使用或打出了此【闪】。';
 translate[ids.rescue] = '救援';
 translate[ids.rescue+'_info'] = '其他晋势力角色对你使用【桃】的回复值+1。';
 api.pokerdiamondk = {ids,isK,install() {
  if (installed) return;
  installed = true;
  for (const [id,skill] of Object.entries(skills)) {lib.skill[id]=skill;game.addGlobalSkill(id);}
 }};
 return {skills,translate};
}];
 const modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills||{}));
 const cards=Object.assign({},...modules.map(module=>module.cards||{}));
 const translate=Object.assign({},...modules.map(module=>module.translate||{}));
 const cardTranslate=Object.assign({},...modules.map(module=>module.cardTranslate||{}));
 let installed=false;
 return {
  name:'皇庭',editable:true,connect:false,
  content(){
   if(installed)return;
   for(const id of Object.keys(skills))if(!lib.skill[id])game.addSkill(id,skills[id],translate[id],translate[id+'_info']);
   for(const id of Object.keys(cards))if(!lib.card[id])lib.card[id]=cards[id];
   Object.assign(lib.translate,translate,cardTranslate);
   api.royal.install();
   for(const [name,service] of Object.entries(api))if(name!=='royal'&&typeof service?.install==='function')service.install();
   installed=true;
  },
  precontent(){},help:{},config:{},
  package:{
   character:{character:{"bjgy_jzhangliao":["male","wei",4,["J张辽_呼名","J张辽_复拔"],["die:false","ext:皇庭/bjgy_jzhangliao.jpg","name:张|辽"]],"bjgy_qguozhao":["female","wei",3,["Q郭照_居椒","Q郭照_内训"],["die:false","ext:皇庭/bjgy_qguozhao.jpg","name:郭|照"]],"bjgy_kcaopi":["male","wei",4,["K曹丕_御极","K曹丕_铨才"],["die:false","ext:皇庭/bjgy_kcaopi.jpg","name:曹|丕"]],"bjgy_jguanyu":["male","shu",4,["J关羽_威义","J关羽_牧荆"],["die:false","ext:皇庭/bjgy_jguanyu.jpg","name:关|羽"]],"bjgy_qwuxian":["female","shu",3,["Q吴苋_应贵","Q吴苋_长乐"],["die:false","ext:皇庭/bjgy_qwuxian.jpg","name:吴|苋"]],"bjgy_kliubei":["male","shu",4,["K刘备_绍汉","K刘备_彰烈"],["die:false","ext:皇庭/bjgy_kliubei.jpg","name:刘|备"]],"bjgy_jluxun":["male","wu",4,["J陆逊_隐锋","J陆逊_隽略"],["die:false","ext:皇庭/bjgy_jluxun.jpg","name:陆|逊"]],"bjgy_qpanshu":["female","wu",3,["Q潘淑_织命","Q潘淑_问制"],["die:false","ext:皇庭/bjgy_qpanshu.jpg","name:潘|淑"]],"bjgy_ksunquan":["male","wu",4,["K孙权_统衡","K孙权_亲射"],["die:false","ext:皇庭/bjgy_ksunquan.jpg","name:孙|权"]],"bjgy_jyanghu":["male","jin",3,["J羊祜_蹈德","J羊祜_继策"],["die:false","ext:皇庭/bjgy_jyanghu.jpg","name:羊|祜"]],"bjgy_qyangyan":["female","jin",3,["Q杨艳_固嫡","Q杨艳_择媛"],["die:false","ext:皇庭/bjgy_qyangyan.jpg","name:杨|艳"]],"bjgy_ksimayan":["male","jin",4,["K司马炎_归晋","K司马炎_治业"],["die:false","ext:皇庭/bjgy_ksimayan.jpg","name:司马|炎"]]},translate:{"bjgy_jzhangliao":"J张辽","bjgy_qguozhao":"Q郭照","bjgy_kcaopi":"K曹丕","bjgy_jguanyu":"J关羽","bjgy_qwuxian":"Q吴苋","bjgy_kliubei":"K刘备","bjgy_jluxun":"J陆逊","bjgy_qpanshu":"Q潘淑","bjgy_ksunquan":"K孙权","bjgy_jyanghu":"J羊祜","bjgy_qyangyan":"Q杨艳","bjgy_ksimayan":"K司马炎"},characterIntro:{"bjgy_jzhangliao":"张辽，字文远，魏势力，男性，4/4体力。皇庭系列武将。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，详见扩展说明。","bjgy_qguozhao":"郭照（郭女王），魏势力，女性，3/3体力。皇庭系列武将，对应黑桃Q。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_kcaopi":"曹丕，字子桓，魏势力，男性，4/4体力。皇庭系列武将，对应黑桃K。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_jguanyu":"关羽，字云长，蜀势力，男性，4/4体力。皇庭系列武将，对应红桃J。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_qwuxian":"吴苋，蜀势力，女性，3/3体力。皇庭系列武将，对应红桃Q。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_kliubei":"刘备，字玄德，蜀势力，男性，4/4体力。皇庭系列武将，对应红桃K。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_jluxun":"陆逊，字伯言，吴势力，男性，4/4体力。皇庭系列武将，对应梅花J。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_qpanshu":"潘淑，吴势力，女性，3/3体力。皇庭系列武将，对应梅花Q。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_ksunquan":"孙权，吴势力，男性，4/4体力。皇庭系列武将，对应梅花K。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_jyanghu":"羊祜，晋势力，男性，3/3体力。皇庭系列武将，对应方片J。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_qyangyan":"杨艳，晋势力，女性，3/3体力。皇庭系列武将，对应方片Q。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。","bjgy_ksimayan":"司马炎，晋势力，男性，4/4体力。皇庭系列武将，对应方片K。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。皇庭为登场自动建立并持续至本局结束的系列公共光环，不属于武将技能。"}},
   card:{card:cards,translate:cardTranslate,list:[]},skill:{skill:skills,translate},
   intro:'皇庭系列十二名武将及十二种扑克牌，共用皇庭公共光环。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:"0.1.0"
  },
  files:{character:["bjgy_jzhangliao.jpg","bjgy_qguozhao.jpg","bjgy_kcaopi.jpg","bjgy_jguanyu.jpg","bjgy_qwuxian.jpg","bjgy_kliubei.jpg","bjgy_jluxun.jpg","bjgy_qpanshu.jpg","bjgy_ksunquan.jpg","bjgy_jyanghu.jpg","bjgy_qyangyan.jpg","bjgy_ksimayan.jpg"],card:["皇庭扑克.svg","黑桃Q.svg","黑桃K.svg","红桃J.svg","红桃Q.svg","红桃K.svg","梅花J.svg","梅花Q.svg","梅花K.svg","方片J.svg","方片Q.svg","方片K.svg"],skill:[],audio:[]}
 };
});
