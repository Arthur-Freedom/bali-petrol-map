// Runs before external scripts: remove the OAuth fragment immediately.
(()=>{
  const key='bali-cinema-owner-session', pattern=/^remembered\.[A-Za-z0-9_-]{43}$/;
  let handle='',error='';
  try{handle=localStorage.getItem(key)||sessionStorage.getItem(key)||'';}catch{}
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.has('owner-session')||hash.has('owner-error')){
    const value=hash.get('owner-session');error=hash.get('owner-error')||'';
    history.replaceState(null,'',location.pathname+location.search);
    if(pattern.test(value||'')){handle=value;try{localStorage.setItem(key,handle)}catch{try{sessionStorage.setItem(key,handle)}catch{}}}
  }
  if(!pattern.test(handle))handle='';
  window.PetrolOwner={get:()=>handle,error,clear(){handle='';try{localStorage.removeItem(key);sessionStorage.removeItem(key)}catch{}},key};
  addEventListener('storage',event=>{if(event.key===key){handle=pattern.test(event.newValue||'')?event.newValue:'';dispatchEvent(new Event('owner-session-change'));}});
})();
