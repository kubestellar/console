package main

// watchdogFallbackHTML is served when the backend is unreachable.
// It matches the KubeStellar Console branding (dark theme + star field)
// and auto-reloads when the backend becomes healthy.
const watchdogFallbackHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KubeStellar Console — Reconnecting</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
.wrap{text-align:center;max-width:420px;padding:2rem}
.ring-wrap{position:relative;width:80px;height:80px;margin:0 auto 1.5rem}
.ring{width:80px;height:80px;border:3px solid rgba(99,102,241,.15);border-top-color:#6366f1;border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
h1{font-size:1.25rem;font-weight:500;margin-bottom:.5rem}
p{color:#94a3b8;font-size:.875rem;line-height:1.5}
.status{margin-top:1rem;font-size:.8rem;color:#64748b}
.retry-btn{display:inline-block;margin-top:1.25rem;padding:.5rem 1.25rem;background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.3);border-radius:.5rem;font-size:.875rem;cursor:pointer;text-decoration:none;transition:all .2s}
.retry-btn:hover{background:rgba(99,102,241,.25);border-color:rgba(99,102,241,.5)}
.stars{position:fixed;inset:0;pointer-events:none}
.star{position:absolute;width:2px;height:2px;background:#fff;border-radius:50%;opacity:.3;animation:twinkle 3s ease-in-out infinite}
@keyframes twinkle{0%,100%{opacity:.2}50%{opacity:.6}}
</style>
</head>
<body>
<div class="stars" id="stars"></div>
<div class="wrap">
<div class="ring-wrap">
<div class="ring"></div>
</div>
<h1>Reconnecting to KubeStellar Console</h1>
<p>The console is restarting or updating. This page will reload automatically when it's ready.</p>
<div class="status" id="status">Checking connection…</div>
<a href="/" class="retry-btn" id="retry" onclick="checkNow();return false;">Retry now</a>
</div>
<script>
// Star field
(function(){var s=document.getElementById('stars');for(var i=0;i<30;i++){var d=document.createElement('div');d.className='star';d.style.left=Math.random()*100+'%';d.style.top=Math.random()*100+'%';d.style.animationDelay=Math.random()*3+'s';s.appendChild(d)}})();

var POLL_INTERVAL_MS=2000;
var FORCE_RELOAD_MS=60000; // Force-reload after 60s to recover from stale connections
var attempts=0;
var startTime=Date.now();
var statusEl=document.getElementById('status');
var reloading=false;

function doReload(){
  if(reloading)return;
  reloading=true;
  statusEl.textContent='Reloading…';
  clearInterval(pollTimer);
  location.reload();
}

async function checkNow(){
  if(reloading)return;
  attempts++;
  statusEl.textContent='Checking connection…';

  // Force-reload after max wait — handles stale connections, pod restarts, proxy changes
  if(Date.now()-startTime>FORCE_RELOAD_MS){
    doReload();
    return;
  }

  // Primary check: watchdog health endpoint
  try{
    var r=await fetch('/watchdog/health',{cache:'no-store'});
    if(r.ok){
      var d=await r.json();
      if(d.backend==='ok'){
        statusEl.textContent='Backend is ready! Reloading…';
        clearInterval(pollTimer);
        var waitSec=Math.floor((Date.now()-startTime)/1000);
        if(typeof gtag==='function'){
          gtag('event','watchdog_reconnect',{attempts:attempts,wait_seconds:waitSec});
        }else{
          try{navigator.sendBeacon('/api/telemetry/watchdog',JSON.stringify({event:'watchdog_reconnect',attempts:attempts,wait_seconds:waitSec}))}catch(e){}
        }
        setTimeout(function(){doReload();},500);
        return;
      }
    }
  }catch(e){}

  // Fallback check: if watchdog health fails, try HEAD on root — catches pod restarts
  // where the old watchdog is gone but the new one (with backend) is already up
  try{
    var h=await fetch('/',{method:'HEAD',cache:'no-store'});
    if(h.ok && h.headers.get('content-type') && !h.headers.get('content-type').includes('text/html')){
      // Got a non-HTML 200 from root — backend is serving the SPA (JS/asset)
      doReload();
      return;
    }
    // Even an HTML 200 might be the app — check if it's NOT the fallback page
    if(h.ok && h.status===200){
      var len=h.headers.get('content-length');
      // Fallback page is small (~2KB); the real SPA index.html is larger
      if(len && parseInt(len,10)>5000){
        doReload();
        return;
      }
    }
  }catch(e){}

  statusEl.textContent='Waiting for backend…';
}

// Poll on interval
var pollTimer=setInterval(checkNow,POLL_INTERVAL_MS);
// First check immediately
checkNow();
</script>
</body>
</html>` + "\n"
