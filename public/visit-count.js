// Counts information-page visits using the same random browser ID as the simulator.
// No URL query, hash, account data, or page contents are collected.
(() => {
  if (location.origin !== 'https://cubingcompsim.com') return;
  try {
    let visitor = localStorage.getItem('ccs-observed-browser');
    if (!visitor || !/^[0-9a-f-]{36}$/i.test(visitor)) { visitor = crypto.randomUUID(); localStorage.setItem('ccs-observed-browser',visitor); }
    const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    void fetch('https://mrxbjdkhtnojgoskhrfx.supabase.co/functions/v1/observability', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'visit',visitor,day,referrer:document.referrer}),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)}).catch(()=>{});
  } catch { /* Site information remains usable without storage or tracking. */ }
})();
