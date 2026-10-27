/* Shared student practice levels. Reads fresh batch settings for every page load. */
(function(){
'use strict';
const client=window.supabase.createClient("https://portal-bridge.ucmas-ambernath-pg.workers.dev","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk");
let loading=null;
async function get(){
  if(loading) return loading;
  loading=(async()=>{
    const {data:{session},error:authError}=await client.auth.getSession();
    if(authError||!session) throw new Error('Please sign in to continue.');
    const {data,error}=await client.rpc('student_practice_settings_get');
    if(error) throw new Error('Practice settings unavailable. Please refresh or contact your teacher.');
    const official=Number(data?.official_level);
    if(!Number.isInteger(official)||official<1||official>8) throw new Error('Invalid official level.');
    const out={official_level:official};
    for(const name of ['plusminus','multiplication','division']){
      const value=Number(data?.[name]);
      if(!Number.isInteger(value)||value<1||value>official)
        throw new Error('Practice level is not configured correctly.');
      out[name]=value;
    }
    return out;
  })();
  try{return await loading;}catch(e){loading=null;throw e;}
}
window.BatchPracticeAccess={get};
})();
