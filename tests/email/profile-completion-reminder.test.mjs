import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEmail } from '../../src/lib/email-templates.ts';
import { needsProfileReminder, processProfileCompletionReminders } from '../../src/lib/alerts/profile-completion-reminders.ts';

test('incomplete and missing profiles are eligible; completed and inactive accounts stop', () => {
  const account = {email:'member@example.com',account_status:'active'};
  for (const profile of [null, {}, {profile_completed:false}, {profile_completed:null}]) assert.equal(needsProfileReminder(account, profile),true);
  assert.equal(needsProfileReminder(account,{profile_completed:true}),false);
  for (const status of ['banned','deactivated','deletion_requested']) assert.equal(needsProfileReminder({...account,account_status:status},null),false);
  assert.equal(needsProfileReminder({...account,email:null},null),false);
});
test('template escapes names and links directly to production profile and settings', () => {
  const {subject,html}=generateEmail('profile_completion_reminder',{recipientName:'<img src=x onerror=alert(1)>'});
  assert.match(subject,/Finish your MatchIndeed profile/);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html,/&lt;img/);
  assert.match(html,/https:\/\/matchindeed.com\/dashboard\/profile\/edit/);
  assert.match(html,/https:\/\/matchindeed.com\/dashboard\/settings/);
  assert.match(html,/daily until you finish/);
  assert.ok(!html.includes('localhost'));
});
test('does not query or send before daily send hour', async () => {
  const result=await processProfileCompletionReminders({},new Date('2026-09-05T08:59:00Z'));
  assert.equal(result.beforeSendHour,true);
  assert.equal(result.sent,0);
});

function fakeDatabase(responses) {
  return { from(table) {
    const expected=responses.shift();
    assert.ok(expected,`unexpected query for ${table}`);
    assert.equal(table,expected.table);
    const query=new Proxy({}, {get(_,method) {
      if(method==='then') return (resolve)=>resolve(expected.result);
      return (...args)=>{ expected.calls?.push([method,...args]); return query; };
    }});
    return query;
  }};
}
const active={id:'00000000-0000-0000-0000-000000000001',email:'member@example.com',account_status:'active'};
const now=new Date('2026-09-05T09:00:00Z');
for (const status of ['sent','skipped','processing','failed']) {
  test(`already ${status} today or recently attempted cannot be sent twice`,async()=>{
    process.env.RESEND_API_KEY='test-only';
    const responses=[
      {table:'accounts',result:{data:[active]}},
      {table:'user_profiles',result:{data:{profile_completed:false}}},
      {table:'user_alert_digest_runs',result:{data:{id:'run',status,updated_at:'2026-09-05T08:59:00Z'}}},
    ];
    const result=await processProfileCompletionReminders(fakeDatabase(responses),now);
    assert.equal(result.sent,0);assert.equal(result.skipped,1);assert.equal(responses.length,0);
  });
}
test('concurrent insert losing uniqueness claim does not send',async()=>{
  process.env.RESEND_API_KEY='test-only';
  const responses=[
    {table:'accounts',result:{data:[active]}},
    {table:'user_profiles',result:{data:{profile_completed:false}}},
    {table:'user_alert_digest_runs',result:{data:null}},
    {table:'user_alert_digest_runs',result:{error:{code:'23505'}}},
  ];
  const result=await processProfileCompletionReminders(fakeDatabase(responses),now);
  assert.equal(result.sent,0);assert.equal(result.skipped,1);assert.equal(responses.length,0);
});
test('stale failed run is reclaimed atomically and completion is rechecked',async()=>{
  process.env.RESEND_API_KEY='test-only';
  const calls=[];
  const responses=[
    {table:'accounts',result:{data:[active]}},
    {table:'user_profiles',result:{data:{profile_completed:false}}},
    {table:'user_alert_digest_runs',result:{data:{id:'run',status:'failed',updated_at:'2026-09-05T08:00:00Z'}}},
    {table:'user_alert_digest_runs',calls,result:{data:{id:'run'}}},
    {table:'accounts',result:{data:active}},
    {table:'user_profiles',result:{data:{profile_completed:true}}},
    {table:'user_alert_digest_runs',result:{}},
  ];
  const result=await processProfileCompletionReminders(fakeDatabase(responses),now);
  assert.equal(result.sent,0);assert.equal(result.skipped,1);assert.equal(responses.length,0);
  assert.ok(calls.some(c=>c[0]==='eq' && c[1]==='updated_at' && c[2]==='2026-09-05T08:00:00Z'));
});
