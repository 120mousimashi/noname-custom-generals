// Tibo v0.1.0 测试版。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助。
// 原创代码MIT；设计文字与用户提供的GPT原画分别署名，见README与LICENSE。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const createFue=function createFue(lib,game,ui,get,ai,_status,api){
 const MAIN='bjgy_tibo_fue',DEBT='bjgy_tibo_fue_debt',EXTRA='_bjgyTiboFueExtra';
 const extras=new WeakMap();
 const live=player=>!!player&&player.isIn();
 const alive=player=>!!player&&(typeof player.isDead==='function'?!player.isDead():player.alive!==false);
 function state(player){
  if(!player.storage[DEBT])player.storage[DEBT]={owed:0,pending:0};
  return player.storage[DEBT];
 }
 function mainState(player){
  if(!player.storage[MAIN])player.storage[MAIN]={usedRound:null};
  return player.storage[MAIN];
 }
 function onRound(event){return !event[EXTRA];}
 function installRoundFilter(){
  lib.onround??=[];
  if(!lib.onround.includes(onRound))lib.onround.push(onRound);
 }
 function refresh(player){
  const data=state(player);
  if(data.owed||data.pending){player.addSkill(DEBT);player.markSkill(DEBT);}
  else{player.unmarkSkill(DEBT);player.removeSkill(DEBT);}
 }
 function clear(player){
  const data=state(player);data.owed=0;data.pending=0;refresh(player);
 }
 function finishExtra(extra){
  const record=extras.get(extra);
  if(!record||record.committed)return false;
  record.committed=true;
  const target=record.target,data=state(target);
  data.pending=Math.max(0,data.pending-1);
  if(alive(target))data.owed++;
  else data.owed=0;
  refresh(target);
  return true;
 }
 function registerExtra(extra,target){
  if(extras.has(extra))return extra;
  extra[EXTRA]=true;
  extras.set(extra,{target,committed:false});
  state(target).pending++;refresh(target);installRoundFilter();
  // A normal extra submits its debt at phaseAfter, before another queued turn.
  // Cancelled/Skipped do likewise. An event-instance start completion fallback
  // also covers direct checkSkipped/silent finish paths without any After event.
  // No global GameEvent/Player prototype is modified.
  const nativeStart=extra.start;
  let completion;
  extra.start=function(...args){
   if(!completion){
    const started=nativeStart.apply(this,args);
    completion=Promise.resolve(started).then(value=>{finishExtra(extra);return value;});
   }
   return completion;
  };
  return extra;
 }
 function canOffer(event,owner){
  return live(owner)&&owner.hasSkill(MAIN)&&event?.name==='phase'&&live(event.player)
   &&!event._cancelled&&!event.isSkipped&&!event.player.phaseSkipped
   &&mainState(owner).usedRound!==(Number(game.roundNumber)||0);
 }
 function payable(event,player,admitted=false){
  return state(player).owed>0&&event?.name==='phase'&&event.player===player
   &&!event.finished&&!event._cancelled&&!event.isSkipped&&!event._bjgyTiboFueDebtPaid
   &&live(player)&&(admitted||!player.isTurnedOver()||event._noTurnOver);
 }
 function payDebt(event,player,admitted=false){
  if(!payable(event,player,admitted))return false;
  event._bjgyTiboFueDebtPaid=true;
  state(player).owed--;
  player.phaseSkipped=true;
  for(const current of [...game.players,...(game.dead||[])]){
   const history=current.getHistory?.();if(history)history.isSkipped=true;
   const stat=current.getStat?.();if(stat)stat.isSkipped=true;
  }
  game.log(player,'因【复额】跳过本回合');
  // Do not await a cancellation whose trigger belongs to an ancestor phase.
  event.cancel();
  // phaseBeginStart is after the native turn-over gate but before phaseBegin.
  // The normal tail is skipped by cancellation, so clear its local phase UI.
  if(_status.currentPhase===player)delete _status.currentPhase;
  player.classList?.remove?.('glow_phase');
  refresh(player);
  return true;
 }
 api.fue={state,mainState,onRound,canOffer,payDebt,registerExtra,finishExtra,EXTRA,DEBT};
 return {skills:{
  [MAIN]:{
   trigger:{global:'phaseAfter'},popup:false,
   init(){installRoundFilter();},
   filter(event,player){return canOffer(event,player);},
   async cost(event,trigger,player){
    event.result=await player.chooseBool(`复额：是否令${get.translation(trigger.player)}执行一个额外回合？`)
     .set('prompt2','此额外回合结束或被跳过后，该角色须跳过其下一个本可开始的回合。')
     .set('ai',()=>get.attitude(player,trigger.player)>0).forResult();
   },
   async content(event,trigger,player){
    if(!canOffer(trigger,player))return;
    mainState(player).usedRound=Number(game.roundNumber)||0;
    installRoundFilter();player.logSkill(MAIN,trigger.player);
    // insertPhase queues on the enclosing turn's parent. Awaiting it here
    // would wait on an ancestor queue while this trigger is still unresolved.
    const extra=trigger.player.insertPhase(MAIN);
    registerExtra(extra,trigger.player);
   },
  },
  [DEBT]:{
   charlotte:true,forced:true,popup:false,forceDie:true,includeOut:true,
   firstDo:true,priority:1000000000,
   trigger:{player:['phaseBeginStart','phaseAfter','phaseCancelled','phaseSkipped','dieAfter']},
   filter(event,player,name){
    if(name==='dieAfter')return !!(state(player).owed||state(player).pending);
    if(name==='phaseBeginStart')return payable(event,player,true);
    const record=extras.get(event);return !!record&&!record.committed&&record.target===player;
   },
   async content(event,trigger,player){
    if(event.triggername==='dieAfter'||trigger.name==='die'){clear(player);return;}
    if(event.triggername==='phaseBeginStart'){payDebt(trigger,player,true);return;}
    finishExtra(trigger);
   },
   mark:true,marktext:'额',
   intro:{
    markcount(storage){return storage?.owed||0;},
    content(storage,player){const data=state(player);return `待偿还跳回合：${data.owed}次；待完成的复额额外回合：${data.pending}次。背面翻回正面而跳过的回合不偿还。`;},
   },
  },
 },translate:{
  [MAIN]:'复额',
  [MAIN+'_info']:'每轮限一次，一名角色的实际回合结束时，你可以令该角色执行一个完整的额外回合。此额外回合完成或被跳过后，该角色须跳过其下一个本可正常开始的回合（包括其他效果给予的额外回合）。若因背面朝上翻回正面而跳过一次回合，该次不偿还此代价。复额自身的额外回合不刷新每轮限次；已给予的额外回合及其后续代价不因你失去此技能或阵亡而取消。',
  [DEBT]:'复额·待偿',
  [DEBT+'_info']:'复额给予的额外回合结束或被跳过后，须跳过下一次本可开始的完整回合；翻面跳过不偿还，多个代价逐次偿还。',
 }};
};
 const createChallenge=function createTiaozhan(lib,game,ui,get,ai,_status,api){
 const MAIN='bjgy_tibo_tiaozhan',EFFECT='bjgy_tibo_tz_effect',TRACK='bjgy_tibo_tz_track';
 const STORE='bjgy_tibo_tz_state';
 const frames=new WeakMap(),completed=new WeakSet(),drawn=new WeakSet(),activeNoCount=new WeakMap();
 function state(player){
  if(!player.storage[STORE])player.storage[STORE]={recorded:[],recordedAt:{},handLimit:0,lastCount:0,usedCards:[]};
  return player.storage[STORE];
 }
 const alive=player=>player.isIn();
 function ordinal(use,player){
  const history=player.getAllHistory('useCard'),index=history.indexOf(use);
  return index>=0?index+1:history.length+1;
 }
 function frameFor(use,player){
  let frame=frames.get(use);
  if(!frame){
   const name=get.name(use.card,player),number=get.number(use.card,player),count=ordinal(use,player),s=state(player);
   frame={use,player,name,number,ordinal:count,recordedBefore:s.recorded.includes(name)&&count>(s.recordedAt[name]||0),options:[],noCount:false};
   frames.set(use,frame);
  }
  return frame;
 }
 function randomOptions(){
  const number=get.rand(1,6),pool=[1,2,3,4,5,6],chosen=[];
  for(let i=0;i<number;i++)chosen.push(pool.splice(get.rand(0,pool.length-1),1)[0]);
  return chosen.sort((a,b)=>a-b);
 }
 function physicalCards(list){
  const result=[],seen=new Set();
  function visit(value){
   if(!value||typeof value!=='object'||seen.has(value))return;
   seen.add(value);
   if(Array.isArray(value)){for(const child of value)visit(child);return;}
   const children=Array.isArray(value.cards)?value.cards.filter(child=>child!==value):[];
   if(children.length){for(const child of children)visit(child);return;}
   if(get.itemtype(value)==='card')result.push(value);
  }
  visit(list);return result;
 }
 function sourceUse(move,player){
  if(!move||typeof move.getParent!=='function')return null;
  const parent=move.getParent();let use;
  if(move.name==='cardsDiscard'&&parent?.name==='orderingDiscard')use=parent.relatedEvent||parent.getParent?.();
  else if(move.name==='lose'&&move.type==='use'&&move.player===player&&move.position===ui.discardPile)use=move.relatedEvent||parent;
  return use?.name==='useCard'&&use.player===player?use:null;
 }
 function qualifyingCards(move,player){
  const use=sourceUse(move,player);if(!use)return [];
  const materials=physicalCards(use.cards||[]);
  return physicalCards(move.cards||[]).filter(card=>materials.includes(card)&&get.position(card,true)==='d');
 }
 function recordDiscard(move,player){
  const s=state(player);let changed=false;
  for(const card of qualifyingCards(move,player))if(!s.usedCards.includes(card)){s.usedCards.push(card);changed=true;}
  return changed;
 }
 function option2Candidates(player){
  // Global move history preserves actual use -> orderingDiscard causality,
  // including uses before obtaining/reobtaining the main skill. Do not infer
  // this from a card name or from any discard nested under a card effect.
  for(const move of game.getAllGlobalHistory('cardMove'))recordDiscard(move,player);
  const known=state(player).usedCards;
  return Array.from(ui.discardPile.childNodes).filter(card=>known.includes(card)&&get.position(card,true)==='d');
 }
 function grant(player){player.addSkill(EFFECT);player.markSkill(EFFECT);}
 function removeNoCount(frame){
  frame.noCount=false;
  const list=activeNoCount.get(frame.use.card);
  if(list){list.delete(frame);if(!list.size)activeNoCount.delete(frame.use.card);}
 }
 function noCount(frame){
  const {use,player}=frame;
  if(use.addCount!==false){
   use.addCount=false;
   const stat=player.getStat('card'),name=use.card.name;
   if(typeof stat[name]==='number'&&stat[name]>0)stat[name]--;
  }
  frame.noCount=true;
  if(!activeNoCount.has(use.card))activeNoCount.set(use.card,new Set());
  activeNoCount.get(use.card).add(frame);grant(player);
  // An event after-queue also drains after a later useCard cancellation. Keep
  // the cleanup independent of losing/sealing the main skill or owner death.
  const cleanup=game.createEvent('bjgy_tibo_tz_cleanup',false);
  cleanup.player=player;cleanup.forceDie=true;cleanup.includeOut=true;
  const parent=cleanup.getParent?.()||_status.event;
  const index=parent?.next?.indexOf(cleanup)??-1;if(index>=0)parent.next.splice(index,1);
  cleanup.parent=use;
  use.after ||= [];use.after.push(cleanup);
  cleanup.setContent(async function(){removeNoCount(frame);});
 }
 function isNoCount(card,player){
  return !!card&&[...(activeNoCount.get(card)||[])].some(frame=>frame.player===player&&frame.noCount);
 }
 async function execute(frame,option){
  const {use,player,name,number,ordinal:count}=frame,s=state(player);
  if(option===1)noCount(frame);
  else if(option===2){
   const candidates=option2Candidates(player);
   if(candidates.length&&alive(player))await player.gain(candidates[get.rand(0,candidates.length-1)],'gain2');
  }else if(option===3){s.handLimit++;grant(player);}
  else if(option===4){
   if(!Array.isArray(use.directHit))use.directHit=[];
   for(const target of game.filterPlayer())if(!use.directHit.includes(target))use.directHit.push(target);
  }else if(option===5){
   if(!s.recorded.includes(name)){s.recorded.push(name);s.recordedAt[name]=count;}
   grant(player);
  }else if(option===6){
   if(!Number.isInteger(number)||number<1||number>13)return;
   const next=number===13?1:number+1;
   const candidates=Array.from(ui.cardPile.childNodes).filter(card=>get.number(card,false)===next);
   if(candidates.length&&alive(player))await player.gain(candidates[get.rand(0,candidates.length-1)],'gain2');
  }
 }
 api.tiaozhan={state,ordinal,randomOptions,option2Candidates,recordDiscard,sourceUse,qualifyingCards,physicalCards,frameFor,execute,isNoCount};
 const skills={
  [MAIN]:{
   locked:true,forced:true,popup:false,firstDo:true,priority:100,
   trigger:{player:'useCard0'},group:[TRACK],
   init(player){state(player);},
   filter(event,player){return event.name==='useCard'&&!!event.card&&player.hasSkill(MAIN)&&!completed.has(event)&&ordinal(event,player)<=28;},
   async content(event,trigger,player){
    if(completed.has(trigger)||!skills[MAIN].filter(trigger,player))return;
    completed.add(trigger);
    const frame=frameFor(trigger,player);frame.options=randomOptions();
    state(player).lastCount=Math.max(state(player).lastCount,frame.ordinal);player.logSkill(MAIN);
    game.log(player,'的挑战第',frame.ordinal,'次，随机执行选项',frame.options.join('、'));
    for(const option of frame.options)await execute(frame,option);
    player.markSkill(MAIN);
   },
   mark:true,marktext:'挑',
   intro:{content(storage,player){const s=state(player);return `挑战随机效果已结算${Math.min(28,s.lastCount)}次；前28次使用触发随机效果。已记录牌名：${s.recorded.length?get.translation(s.recorded):'无'}。`;}}
  },
  [TRACK]:{
   charlotte:true,forced:true,popup:false,firstDo:true,priority:10000,
   trigger:{global:['cardsDiscardEnd','loseAfter']},
   filter(event,player){return qualifyingCards(event,player).length>0;},
   async content(event,trigger,player){recordDiscard(trigger,player);},
  },
  [EFFECT]:{
   charlotte:true,forced:true,popup:false,firstDo:true,priority:90,
   trigger:{player:'useCard0'},
   filter(event,player){return event.name==='useCard'&&!!event.card&&!drawn.has(event)&&frameFor(event,player).recordedBefore;},
   async content(event,trigger,player){
    if(drawn.has(trigger)||!frameFor(trigger,player).recordedBefore)return;
    drawn.add(trigger);state(player).lastCount=Math.max(state(player).lastCount,frameFor(trigger,player).ordinal);
    if(alive(player))await player.draw(1);
   },
   mod:{
    maxHandcard(player,num){return num+state(player).handLimit;},
    cardUsable(card,player){if(isNoCount(card,player))return Infinity;},
   },
   mark:true,marktext:'战',
   intro:{content(storage,player){const s=state(player);return `本局手牌上限+${s.handLimit}；使用已记录牌名摸一张牌：${s.recorded.length?get.translation(s.recorded):'尚无记录'}。首次记录当张不摸。`;}}
  },
 };
 return {skills,translate:{
  [MAIN]:'挑战',
  [MAIN+'_info']:'锁定技，本局你使用的前28张牌时，先等概率随机抽取1至6个选项，再随机选取相应数量的不同选项，按序执行：①此牌不计次且无次数限制；②随机获得弃牌堆中一张曾因你使用而进入弃牌堆的实体牌（包括转化材料，且此时仍在弃牌堆）；③本局游戏手牌上限+1；④此牌不能被响应；⑤若此牌牌名尚未记录，记录此牌牌名；本局你使用此前已记录牌名的牌时摸一张牌（首次记录当张不摸，超过前28张后仍生效，重复记录不叠加摸牌数）；⑥随机获得牌堆中一张点数比此牌大1的牌，K接A。找不到符合条件的牌则不获得且不补抽；仅使用计数，打出不计。',
  [EFFECT]:'挑战·余势',[EFFECT+'_info']:'挑战已获得的本局游戏持续效果：手牌上限增加，以及使用已记录牌名时摸一张牌。首次记录当张不摸。已获得效果不因失去或封印挑战而移除。',
  [TRACK]:'挑战',
 }};
};
 const api={};
 const modules=[createFue(lib,game,ui,get,ai,_status,api),createChallenge(lib,game,ui,get,ai,_status,api)];
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 const dynamicTranslate=Object.assign({},...modules.map(module=>module.dynamicTranslate||{}));
 return {
  name:'Tibo',editable:true,connect:false,
  async content(...args){for(const module of modules)if(module.content)await module.content.apply(this,args);},
  async precontent(...args){for(const module of modules)if(module.precontent)await module.precontent.apply(this,args);},
  help:{},config:{},
  package:{
   character:{character:{bjgy_tibo:['male','qun',3,['bjgy_tibo_fue','bjgy_tibo_tiaozhan'],['die:false','ext:Tibo/bjgy_tibo.jpg']]},
    translate:{bjgy_tibo:'Tibo'},characterIntro:{bjgy_tibo:'原创武将Tibo。群势力，男性，体力/体力上限3/3。技能设计：辟境归元；代码与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'},dynamicTranslate},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'Tibo：群、男、3/3。复额与挑战，按设计者确认规则制作，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_tibo.jpg'],card:[],skill:[],audio:[]}
 };
});
