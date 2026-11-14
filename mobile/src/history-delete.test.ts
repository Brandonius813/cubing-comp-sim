import assert from 'node:assert/strict';
import test from 'node:test';
import { emptySave, recordResult, createDraft, validateMobileSave } from './practice';
import { deleteHistoryAttempt, deleteHistoryRound, exportHistory } from './history';
import { scoreRound } from '../../src/core/scoring';
const scramble={eventId:'333' as const,notation:'R U',svg:'<svg/>',engineVersion:'test',generatedAt:1};
const result={rawMs:10000,penalty:'none' as const,inputMethod:'timer' as const};
test('delete a historical solve reindexes attempts, clears completion, and preserves the current round and draft',()=>{
 let save=emptySave();for(let i=0;i<6;i++)save=recordResult(save,scramble,result);
 const draft=createDraft(scramble,save.preferences);save={...save,draft};
 const old=save.history.rounds[0];const next=deleteHistoryAttempt(save,old.id,old.attempts[1].id);
 assert.deepEqual(next.history.rounds[0].attempts.map(a=>a.index),[0,1,2,3]);
 assert.equal(next.history.rounds[0].completedAt,undefined);assert.equal(scoreRound(next.history.rounds[0]).status,'incomplete');
 assert.equal(next.history.activeRoundId,save.history.activeRoundId);assert.deepEqual(next.draft,draft);
 assert.doesNotThrow(()=>validateMobileSave(JSON.parse(JSON.stringify(next))));assert.equal(JSON.parse(exportHistory(next)).rounds[0].attempts.length,4);
});
test('deleting last active solve removes its empty round without discarding next scramble',()=>{
 let save=recordResult(emptySave(),scramble,result);save={...save,draft:createDraft(scramble,save.preferences)};
 const round=save.history.rounds[0];const next=deleteHistoryAttempt(save,round.id,round.attempts[0].id);
 assert.equal(next.history.rounds.length,0);assert.equal(next.history.activeRoundId,null);assert.deepEqual(next.draft,save.draft);
});
test('delete round targets its id and does not change the input save',()=>{
 let save=emptySave();for(let i=0;i<6;i++)save=recordResult(save,scramble,result);
 const next=deleteHistoryRound(save,save.history.rounds[0].id);assert.equal(next.history.rounds.length,1);assert.equal(save.history.rounds.length,2);assert.equal(next.history.activeRoundId,save.history.activeRoundId);
 assert.throws(()=>deleteHistoryRound(save,'missing'));assert.throws(()=>deleteHistoryAttempt(save,save.history.rounds[0].id,'missing'));
});
