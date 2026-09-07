// Keep fullscreen independent of the game and 3D loading state.
const button=document.getElementById('fullscreenToggle');
const label=document.getElementById('fullscreenLabel');
const message=document.getElementById('fullscreenMessage');
const target=document.documentElement;

if(button && typeof target.requestFullscreen==='function' &&
   typeof document.exitFullscreen==='function' && document.fullscreenEnabled) {
  let pending=false;
  function sync() {
    const active=document.fullscreenElement===target;
    button.setAttribute('aria-pressed',String(active));
    label.textContent=active?'Afslut fuldskærm':'Fuldskærm';
    button.title=active?'Afslut fuldskærm (Esc)':'Vis hele spillet i fuldskærm';
    button.disabled=pending;
  }
  button.hidden=false;
  document.addEventListener('fullscreenchange',sync);
  button.addEventListener('click',async()=>{
    if(pending)return;
    pending=true;
    message.hidden=true;
    sync();
    try {
      if(document.fullscreenElement===target)await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch {
      message.textContent='Browseren kunne ikke skifte fuldskærm. Prøv igen, eller brug browserens egen fuldskærmsfunktion.';
      message.hidden=false;
    } finally {
      pending=false;
      sync();
    }
  });
  document.addEventListener('keydown',event=>{
    // Leave an open promotion dialog's Escape behavior to the dialog.
    if(event.key==='Escape' && !event.defaultPrevented &&
       document.fullscreenElement===target && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      button.click();
    }
  });
  sync();
}
